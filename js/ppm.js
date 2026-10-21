/**
 * js/ppm.js
 * Samodzielna implementacja obsługi formatu PPM (Portable Pixmap):
 * - Odczyt formatów P3 (tekstowy / ASCII) oraz P6 (binarny / Raw)
 * - Zapis do formatów P3 oraz P6
 * - Odporny parser nagłówków (obsługa komentarzy # w dowolnym miejscu, obsługa Windows CRLF, wielokrotnych spacji)
 * - Ekstrakcja komentarzy nagłówka do wyświetlenia użytkownikowi
 * - Obsługa skalowania próbek dla dowolnego maxVal (w tym próbek 16-bitowych w P6 i P3)
 * - Odporność na błędy: szczegółowe, przyjazne komunikaty błędów bez zawieszania aplikacji
 * - Bez zewnętrznych bibliotek (czysty JavaScript, TypedArrays, Blob)
 */

(function () {
  'use strict';

  /**
   * Klasa błędu specyficznego dla operacji na plikach PPM.
   */
  class PPMError extends Error {
    constructor(message) {
      super(message);
      this.name = 'PPMError';
    }
  }

  /**
   * Pomocniczy odczyt pojedynczej linii komentarza (#).
   * Zakłada, że buffer[state.offset] wskazuje na znak '#' (ASCII 35).
   * Przewija do końca linii (CR lub LF) i gromadzi tekst komentarza.
   * @param {Uint8Array} buffer 
   * @param {{ offset: number }} state 
   * @param {string[]} [commentsList] 
   */
  function readCommentLine(buffer, state, commentsList = null) {
    state.offset++; // Pomiń znak '#'
    const commentStart = state.offset;
    const len = buffer.length;
    while (state.offset < len && buffer[state.offset] !== 10 && buffer[state.offset] !== 13) {
      state.offset++;
    }
    if (commentsList) {
      let commentText = '';
      for (let i = commentStart; i < state.offset; i++) {
        commentText += String.fromCharCode(buffer[i]);
      }
      const trimmed = commentText.trim();
      if (trimmed.length > 0) {
        commentsList.push(trimmed);
      }
    }
  }

  /**
   * Pomocniczy skaner pomijający białe znaki i komentarze rozpoczynające się od '#'.
   * Opcjonalnie gromadzi treść komentarzy do przekazania w metadanych pliku.
   * @param {Uint8Array} buffer 
   * @param {{ offset: number }} state 
   * @param {string[]} [commentsList] 
   */
  function skipWhitespaceAndComments(buffer, state, commentsList = null) {
    const len = buffer.length;
    while (state.offset < len) {
      const b = buffer[state.offset];

      // Białe znaki: spacja (32), tab (9), LF (10), VT (11), FF (12), CR (13)
      if (b === 32 || b === 9 || b === 10 || b === 11 || b === 12 || b === 13) {
        state.offset++;
        continue;
      }

      // Komentarz: kod ASCII 35 to znak '#'
      if (b === 35) {
        readCommentLine(buffer, state, commentsList);
        continue;
      }

      // Napotkano początek właściwego tokenu
      break;
    }
  }

  /**
   * Odczytuje pojedynczy token tekstowy (ciąg znaków niebędący białym znakiem ani komentarzem).
   * @param {Uint8Array} buffer 
   * @param {{ offset: number }} state 
   * @param {string[]} [commentsList]
   * @returns {string|null}
   */
  function readToken(buffer, state, commentsList = null) {
    skipWhitespaceAndComments(buffer, state, commentsList);
    if (state.offset >= buffer.length) return null;

    const start = state.offset;
    while (state.offset < buffer.length) {
      const b = buffer[state.offset];
      if (b === 32 || b === 9 || b === 10 || b === 11 || b === 12 || b === 13 || b === 35) {
        break;
      }
      state.offset++;
    }

    let token = '';
    for (let i = start; i < state.offset; i++) {
      token += String.fromCharCode(buffer[i]);
    }
    return token;
  }

  /**
   * Szybki odczyt nieujemnej liczby całkowitej z bufora ASCII bez tworzenia obiektów String.
   * Znacząco przyspiesza parsowanie wielomegapikselowych plików P3.
   * @param {Uint8Array} buffer 
   * @param {{ offset: number }} state 
   * @param {string[]} [commentsList]
   * @returns {number|null} Liczba całkowita, null (koniec bufora) lub NaN (błędne znaki)
   */
  function readInt(buffer, state, commentsList = null) {
    skipWhitespaceAndComments(buffer, state, commentsList);
    if (state.offset >= buffer.length) return null;

    let val = 0;
    let hasDigits = false;
    while (state.offset < buffer.length) {
      const b = buffer[state.offset];
      if (b >= 48 && b <= 57) { // '0'..'9'
        val = val * 10 + (b - 48);
        hasDigits = true;
        state.offset++;
      } else {
        break;
      }
    }

    if (!hasDigits) {
      // Pomiń niepoprawny ciąg znaków, aby wskazać błąd
      while (state.offset < buffer.length && buffer[state.offset] > 32 && buffer[state.offset] !== 35) {
        state.offset++;
      }
      return NaN;
    }

    return val;
  }

  const PaintPPM = {
    PPMError,

    /**
     * Parsuje bufor pliku PPM (P3 lub P6).
     * @param {ArrayBuffer} arrayBuffer - Zawartość pliku z FileReader
     * @returns {{ type: 'P3'|'P6', width: number, height: number, maxVal: number, comments: string[], imageData: ImageData }}
     */
    parse(arrayBuffer) {
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new PPMError('Plik jest pusty (0 bajtów).');
      }

      const buffer = new Uint8Array(arrayBuffer);
      const state = { offset: 0 };
      const comments = [];

      // 1. Odczyt sygnatury (Magic Number)
      const magic = readToken(buffer, state, comments);
      if (!magic) {
        throw new PPMError('Plik jest zbyt krótki: nie znaleziono sygnatury pliku w nagłówku.');
      }

      if (magic !== 'P3' && magic !== 'P6') {
        if (magic === 'P1' || magic === 'P4') {
          throw new PPMError(`Nieobsługiwany format: ${magic} (obraz czarno-biały PBM). Ten program obsługuje wyłącznie obrazy barwne PPM (P3 i P6).`);
        }
        if (magic === 'P2' || magic === 'P5') {
          throw new PPMError(`Nieobsługiwany format: ${magic} (obraz w odcieniach szarości PGM). Ten program obsługuje wyłącznie obrazy barwne PPM (P3 i P6).`);
        }
        throw new PPMError(`Nieprawidłowa sygnatura formatu: "${magic}". Oczekiwano "P3" (PPM tekstowy) lub "P6" (PPM binarny).`);
      }

      // 2. Odczyt szerokości obrazu
      const width = readInt(buffer, state, comments);
      if (width === null) {
        throw new PPMError('Nieoczekiwany koniec pliku: brak szerokości obrazu w nagłówku.');
      }
      if (isNaN(width) || width <= 0) {
        throw new PPMError('Niepoprawna szerokość obrazu w nagłówku PPM. Szerokość musi być dodatnią liczbą całkowitą.');
      }

      // 3. Odczyt wysokości obrazu
      const height = readInt(buffer, state, comments);
      if (height === null) {
        throw new PPMError('Nieoczekiwany koniec pliku: brak wysokości obrazu w nagłówku.');
      }
      if (isNaN(height) || height <= 0) {
        throw new PPMError('Niepoprawna wysokość obrazu w nagłówku PPM. Wysokość musi być dodatnią liczbą całkowitą.');
      }

      // Zabezpieczenie przed skrajnymi wymiarami powodującymi zawieszenie lub brak pamięci
      if (width > 8192 || height > 8192) {
        throw new PPMError(`Wymiary obrazu (${width} × ${height}) przekraczają maksymalny dopuszczalny limit kanwy (8192 px).`);
      }

      // 4. Odczyt maksymalnej wartości koloru (maxVal)
      const maxVal = readInt(buffer, state, comments);
      if (maxVal === null) {
        throw new PPMError('Nieoczekiwany koniec pliku: brak parametru maxVal w nagłówku PPM.');
      }
      if (isNaN(maxVal) || maxVal <= 0 || maxVal > 65535) {
        throw new PPMError(`Niepoprawna maksymalna wartość koloru (maxVal): ${maxVal}. Wartość musi należeć do zakresu od 1 do 65535.`);
      }

      const totalPixels = width * height;
      const imageData = new ImageData(width, height);
      const rgba = imageData.data; // Uint8ClampedArray: [R, G, B, A, R, G, B, A...]

      // 5. Parsowanie danych rastrowych w zależności od formatu P6 / P3
      if (magic === 'P6') {
        const is16Bit = maxVal > 255;
        const bytesPerSample = is16Bit ? 2 : 1;
        const expectedBytes = totalPixels * 3 * bytesPerSample;

        // Konsumpcja separatora nagłówka i opcjonalnego komentarza w linii maxVal:
        let isInlineComment = false;
        if (state.offset < buffer.length && buffer[state.offset] === 35) {
          isInlineComment = true;
        } else if (state.offset < buffer.length && (buffer[state.offset] === 32 || buffer[state.offset] === 9)) {
          // Sprawdzamy czy po spacjach/tabulatorach występuje znak '#' komentarza w tej samej linii
          let p = state.offset;
          while (p < buffer.length && (buffer[p] === 32 || buffer[p] === 9)) {
            p++;
          }
          if (p < buffer.length && buffer[p] === 35) {
            let nl = p + 1;
            while (nl < buffer.length && buffer[nl] !== 10 && buffer[nl] !== 13) {
              nl++;
            }
            const afterNl = (nl < buffer.length && buffer[nl] === 13 && nl + 1 < buffer.length && buffer[nl + 1] === 10) ? nl + 2 : nl + 1;
            if (buffer.length - afterNl >= expectedBytes) {
              state.offset = p;
              isInlineComment = true;
            }
          }
        }

        if (isInlineComment) {
          readCommentLine(buffer, state, comments);
          // Zużyj znak nowej linii kończący komentarz
          if (state.offset < buffer.length) {
            if (buffer[state.offset] === 13 && state.offset + 1 < buffer.length && buffer[state.offset + 1] === 10) {
              state.offset += 2; // CRLF
            } else if (buffer[state.offset] === 10 || buffer[state.offset] === 13) {
              state.offset += 1;
            }
          }
        } else {
          // Zużyj dokładnie jeden biały znak (lub Windows CRLF) jako separator nagłówka od danych rastrowych
          if (state.offset < buffer.length) {
            if (buffer[state.offset] === 13 && state.offset + 1 < buffer.length && buffer[state.offset + 1] === 10) {
              state.offset += 2; // Windows CRLF
            } else if (buffer[state.offset] === 10 || buffer[state.offset] === 13 || buffer[state.offset] === 32 || buffer[state.offset] === 9) {
              state.offset += 1; // Dokładnie 1 biały znak (LF, CR, spacja lub tab)
            }
          }
        }

        // Zgodnie ze specyfikacją Netpbm dane binarne P6 rozpoczynają się bezpośrednio po pojedynczym separatorze
        // i nie dopuszczają żadnych komentarzy wewnątrz rastra.
        const availableBytes = buffer.length - state.offset;
        if (availableBytes < expectedBytes) {
          throw new PPMError(`Plik P6 jest uszkodzony lub ucięty. Oczekiwano ${expectedBytes} bajtów danych rastrowych (${width} × ${height} pikseli), a plik zawiera tylko ${availableBytes} bajtów.`);
        }

        let srcIdx = state.offset;
        let dstIdx = 0;

        if (!is16Bit && maxVal === 255) {
          // Standardowa ścieżka 8-bitowa
          for (let i = 0; i < totalPixels; i++) {
            rgba[dstIdx]     = buffer[srcIdx];
            rgba[dstIdx + 1] = buffer[srcIdx + 1];
            rgba[dstIdx + 2] = buffer[srcIdx + 2];
            rgba[dstIdx + 3] = 255;
            srcIdx += 3;
            dstIdx += 4;
          }
        } else if (!is16Bit) {
          // maxVal < 255 (skalowanie proporcjonalne do pełnego zakresu 0 - 255 z walidacją)
          const scale = 255 / maxVal;
          for (let i = 0; i < totalPixels; i++) {
            const r = buffer[srcIdx];
            const g = buffer[srcIdx + 1];
            const b = buffer[srcIdx + 2];

            if (r > maxVal || g > maxVal || b > maxVal) {
              const inv = Math.max(r, g, b);
              throw new PPMError(`Wartość składowej koloru (${inv}) przekracza zadeklarowane maxVal (${maxVal}) przy pikselu ${i}.`);
            }

            rgba[dstIdx]     = Math.min(255, Math.round(r * scale));
            rgba[dstIdx + 1] = Math.min(255, Math.round(g * scale));
            rgba[dstIdx + 2] = Math.min(255, Math.round(b * scale));
            rgba[dstIdx + 3] = 255;
            srcIdx += 3;
            dstIdx += 4;
          }
        } else {
          // maxVal > 255: próbki 16-bitowe w formacie Big-Endian
          const scale = 255 / maxVal;
          for (let i = 0; i < totalPixels; i++) {
            const r16 = (buffer[srcIdx] << 8) | buffer[srcIdx + 1];
            const g16 = (buffer[srcIdx + 2] << 8) | buffer[srcIdx + 3];
            const b16 = (buffer[srcIdx + 4] << 8) | buffer[srcIdx + 5];

            if (r16 > maxVal || g16 > maxVal || b16 > maxVal) {
              const inv = Math.max(r16, g16, b16);
              throw new PPMError(`Wartość 16-bitowej składowej koloru (${inv}) przekracza zadeklarowane maxVal (${maxVal}) przy pikselu ${i}.`);
            }

            rgba[dstIdx]     = Math.min(255, Math.round(r16 * scale));
            rgba[dstIdx + 1] = Math.min(255, Math.round(g16 * scale));
            rgba[dstIdx + 2] = Math.min(255, Math.round(b16 * scale));
            rgba[dstIdx + 3] = 255;

            srcIdx += 6;
            dstIdx += 4;
          }
        }
      } else {
        // Format P3 (tekstowy / ASCII)
        // W formacie P3 komentarze i białe znaki mogą występować w dowolnym miejscu pomiędzy wartościami składowych
        const scale = maxVal === 255 ? 1 : (255 / maxVal);
        let dstIdx = 0;

        for (let i = 0; i < totalPixels; i++) {
          const r = readInt(buffer, state, comments);
          const g = readInt(buffer, state, comments);
          const b = readInt(buffer, state, comments);

          if (r === null || g === null || b === null) {
            throw new PPMError(`Uszkodzony plik P3: plik ucięty przy pikselu ${i} z ${totalPixels}.`);
          }

          if (isNaN(r) || isNaN(g) || isNaN(b) || r < 0 || g < 0 || b < 0) {
            throw new PPMError(`Nieprawidłowe wartości w strumieniu pikseli P3 przy pikselu ${i}. Oczekiwano nieujemnych liczb całkowitych.`);
          }

          if (r > maxVal || g > maxVal || b > maxVal) {
            const inv = Math.max(r, g, b);
            throw new PPMError(`Wartość składowej koloru (${inv}) przekracza zadeklarowane maxVal (${maxVal}) przy pikselu ${i}.`);
          }

          rgba[dstIdx]     = scale === 1 ? r : Math.min(255, Math.round(r * scale));
          rgba[dstIdx + 1] = scale === 1 ? g : Math.min(255, Math.round(g * scale));
          rgba[dstIdx + 2] = scale === 1 ? b : Math.min(255, Math.round(b * scale));
          rgba[dstIdx + 3] = 255;
          dstIdx += 4;
        }
      }

      return {
        type: magic,
        width,
        height,
        maxVal,
        comments,
        imageData
      };
    },

    /**
     * Eksportuje obiekt ImageData do formatu binarnego PPM P6.
     * @param {ImageData} imageData 
     * @param {{ comment?: string }} [options]
     * @returns {Blob}
     */
    encodeP6(imageData, options = {}) {
      if (!imageData || !imageData.width || !imageData.height) {
        throw new PPMError('Brak prawidłowego obiektu ImageData do zapisu.');
      }

      const { width, height, data } = imageData;
      const rawComment = (options && options.comment !== undefined) ? String(options.comment) : 'Utworzono w GK Paint';
      const cleanComment = rawComment.replace(/[\r\n]+/g, ' ').trim();
      const customComment = cleanComment ? `# ${cleanComment}\n` : '';
      const headerStr = `P6\n${customComment}${width} ${height}\n255\n`;
      const headerBytes = new TextEncoder().encode(headerStr);

      const totalPixels = width * height;
      const rgbBytes = new Uint8Array(totalPixels * 3);

      let srcIdx = 0;
      let dstIdx = 0;

      for (let i = 0; i < totalPixels; i++) {
        const a = data[srcIdx + 3];
        if (a < 255) {
          // Kompozycja z białym tłem dla pikseli półprzezroczystych (format PPM nie ma kanału alfa)
          const alpha = a / 255;
          rgbBytes[dstIdx]     = Math.round(data[srcIdx] * alpha + 255 * (1 - alpha));
          rgbBytes[dstIdx + 1] = Math.round(data[srcIdx + 1] * alpha + 255 * (1 - alpha));
          rgbBytes[dstIdx + 2] = Math.round(data[srcIdx + 2] * alpha + 255 * (1 - alpha));
        } else {
          rgbBytes[dstIdx]     = data[srcIdx];
          rgbBytes[dstIdx + 1] = data[srcIdx + 1];
          rgbBytes[dstIdx + 2] = data[srcIdx + 2];
        }
        srcIdx += 4;
        dstIdx += 3;
      }

      return new Blob([headerBytes, rgbBytes], { type: 'image/x-portable-pixmap' });
    },

    /**
     * Eksportuje obiekt ImageData do formatu tekstowego PPM P3.
     * Zgodnie ze specyfikacją Netpbm: linie nie przekraczają 70 znaków.
     * Używa buforowania blokowego (bloki 64 KiB) optymalizującego alokację pamięci w silniku V8 podczas synchronicznego generowania tekstu.
     * @param {ImageData} imageData 
     * @param {{ comment?: string }} [options]
     * @returns {Blob}
     */
    encodeP3(imageData, options = {}) {
      if (!imageData || !imageData.width || !imageData.height) {
        throw new PPMError('Brak prawidłowego obiektu ImageData do zapisu.');
      }

      const { width, height, data } = imageData;
      const rawComment = (options && options.comment !== undefined) ? String(options.comment) : 'Utworzono w GK Paint';
      const cleanComment = rawComment.replace(/[\r\n]+/g, ' ').trim();
      const customComment = cleanComment ? `# ${cleanComment}\n` : '';
      const chunks = [];
      chunks.push(`P3\n${customComment}${width} ${height}\n255\n`);

      let currentLine = '';
      let batch = '';
      const totalPixels = width * height;
      let srcIdx = 0;

      for (let i = 0; i < totalPixels; i++) {
        let r = data[srcIdx];
        let g = data[srcIdx + 1];
        let b = data[srcIdx + 2];
        const a = data[srcIdx + 3];

        if (a < 255) {
          const alpha = a / 255;
          r = Math.round(r * alpha + 255 * (1 - alpha));
          g = Math.round(g * alpha + 255 * (1 - alpha));
          b = Math.round(b * alpha + 255 * (1 - alpha));
        }
        srcIdx += 4;

        const triplet = `${r} ${g} ${b}`;

        // Zawijanie wierszy zgodnie ze specyfikacją Netpbm (maks. 70 znaków w wierszu)
        if (currentLine.length + triplet.length + 1 > 70) {
          batch += currentLine + '\n';
          currentLine = triplet;
        } else {
          currentLine = currentLine.length === 0 ? triplet : currentLine + ' ' + triplet;
        }

        // Akumulacja bloków 64 KiB dla optymalnej wydajności silnika V8
        if (batch.length > 65536) {
          chunks.push(batch);
          batch = '';
        }
      }

      if (currentLine.length > 0) {
        batch += currentLine + '\n';
      }
      if (batch.length > 0) {
        chunks.push(batch);
      }

      return new Blob(chunks, { type: 'image/x-portable-pixmap' });
    }
  };

  if (typeof window !== 'undefined') {
    window.PaintPPM = PaintPPM;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PaintPPM;
  }
})();

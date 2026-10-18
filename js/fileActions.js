/**
 * js/fileActions.js
 * Obsługa operacji wejścia/wyjścia (I/O):
 * - Nowy dokument
 * - Wczytywanie plików obrazów z dysku (PPM P3/P6 oraz standardowych PNG, JPG, WebP, BMP)
 * - Obsługa błędów uszkodzonych i nieobsługiwanych plików graficznych
 * - Zapis do formatów PPM (P3 tekstowy oraz P6 binarny), PNG oraz JPG
 * - Pobieranie plików z poziomu przeglądarki
 */

window.PaintFiles = {
  /**
   * Tworzy nowy, czysty dokument (1024 × 640 px z białym tłem).
   */
  newDocument() {
    if (window.PaintCanvas.history && window.PaintCanvas.history.isDirty) {
      if (!confirm('Utworzenie nowego dokumentu spowoduje utratę niezapisanego rysunku. Kontynuować?')) {
        return;
      }
    }
    window.PaintCanvas.setDimensions(1024, 640);
    window.PaintCanvas.clearToWhite(false);
    window.PaintCanvas.history.reset();
    window.PaintCanvas.history.markClean();
    window.PaintCanvas.fitToScreen();

    // Reset informacji o bieżącym pliku
    if (window.PaintState) {
      window.PaintState.set('currentFileInfo', null);
    }
    if (window.PaintUI && window.PaintUI.clearFileInfoDisplay) {
      window.PaintUI.clearFileInfoDisplay();
    }
  },

  /**
   * Otwiera okno dialogowe wyboru pliku i wczytuje obraz na kanwę.
   */
  openImageFile() {
    if (window.PaintCanvas.history && window.PaintCanvas.history.isDirty) {
      if (!confirm('Wczytanie nowego obrazu zastąpi obecny rysunek. Kontynuować?')) {
        return;
      }
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ppm, .pnm, image/x-portable-pixmap, image/png, image/jpeg, image/webp, image/bmp';

    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      this.loadImageFromFile(file);
    };

    input.click();
  },

  /**
   * Wczytuje obiekt File na płótno z automatycznym rozpoznaniem formatu PPM lub standardowych formatów rastrowych.
   * @param {File} file 
   */
  loadImageFromFile(file) {
    if (!file) return;

    const reader = new FileReader();

    reader.onerror = () => {
      if (window.PaintUI && window.PaintUI.showErrorModal) {
        window.PaintUI.showErrorModal('Błąd odczytu pliku', `Nie udało się odczytać pliku "${file.name}" z dysku.`);
      } else {
        alert(`Błąd odczytu pliku: ${file.name}`);
      }
    };

    reader.onload = (event) => {
      const arrayBuffer = event.target.result;
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        if (window.PaintUI && window.PaintUI.showErrorModal) {
          window.PaintUI.showErrorModal('Pusty plik', `Plik "${file.name}" jest pusty (0 bajtów).`);
        } else {
          alert('Wybrany plik jest pusty.');
        }
        return;
      }

      // Sprawdzenie czy plik jest formatem Netpbm / PPM na podstawie pierwszych bajtów lub rozszerzenia
      const headerBytes = new Uint8Array(arrayBuffer.slice(0, 3));
      const isNetpbmSignature = headerBytes[0] === 0x50 && // 'P'
        (headerBytes[1] >= 0x31 && headerBytes[1] <= 0x36); // '1' - '6'
      const isPpmExtension = /\.(ppm|pnm)$/i.test(file.name);

      if (isNetpbmSignature || isPpmExtension) {
        // Ścieżka parsera PPM
        try {
          if (!window.PaintPPM || !window.PaintPPM.parse) {
            throw new Error('Moduł parsera PPM (window.PaintPPM) nie został załadowany.');
          }

          const result = window.PaintPPM.parse(arrayBuffer);

          // Ustaw wymiary kanwy odpowiadające obrazowi PPM
          window.PaintCanvas.setDimensions(result.width, result.height);

          // Wklej zdekodowane piksele na główne płótno
          const { mainCtx } = window.PaintCanvas;
          mainCtx.putImageData(result.imageData, 0, 0);

          // Wyczyszczenie nakładki podglądu
          window.PaintCanvas.clearOverlay();

          // Zresetowanie historii operacji z oznaczeniem czystego stanu
          window.PaintCanvas.history.reset();
          window.PaintCanvas.history.markClean();

          // Dopasowanie powiększenia do okna roboczego
          window.PaintCanvas.fitToScreen();

          // Zapisanie metadanych pliku w stanie aplikacji
          const fileInfo = {
            name: file.name,
            type: result.type,
            width: result.width,
            height: result.height,
            maxVal: result.maxVal,
            comments: result.comments
          };
          window.PaintState.set('currentFileInfo', fileInfo);

          // Wyświetlenie informacji o nagłówku użytkownikowi w UI
          if (window.PaintUI && window.PaintUI.displayFileInfo) {
            window.PaintUI.displayFileInfo(fileInfo);
          }
        } catch (err) {
          console.error('Błąd parsowania pliku PPM:', err);
          if (window.PaintUI && window.PaintUI.showErrorModal) {
            window.PaintUI.showErrorModal(
              'Błąd pliku PPM',
              err.message || 'Wystąpił błąd podczas dekodowania pliku PPM.'
            );
          } else {
            alert(`Błąd pliku PPM: ${err.message}`);
          }
        }
      } else {
        // Standardowy obraz rastrowy (PNG, JPEG, WebP, BMP)
        const blob = new Blob([arrayBuffer], { type: file.type || 'image/png' });
        const blobUrl = URL.createObjectURL(blob);
        const img = new Image();

        img.onload = () => {
          URL.revokeObjectURL(blobUrl);

          window.PaintCanvas.setDimensions(img.naturalWidth, img.naturalHeight);

          const { mainCtx } = window.PaintCanvas;
          mainCtx.fillStyle = '#ffffff';
          mainCtx.fillRect(0, 0, img.naturalWidth, img.naturalHeight);
          mainCtx.drawImage(img, 0, 0);

          window.PaintCanvas.clearOverlay();
          window.PaintCanvas.history.reset();
          window.PaintCanvas.history.markClean();
          window.PaintCanvas.fitToScreen();

          const fileInfo = {
            name: file.name,
            type: file.type ? file.type.replace('image/', '').toUpperCase() : 'Raster',
            width: img.naturalWidth,
            height: img.naturalHeight,
            maxVal: 255,
            comments: []
          };
          window.PaintState.set('currentFileInfo', fileInfo);

          if (window.PaintUI && window.PaintUI.displayFileInfo) {
            window.PaintUI.displayFileInfo(fileInfo);
          }
        };

        img.onerror = () => {
          URL.revokeObjectURL(blobUrl);
          if (window.PaintUI && window.PaintUI.showErrorModal) {
            window.PaintUI.showErrorModal(
              'Nieobsługiwany lub uszkodzony plik',
              `Nie udało się otworzyć pliku "${file.name}". Format pliku nie jest obsługiwany lub dane są uszkodzone.`
            );
          } else {
            alert(`Nie udało się otworzyć pliku "${file.name}".`);
          }
        };

        img.src = blobUrl;
      }
    };

    reader.readAsArrayBuffer(file);
  },

  /**
   * Otwiera zintegrowany modal zapisu obrazu.
   */
  openSaveModal() {
    const modal = document.getElementById('save-modal');
    if (modal) {
      modal.classList.add('open');
      const filenameInput = document.getElementById('save-filename');
      if (filenameInput) {
        filenameInput.focus();
        filenameInput.select();
      }
    }
  },

  /**
   * Zamyka modal zapisu obrazu.
   */
  closeSaveModal() {
    const modal = document.getElementById('save-modal');
    if (modal) {
      modal.classList.remove('open');
    }
  },

  /**
   * Zapisuje obraz z ustawieniami wybranymi w modalu.
   */
  saveFromModal() {
    const format = document.querySelector('.btn-save-format.active')?.dataset.format || 'ppm-p6';
    const rawName = document.getElementById('save-filename')?.value.trim() || 'rysunek';
    const cleanName = rawName.replace(/[\/\?<>\\:\*\|":]/g, '') || 'rysunek';

    const transparent = document.getElementById('save-opt-transparent')?.checked ?? false;
    const qualityPercent = parseInt(document.getElementById('save-quality-slider')?.value || '90', 10);
    const quality = Math.max(0.1, Math.min(1.0, qualityPercent / 100));

    const afterSave = () => {
      if (window.PaintCanvas && window.PaintCanvas.history) {
        window.PaintCanvas.history.markClean();
      }
    };

    try {
      if (format === 'ppm-p3') {
        this.exportPPM(cleanName, 'P3', afterSave);
      } else if (format === 'ppm-p6') {
        this.exportPPM(cleanName, 'P6', afterSave);
      } else if (format === 'png') {
        this.exportPNG(cleanName, transparent, afterSave);
      } else if (format === 'jpg') {
        this.exportJPG(cleanName, quality, afterSave);
      }
    } catch (err) {
      console.error('Błąd zapisu pliku:', err);
      if (window.PaintUI && window.PaintUI.showErrorModal) {
        window.PaintUI.showErrorModal('Błąd zapisu', err.message || 'Nie udało się zapisać pliku.');
      } else {
        alert(`Błąd zapisu: ${err.message}`);
      }
    }

    this.closeSaveModal();
  },

  /**
   * Eksportuje rysunek do formatu Netpbm PPM (P3 lub P6).
   * @param {string} filename 
   * @param {'P3'|'P6'} format 
   * @param {Function} [onDone] 
   */
  exportPPM(filename = 'rysunek', format = 'P6', onDone = null) {
    if (!window.PaintPPM) {
      throw new Error('Moduł PaintPPM nie został zainicjalizowany.');
    }

    const { mainCanvas, mainCtx } = window.PaintCanvas;
    const imgData = mainCtx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);

    let blob;
    if (format === 'P3') {
      blob = window.PaintPPM.encodeP3(imgData);
    } else {
      blob = window.PaintPPM.encodeP6(imgData);
    }

    this.downloadBlob(blob, `${filename}.ppm`);
    if (onDone) onDone();
  },

  /**
   * Eksportuje rysunek do formatu PNG.
   * Jeśli transparent === true, czysto białe piksele tła (RGB 255, 255, 255) stają się przezroczyste (Alfa 0).
   */
  exportPNG(filename = 'rysunek', transparent = false, onDone = null) {
    const mainCanvas = window.PaintCanvas.mainCanvas;
    let exportCanvas = mainCanvas;

    if (transparent) {
      exportCanvas = document.createElement('canvas');
      exportCanvas.width = mainCanvas.width;
      exportCanvas.height = mainCanvas.height;
      const ctx = exportCanvas.getContext('2d');
      ctx.drawImage(mainCanvas, 0, 0);

      const imgData = ctx.getImageData(0, 0, exportCanvas.width, exportCanvas.height);
      const data = imgData.data;

      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255) {
          data[i + 3] = 0;
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    exportCanvas.toBlob((blob) => {
      if (blob) {
        this.downloadBlob(blob, `${filename}.png`);
        if (onDone) onDone();
      }
    }, 'image/png');
  },

  /**
   * Eksportuje rysunek do formatu JPG z regulacją jakości (stratna kompresja).
   */
  exportJPG(filename = 'rysunek', quality = 0.90, onDone = null) {
    const mainCanvas = window.PaintCanvas.mainCanvas;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = mainCanvas.width;
    exportCanvas.height = mainCanvas.height;
    const ctx = exportCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    ctx.drawImage(mainCanvas, 0, 0);

    exportCanvas.toBlob((blob) => {
      if (blob) {
        this.downloadBlob(blob, `${filename}.jpg`);
        if (onDone) onDone();
      }
    }, 'image/jpeg', quality);
  },

  /**
   * Pomocnicze pobieranie bloba przez przeglądarkę.
   */
  downloadBlob(blob, fullName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fullName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
};

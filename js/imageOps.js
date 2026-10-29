/**
 * js/imageOps.js
 * Własne operacje na pikselach całego obrazu (Ćwiczenie 3):
 *  - skala szarości wzorem z wagami:  Y = 0,299 R + 0,587 G + 0,114 B
 *  - skala szarości średnią arytmetyczną:  Y = (R + G + B) / 3
 *  - podgląd pojedynczego kanału R, G lub B (w skali szarości albo w kolorze kanału)
 *  - porównanie obu wariantów skali szarości (mapa różnicy i statystyki)
 *
 * ZAKRES: moduł pracuje wyłącznie na obiektach ImageData i nie zna DOM-u ani kanwy,
 * dzięki czemu można go testować w Node (tests/imageOps.test.js). Żadne gotowe filtry
 * (CSS filter, ctx.filter, biblioteki) nie są używane — każdy piksel liczymy w pętli.
 *
 * Wszystkie funkcje zwracają NOWY obraz i nie modyfikują wejścia. Kanał alfa jest kopiowany.
 */
(function () {
  'use strict';

  /** Wagi luminancji (ITU-R BT.601), suma = 1. */
  const WEIGHT_R = 0.299;
  const WEIGHT_G = 0.587;
  const WEIGHT_B = 0.114;

  /** Tworzy pusty obraz o rozmiarze wzorca (w Node, gdzie nie ma ImageData, zwykły obiekt). */
  function createLike(src) {
    const w = src.width;
    const h = src.height;
    if (typeof ImageData !== 'undefined') {
      return new ImageData(w, h);
    }
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }

  /** Skala szarości z wagami: zaokrąglone 0,299 R + 0,587 G + 0,114 B (0–255). */
  function lumaOf(r, g, b) {
    return Math.round(WEIGHT_R * r + WEIGHT_G * g + WEIGHT_B * b);
  }

  /** Skala szarości średnią: zaokrąglone (R + G + B) / 3 (0–255). */
  function averageOf(r, g, b) {
    return Math.round((r + g + b) / 3);
  }

  /** Wspólna pętla: dla każdego piksela wylicza szarość funkcją fn i zapisuje ją w R, G, B. */
  function toGray(src, fn) {
    const out = createLike(src);
    const s = src.data;
    const d = out.data;
    for (let i = 0; i < s.length; i += 4) {
      const y = fn(s[i], s[i + 1], s[i + 2]);
      d[i] = y;
      d[i + 1] = y;
      d[i + 2] = y;
      d[i + 3] = s[i + 3];
    }
    return out;
  }

  /** Obraz w skali szarości — wzór z wagami. */
  function grayscaleLuma(src) {
    return toGray(src, lumaOf);
  }

  /** Obraz w skali szarości — średnia arytmetyczna. */
  function grayscaleAverage(src) {
    return toGray(src, averageOf);
  }

  /**
   * Podgląd jednego kanału.
   * @param {ImageData} src
   * @param {'r'|'g'|'b'} channel
   * @param {'gray'|'color'} mode  'gray' — wartość kanału jako szarość (R=G=B=wartość),
   *                               'color' — tylko ten kanał, pozostałe zerowe (np. czerwony obraz)
   */
  function extractChannel(src, channel, mode) {
    const index = channel === 'r' ? 0 : (channel === 'g' ? 1 : 2);
    const asGray = mode !== 'color';
    const out = createLike(src);
    const s = src.data;
    const d = out.data;
    for (let i = 0; i < s.length; i += 4) {
      const v = s[i + index];
      if (asGray) {
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
      } else {
        d[i] = 0;
        d[i + 1] = 0;
        d[i + 2] = 0;
        d[i + index] = v;
      }
      d[i + 3] = s[i + 3];
    }
    return out;
  }

  /**
   * Statystyki porównania obu skal szarości, liczone bez tworzenia obrazów pośrednich
   * (dzięki temu działają szybko także na dużych obrazach).
   * @returns {{total:number, meanAbsDiff:number, maxDiff:number, differing:number, differingPercent:number}}
   */
  function compareGrayscales(src) {
    const s = src.data;
    const total = s.length / 4;
    let sum = 0;
    let max = 0;
    let differing = 0;
    for (let i = 0; i < s.length; i += 4) {
      const a = lumaOf(s[i], s[i + 1], s[i + 2]);
      const b = averageOf(s[i], s[i + 1], s[i + 2]);
      const diff = a > b ? a - b : b - a;
      sum += diff;
      if (diff > max) max = diff;
      if (diff !== 0) differing++;
    }
    return {
      total,
      meanAbsDiff: total > 0 ? sum / total : 0,
      maxDiff: max,
      differing,
      differingPercent: total > 0 ? (differing * 100) / total : 0
    };
  }

  /**
   * Mapa różnicy |wagi − średnia| jako obraz w skali szarości, wzmocniona mnożnikiem gain
   * (bez wzmocnienia różnice rzędu kilku poziomów są praktycznie niewidoczne).
   */
  function differenceMap(src, gain) {
    const g = gain > 0 ? gain : 1;
    const out = createLike(src);
    const s = src.data;
    const d = out.data;
    for (let i = 0; i < s.length; i += 4) {
      const a = lumaOf(s[i], s[i + 1], s[i + 2]);
      const b = averageOf(s[i], s[i + 1], s[i + 2]);
      let v = Math.round((a > b ? a - b : b - a) * g);
      if (v > 255) v = 255;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    return out;
  }

  /**
   * Pomniejsza obraz metodą najbliższego sąsiada tak, by dłuższy bok miał co najwyżej maxSide px.
   * Służy wyłącznie podglądom — zastosowanie operacji zawsze liczy pełną rozdzielczość.
   * Jeśli obraz jest już dość mały, zwraca go bez kopiowania.
   */
  function downscale(src, maxSide) {
    const w = src.width;
    const h = src.height;
    const longest = w > h ? w : h;
    if (longest <= maxSide) return src;

    const scale = maxSide / longest;
    const nw = Math.max(1, Math.round(w * scale));
    const nh = Math.max(1, Math.round(h * scale));
    let out;
    if (typeof ImageData !== 'undefined') {
      out = new ImageData(nw, nh);
    } else {
      out = { width: nw, height: nh, data: new Uint8ClampedArray(nw * nh * 4) };
    }
    const s = src.data;
    const d = out.data;
    for (let y = 0; y < nh; y++) {
      const sy = Math.min(h - 1, Math.floor((y * h) / nh));
      for (let x = 0; x < nw; x++) {
        const sx = Math.min(w - 1, Math.floor((x * w) / nw));
        const si = (sy * w + sx) * 4;
        const di = (y * nw + x) * 4;
        d[di] = s[si];
        d[di + 1] = s[si + 1];
        d[di + 2] = s[si + 2];
        d[di + 3] = s[si + 3];
      }
    }
    return out;
  }

  const api = {
    WEIGHT_R,
    WEIGHT_G,
    WEIGHT_B,
    lumaOf,
    averageOf,
    grayscaleLuma,
    grayscaleAverage,
    extractChannel,
    compareGrayscales,
    differenceMap,
    downscale
  };

  if (typeof window !== 'undefined') {
    window.PaintImageOps = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();

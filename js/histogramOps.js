/**
 * js/histogramOps.js
 * Obliczenia histogramu jasności i kanałów RGB, statystyk, automatycznego doboru progu
 * (średnia jasność oraz metoda Otsu) i normalizacji histogramu (rozciąganie i wyrównywanie)
 * dla Ćwiczenia 6.
 *
 * ZAKRES: czyste funkcje na obiektach ImageData, bez zależności od DOM-u i kanwy — dzięki temu
 * moduł jest testowany w Node (tests/histogramOps.test.js). Wszystkie operacje liczone są
 * własnymi pętlami po pikselach i przedziałach 0–255.
 */
(function () {
  'use strict';

  const LEVELS = 256;

  function clamp255(v) {
    if (v < 0) return 0;
    if (v > 255) return 255;
    return v;
  }

  function createLike(src) {
    if (typeof ImageData !== 'undefined') {
      return new ImageData(src.width, src.height);
    }
    return { width: src.width, height: src.height, data: new Uint8ClampedArray(src.width * src.height * 4) };
  }

  function copyImage(src) {
    const out = createLike(src);
    out.data.set(src.data);
    return out;
  }

  function imageOps() {
    if (typeof window !== 'undefined' && window.PaintImageOps) return window.PaintImageOps;
    if (typeof require === 'function') return require('./imageOps.js');
    throw new Error('PaintHistogramOps: brak modułu PaintImageOps (załaduj js/imageOps.js wcześniej).');
  }

  function pointOps() {
    if (typeof window !== 'undefined' && window.PaintPointOps) return window.PaintPointOps;
    if (typeof require === 'function') return require('./pointOps.js');
    throw new Error('PaintHistogramOps: brak modułu PaintPointOps (załaduj js/pointOps.js wcześniej).');
  }

  // ───────────────────────── histogramy i statystyki ─────────────────────────

  /**
   * Zlicza histogramy 256-przedziałowe (0–255) dla jasności (wzór z wagami z Ćw. 3)
   * oraz dla kanałów R, G i B w jednym przebiegu po pikselach.
   * @param {ImageData} src
   * @returns {{gray: Uint32Array, r: Uint32Array, g: Uint32Array, b: Uint32Array, total: number}}
   */
  function computeHistograms(src) {
    const gray = new Uint32Array(LEVELS);
    const r = new Uint32Array(LEVELS);
    const g = new Uint32Array(LEVELS);
    const b = new Uint32Array(LEVELS);
    const s = src.data;
    const lumaOf = imageOps().lumaOf;

    for (let i = 0; i < s.length; i += 4) {
      const rv = s[i];
      const gv = s[i + 1];
      const bv = s[i + 2];
      r[rv]++;
      g[gv]++;
      b[bv]++;
      gray[lumaOf(rv, gv, bv)]++;
    }

    return { gray, r, g, b, total: src.width * src.height };
  }

  /**
   * Wyznacza wartość minimalną, maksymalną i średnią z 256-przedziałowego histogramu.
   * @param {Uint32Array} hist
   * @param {number} total
   * @returns {{min: number, max: number, mean: number, total: number}}
   */
  function stats(hist, total) {
    if (!total || total <= 0) {
      return { min: 0, max: 0, mean: 0, total: 0 };
    }
    let min = -1;
    let max = 0;
    let sum = 0;
    for (let v = 0; v < LEVELS; v++) {
      const count = hist[v];
      if (count > 0) {
        if (min === -1) min = v;
        max = v;
        sum += v * count;
      }
    }
    if (min === -1) min = 0;
    return { min, max, mean: sum / total, total };
  }

  // ───────────────────────── automatyczny dobór progu ─────────────────────────

  /** Próg średniej jasności (zaokrąglona średnia wartość z histogramu). */
  function meanThreshold(hist, total) {
    return Math.round(stats(hist, total).mean);
  }

  /**
   * Próg metodą Otsu: szuka progu T ∈ [1, 255] dzielącego histogram na klasę tła [0, T−1]
   * i obiektu [T, 255] tak, aby zmaksymalizować wariancję międzyklasową w0 · w1 · (μ0 − μ1)².
   * Dla obrazu jednolitego (min = max) zwraca jego poziom bez dzielenia przez zero.
   * Przy remisie (np. obraz dwupoziomowy 0 i 255) zwraca środek przedziału maksymalnego (128).
   */
  function otsuThreshold(hist, total) {
    if (!total || total <= 0) return 0;
    const s = stats(hist, total);
    if (s.min === s.max) return s.min;

    let totalSum = 0;
    for (let v = 0; v < LEVELS; v++) {
      totalSum += v * hist[v];
    }

    let w0 = 0;
    let sum0 = 0;
    let bestVar = -1;
    let bestStart = 0;
    let bestEnd = 0;

    for (let t = 1; t < LEVELS; t++) {
      w0 += hist[t - 1];
      sum0 += (t - 1) * hist[t - 1];
      const w1 = total - w0;
      if (w0 === 0 || w1 === 0) continue;

      const mu0 = sum0 / w0;
      const mu1 = (totalSum - sum0) / w1;
      const between = w0 * w1 * (mu0 - mu1) * (mu0 - mu1);

      if (between > bestVar + 1e-9) {
        bestVar = between;
        bestStart = t;
        bestEnd = t;
      } else if (Math.abs(between - bestVar) <= 1e-9) {
        bestEnd = t;
      }
    }

    return Math.round((bestStart + bestEnd) / 2);
  }

  /** Binaryzacja progiem T (wykorzystuje funkcję threshold z Ćwiczenia 4: biały dla Y ≥ T). */
  function threshold(src, level) {
    return pointOps().threshold(src, level);
  }

  // ───────────────────────── normalizacja histogramu ─────────────────────────

  /** Pomocniczo: stosuje 256-elementową tablicę przekodowań na obrazie w skali szarości. */
  function applyGrayLut(src, lut) {
    const out = createLike(src);
    const s = src.data;
    const d = out.data;
    const lumaOf = imageOps().lumaOf;
    for (let i = 0; i < s.length; i += 4) {
      const y = lut[lumaOf(s[i], s[i + 1], s[i + 2])];
      d[i] = y;
      d[i + 1] = y;
      d[i + 2] = y;
      d[i + 3] = s[i + 3];
    }
    return out;
  }

  /**
   * Rozciąganie histogramu w skali szarości do pełnego zakresu 0–255:
   *   v' = round((v − min) · 255 / (max − min))
   * Dla obrazu jednolitego (min = max) zwraca kopię oryginału bez dzielenia przez zero.
   */
  function stretchHistogram(src) {
    const { gray, total } = computeHistograms(src);
    const s = stats(gray, total);
    const span = s.max - s.min;
    if (total === 0 || span <= 0) return copyImage(src);

    const lut = new Uint8Array(LEVELS);
    for (let v = 0; v < LEVELS; v++) {
      lut[v] = clamp255(Math.round(((v - s.min) * 255) / span));
    }
    return applyGrayLut(src, lut);
  }

  /**
   * Wyrównywanie (equalizacja) histogramu w skali szarości z użyciem histogramu skumulowanego (CDF):
   *   v' = round((cdf[v] − cdfMin) · 255 / (N − cdfMin))
   * Dla obrazu jednolitego (N − cdfMin = 0) zwraca kopię oryginału bez dzielenia przez zero.
   */
  function equalizeHistogram(src) {
    const { gray, total } = computeHistograms(src);
    if (total === 0) return copyImage(src);

    const cdf = new Uint32Array(LEVELS);
    cdf[0] = gray[0];
    let cdfMin = cdf[0] > 0 ? cdf[0] : 0;
    for (let v = 1; v < LEVELS; v++) {
      cdf[v] = cdf[v - 1] + gray[v];
      if (cdfMin === 0 && cdf[v] > 0) cdfMin = cdf[v];
    }

    const denom = total - cdfMin;
    if (denom <= 0) return copyImage(src);

    const lut = new Uint8Array(LEVELS);
    for (let v = 0; v < LEVELS; v++) {
      lut[v] = clamp255(Math.round(((cdf[v] - cdfMin) * 255) / denom));
    }
    return applyGrayLut(src, lut);
  }

  const api = {
    computeHistograms,
    stats,
    meanThreshold,
    otsuThreshold,
    threshold,
    stretchHistogram,
    equalizeHistogram
  };

  if (typeof window !== 'undefined') {
    window.PaintHistogramOps = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();

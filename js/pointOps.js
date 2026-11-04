/**
 * js/pointOps.js
 * Przekształcenia punktowe obrazu (Ćwiczenie 4): każdy piksel jest przetwarzany niezależnie
 * od sąsiadów, osobno dla kanałów R, G i B (kanał alfa jest kopiowany bez zmian).
 *
 *   Jasność  (b ∈ [−255, 255]) :  v' = v + b
 *   Kontrast (k ∈ [0, 3])      :  v' = (v − 128)·k + 128          (k = 1 → bez zmiany)
 *   Negatyw                    :  v' = 255 − v
 *   Gamma    (γ ∈ [0,1; 5])    :  v' = 255·(v / 255)^(1 / γ)      (γ = 1 → bez zmiany)
 *   Próg     (T ∈ [0, 255])    :  Y = skala szarości (PaintImageOps.grayscaleLuma),
 *                                 v' = 255 gdy Y ≥ T, w przeciwnym razie 0
 *
 * KAŻDY wynik jest zaokrąglany do liczby całkowitej i OBCINANY do zakresu 0–255
 * (funkcja clamp255), więc wartości poza zakresem nigdy nie trafiają do obrazu.
 *
 * TABLICA PRZEKODOWAŃ (LUT): jasność, kontrast, negatyw i gamma zależą wyłącznie od wartości
 * jednego kanału, więc wynik dla każdej z 256 możliwych wartości liczymy RAZ (własna pętla
 * 0..255), a potem pętla po pikselach tylko podstawia gotowe wartości. Dzięki temu podgląd
 * na żywo działa płynnie także na dużych obrazach. Próg zależy od trzech kanałów naraz,
 * więc liczymy go w zwykłej pętli po pikselach.
 *
 * ZAKRES: moduł pracuje wyłącznie na obiektach ImageData i nie zna DOM-u ani kanwy, dzięki
 * czemu można go testować w Node (tests/pointOps.test.js). Żadne gotowe filtry (CSS filter,
 * ctx.filter, biblioteki) nie są używane. Funkcje zwracają NOWY obraz i nie modyfikują wejścia.
 */
(function () {
  'use strict';

  /** Obcina wartość do zakresu 0–255 (jawnie, bez polegania na Uint8ClampedArray). */
  function clamp255(v) {
    if (v < 0) return 0;
    if (v > 255) return 255;
    return v;
  }

  /** Liczba skończona albo wartość zapasowa (ochrona przed NaN z pustego pola formularza). */
  function finiteOr(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }

  /** Tworzy pusty obraz o rozmiarze wzorca (w Node, gdzie nie ma ImageData, zwykły obiekt). */
  function createLike(src) {
    if (typeof ImageData !== 'undefined') {
      return new ImageData(src.width, src.height);
    }
    return { width: src.width, height: src.height, data: new Uint8ClampedArray(src.width * src.height * 4) };
  }

  /** Funkcja skali szarości z Ćwiczenia 3 (w przeglądarce globalna, w Node z pliku). */
  function imageOps() {
    if (typeof window !== 'undefined' && window.PaintImageOps) return window.PaintImageOps;
    if (typeof require === 'function') return require('./imageOps.js');
    throw new Error('PaintPointOps: brak modułu PaintImageOps (załaduj js/imageOps.js wcześniej).');
  }

  // ───────────────────────── tablica przekodowań ─────────────────────────

  /**
   * Buduje tablicę 256 wyników dla funkcji fn(v): zaokrąglenie i obcięcie do 0–255.
   * @param {function(number):number} fn przekształcenie jednej wartości kanału
   * @returns {Uint8Array} lut[v] = wynik dla wartości v
   */
  function buildLut(fn) {
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
      lut[v] = clamp255(Math.round(fn(v)));
    }
    return lut;
  }

  /** Stosuje tablicę do kanałów R, G, B każdego piksela; alfa jest kopiowana. */
  function applyLut(src, lut) {
    const out = createLike(src);
    const s = src.data;
    const d = out.data;
    for (let i = 0; i < s.length; i += 4) {
      d[i] = lut[s[i]];
      d[i + 1] = lut[s[i + 1]];
      d[i + 2] = lut[s[i + 2]];
      d[i + 3] = s[i + 3];
    }
    return out;
  }

  // ───────────────────────── przekształcenia ─────────────────────────

  /** Jasność: v' = v + b, obcięte do 0–255. */
  function brightness(src, delta) {
    const b = finiteOr(delta, 0);
    return applyLut(src, buildLut((v) => v + b));
  }

  /** Kontrast: v' = (v − 128)·k + 128, obcięte do 0–255. k = 1 nie zmienia obrazu. */
  function contrast(src, factor) {
    const k = finiteOr(factor, 1);
    return applyLut(src, buildLut((v) => (v - 128) * k + 128));
  }

  /** Negatyw: v' = 255 − v. */
  function invert(src) {
    return applyLut(src, buildLut((v) => 255 - v));
  }

  /**
   * Korekcja gamma: v' = 255·(v / 255)^(1 / γ). Dla γ > 1 obraz się rozjaśnia, dla γ < 1
   * przyciemnia, γ = 1 nie zmienia obrazu. Niedodatnie γ (błąd danych) traktujemy jak 1.
   */
  function gamma(src, g) {
    const gg = finiteOr(g, 1);
    const exponent = 1 / (gg > 0 ? gg : 1);
    return applyLut(src, buildLut((v) => 255 * Math.pow(v / 255, exponent)));
  }

  /**
   * Progowanie: najpierw skala szarości funkcją z Ćwiczenia 3 (wzór z wagami), potem
   * dla każdego piksela: jasność Y ≥ T → biały (255, 255, 255), w przeciwnym razie czarny.
   */
  function threshold(src, level) {
    const t = finiteOr(level, 128);
    const out = imageOps().grayscaleLuma(src); // nowy obraz, R = G = B = Y
    const d = out.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] >= t ? 255 : 0;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
    }
    return out;
  }

  const api = {
    clamp255,
    brightness,
    contrast,
    invert,
    gamma,
    threshold
  };

  if (typeof window !== 'undefined') {
    window.PaintPointOps = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();

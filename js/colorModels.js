/**
 * js/colorModels.js
 * Własne konwersje między modelami barw: RGB ↔ HSV oraz RGB ↔ CMYK (+ zapis HEX).
 * Ćwiczenie 3 — wszystkie wzory napisane ręcznie, bez gotowych funkcji bibliotecznych.
 *
 * ZAKRES: moduł jest „czystą matematyką” — nie zna DOM-u, kanwy ani stanu aplikacji,
 * dzięki czemu można go testować w Node (tests/colorModels.test.js).
 *
 * KONWENCJA ZAKRESÓW (obowiązuje w całym module):
 *   RGB  — r, g, b  : liczby całkowite 0–255
 *   HSV  — h        : stopnie 0 ≤ h < 360
 *          s, v     : ułamki 0–1   (interfejs pokazuje je jako 0–100 %)
 *   CMYK — c, m, y, k: ułamki 0–1  (interfejs pokazuje je jako 0–100 %)
 *
 * PRZYPADKI BRZEGOWE (kontrakt — bez dzielenia przez zero):
 *   - czarny (0,0,0): V = 0 → S = 0 (nie dzielimy przez V), K = 1 → C = M = Y = 0
 *   - biały i każdy szary: delta = 0 → H = 0 (barwa nieokreślona, przyjmujemy 0°), S = 0
 */
(function () {
  'use strict';

  // ───────────────────────── pomocnicze ─────────────────────────

  /** Obcina wartość do przedziału [min, max]. */
  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  /** Ułamek 0–1 → liczba całkowita 0–255 (z zaokrągleniem i obcięciem). */
  function to255(x) {
    return Math.round(clamp(x, 0, 1) * 255);
  }

  /** Normalizuje liczbę całkowitą do zakresu bajtu 0–255. */
  function byte(v) {
    return clamp(Math.round(v), 0, 255);
  }

  /** Normalizuje kąt do przedziału [0, 360). */
  function wrapHue(h) {
    let x = h % 360;
    if (x < 0) x += 360;
    if (x >= 360) x = 0; // zabezpieczenie przed 360 - epsilon po zaokrągleniu
    return x;
  }

  // ───────────────────────── RGB ↔ HSV ─────────────────────────

  /**
   * RGB (0–255) → HSV.
   *   V = max(R', G', B')
   *   S = (max − min) / max              (0, gdy max = 0)
   *   H = 60° · { ((G'−B')/Δ) mod 6      gdy max = R'
   *             { (B'−R')/Δ + 2          gdy max = G'
   *             { (R'−G')/Δ + 4          gdy max = B'      (0°, gdy Δ = 0)
   * gdzie X' = X / 255, Δ = max − min.
   * @returns {{h:number, s:number, v:number}} h w stopniach, s i v jako ułamki 0–1
   */
  function rgbToHsv(r, g, b) {
    const rn = byte(r) / 255;
    const gn = byte(g) / 255;
    const bn = byte(b) / 255;

    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;

    let h = 0;
    if (delta !== 0) {
      if (max === rn) {
        h = 60 * (((gn - bn) / delta) % 6);
      } else if (max === gn) {
        h = 60 * ((bn - rn) / delta + 2);
      } else {
        h = 60 * ((rn - gn) / delta + 4);
      }
      h = wrapHue(h);
    }

    const s = max === 0 ? 0 : delta / max; // czarny: brak dzielenia przez zero
    return { h, s, v: max };
  }

  /**
   * HSV → RGB (0–255).
   *   C = V·S,  X = C·(1 − |(H/60) mod 2 − 1|),  m = V − C
   *   (R', G', B') zależnie od sektora H/60 ∈ {0..5}, potem (R'+m, G'+m, B'+m)·255
   * @param {number} h stopnie (dowolne — zostaną zawinięte do 0–360)
   * @param {number} s ułamek 0–1
   * @param {number} v ułamek 0–1
   * @returns {{r:number, g:number, b:number}}
   */
  function hsvToRgb(h, s, v) {
    const hh = wrapHue(h);
    const ss = clamp(s, 0, 1);
    const vv = clamp(v, 0, 1);

    const c = vv * ss;
    const hp = hh / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    const m = vv - c;

    let r1 = 0;
    let g1 = 0;
    let b1 = 0;
    const sector = Math.floor(hp); // 0..5
    if (sector === 0) { r1 = c; g1 = x; b1 = 0; }
    else if (sector === 1) { r1 = x; g1 = c; b1 = 0; }
    else if (sector === 2) { r1 = 0; g1 = c; b1 = x; }
    else if (sector === 3) { r1 = 0; g1 = x; b1 = c; }
    else if (sector === 4) { r1 = x; g1 = 0; b1 = c; }
    else { r1 = c; g1 = 0; b1 = x; }

    return { r: to255(r1 + m), g: to255(g1 + m), b: to255(b1 + m) };
  }

  // ───────────────────────── RGB ↔ CMYK ─────────────────────────

  /**
   * RGB (0–255) → CMYK (naiwna konwersja matematyczna, bez profili ICC).
   *   K = 1 − max(R', G', B')
   *   C = (1 − R' − K) / (1 − K),  M = (1 − G' − K) / (1 − K),  Y = (1 − B' − K) / (1 − K)
   * Gdy K = 1 (czarny), mianownik (1 − K) = 0, więc przyjmujemy C = M = Y = 0.
   * @returns {{c:number, m:number, y:number, k:number}} ułamki 0–1
   */
  function rgbToCmyk(r, g, b) {
    const rn = byte(r) / 255;
    const gn = byte(g) / 255;
    const bn = byte(b) / 255;

    const k = 1 - Math.max(rn, gn, bn);
    if (k >= 1) {
      return { c: 0, m: 0, y: 0, k: 1 }; // czarny — brak dzielenia przez zero
    }

    const d = 1 - k;
    return {
      c: clamp((1 - rn - k) / d, 0, 1),
      m: clamp((1 - gn - k) / d, 0, 1),
      y: clamp((1 - bn - k) / d, 0, 1),
      k
    };
  }

  /**
   * CMYK → RGB (0–255):  R = 255·(1 − C)·(1 − K), analogicznie G i B.
   * @param {number} c ułamek 0–1
   * @param {number} m ułamek 0–1
   * @param {number} y ułamek 0–1
   * @param {number} k ułamek 0–1
   * @returns {{r:number, g:number, b:number}}
   */
  function cmykToRgb(c, m, y, k) {
    const cc = clamp(c, 0, 1);
    const mm = clamp(m, 0, 1);
    const yy = clamp(y, 0, 1);
    const kk = clamp(k, 0, 1);
    return {
      r: to255((1 - cc) * (1 - kk)),
      g: to255((1 - mm) * (1 - kk)),
      b: to255((1 - yy) * (1 - kk))
    };
  }

  // ───────────────────────── HEX ─────────────────────────

  /** Bajt → dwuznakowy zapis szesnastkowy ("0a", "ff"). */
  function hex2(v) {
    const s = byte(v).toString(16);
    return s.length === 1 ? '0' + s : s;
  }

  /** RGB → "#rrggbb" (małe litery). */
  function rgbToHex(r, g, b) {
    return '#' + hex2(r) + hex2(g) + hex2(b);
  }

  /**
   * "#rrggbb" lub "#rgb" (z # lub bez) → {r,g,b}; przy błędnym zapisie zwraca null.
   */
  function hexToRgb(hex) {
    if (typeof hex !== 'string') return null;
    let s = hex.trim();
    if (s.charAt(0) === '#') s = s.slice(1);
    if (s.length === 3) {
      s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
    }
    if (s.length !== 6) return null;
    for (let i = 0; i < 6; i++) {
      const ch = s.charCodeAt(i);
      const isDigit = ch >= 48 && ch <= 57;
      const isLower = ch >= 97 && ch <= 102;
      const isUpper = ch >= 65 && ch <= 70;
      if (!isDigit && !isLower && !isUpper) return null;
    }
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16)
    };
  }

  // ───────────────────────── kolory wzorcowe ─────────────────────────

  /**
   * Kolory wzorcowe z OCZEKIWANYMI wartościami wpisanymi „na sztywno” (z definicji modeli),
   * niezależnie od funkcji powyżej. Służą testom oraz kontroli poprawności w panelu.
   * hsv: [H°, S%, V%]   cmyk: [C%, M%, Y%, K%]
   */
  const REFERENCE_COLORS = [
    { name: 'Czerwony', rgb: [255, 0, 0], hsv: [0, 100, 100], cmyk: [0, 100, 100, 0] },
    { name: 'Zielony', rgb: [0, 255, 0], hsv: [120, 100, 100], cmyk: [100, 0, 100, 0] },
    { name: 'Niebieski', rgb: [0, 0, 255], hsv: [240, 100, 100], cmyk: [100, 100, 0, 0] },
    { name: 'Żółty', rgb: [255, 255, 0], hsv: [60, 100, 100], cmyk: [0, 0, 100, 0] },
    { name: 'Cyjan', rgb: [0, 255, 255], hsv: [180, 100, 100], cmyk: [100, 0, 0, 0] },
    { name: 'Magenta', rgb: [255, 0, 255], hsv: [300, 100, 100], cmyk: [0, 100, 0, 0] },
    { name: 'Biały', rgb: [255, 255, 255], hsv: [0, 0, 100], cmyk: [0, 0, 0, 0] },
    { name: 'Czarny', rgb: [0, 0, 0], hsv: [0, 0, 0], cmyk: [0, 0, 0, 100] },
    { name: 'Szary 50%', rgb: [128, 128, 128], hsv: [0, 0, 50.2], cmyk: [0, 0, 0, 49.8] }
  ];

  /**
   * Porównuje wynik konwersji z wartościami wzorcowymi (tolerancja w jednostkach interfejsu).
   * @returns {{ok:boolean, hsv:number[], cmyk:number[]}} wartości obliczone w jednostkach UI
   */
  function checkReference(ref, tolerance) {
    const tol = tolerance === undefined ? 0.06 : tolerance;
    const hsv = rgbToHsv(ref.rgb[0], ref.rgb[1], ref.rgb[2]);
    const cmyk = rgbToCmyk(ref.rgb[0], ref.rgb[1], ref.rgb[2]);
    const gotHsv = [hsv.h, hsv.s * 100, hsv.v * 100];
    const gotCmyk = [cmyk.c * 100, cmyk.m * 100, cmyk.y * 100, cmyk.k * 100];

    let ok = true;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(gotHsv[i] - ref.hsv[i]) > tol) ok = false;
    }
    for (let i = 0; i < 4; i++) {
      if (Math.abs(gotCmyk[i] - ref.cmyk[i]) > tol) ok = false;
    }
    return { ok, hsv: gotHsv, cmyk: gotCmyk };
  }

  const api = {
    clamp,
    rgbToHsv,
    hsvToRgb,
    rgbToCmyk,
    cmykToRgb,
    rgbToHex,
    hexToRgb,
    REFERENCE_COLORS,
    checkReference
  };

  if (typeof window !== 'undefined') {
    window.PaintColor = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();

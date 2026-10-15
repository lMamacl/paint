/**
 * js/dirtyRect.js
 * Geometria prostokątów (obszarów "brudnych") — wspólna dla historii i narzędzi.
 *
 * Prostokąt reprezentujemy jako { x, y, w, h } we współrzędnych kanwy.
 * Moduł jest bezstanowy (poza trackerem) i nie zależy od żadnego innego modułu.
 */

window.PaintRect = {
  /** Cała kanwa. */
  full(w, h) {
    return { x: 0, y: 0, w: w, h: h };
  },

  /** Czy prostokąt jest pusty/niepoprawny. */
  isEmpty(r) {
    return !r || r.w <= 0 || r.h <= 0;
  },

  /** Prostokąt powiększony o n pikseli z każdej strony (margines na antyaliasing). */
  pad(r, n) {
    if (!r) return null;
    return { x: r.x - n, y: r.y - n, w: r.w + 2 * n, h: r.h + 2 * n };
  },

  /** Najmniejszy prostokąt zawierający oba podane. */
  union(a, b) {
    if (!a) return b ? { ...b } : null;
    if (!b) return { ...a };
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w);
    const y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x, y, w: x2 - x, h: y2 - y };
  },

  /** Prostokąt opisujący dwa punkty + margines (np. końce odcinka). */
  fromPoints(x1, y1, x2, y2, pad = 0) {
    const x = Math.floor(Math.min(x1, x2)) - pad;
    const y = Math.floor(Math.min(y1, y2)) - pad;
    const x2r = Math.ceil(Math.max(x1, x2)) + pad;
    const y2r = Math.ceil(Math.max(y1, y2)) + pad;
    return { x, y, w: x2r - x, h: y2r - y };
  },

  /**
   * Przycina prostokąt do obszaru kanwy i zaokrągla do pikseli.
   * Zwraca null, jeśli po przycięciu nic nie zostało.
   */
  clamp(r, canvasW, canvasH) {
    if (!r) return null;
    const x = Math.max(0, Math.floor(r.x));
    const y = Math.max(0, Math.floor(r.y));
    const x2 = Math.min(canvasW, Math.ceil(r.x + r.w));
    const y2 = Math.min(canvasH, Math.ceil(r.y + r.h));
    const w = x2 - x;
    const h = y2 - y;
    if (w <= 0 || h <= 0) return null;
    return { x, y, w, h };
  },

  /* ────────────────── TRACKER GESTU ──────────────────
   * Dla narzędzi, których obszaru nie znamy z góry (ołówek, gumka):
   * zbieramy prostokąt "w locie" podczas ruchu myszy.
   */
  track: {
    create() {
      return { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    },

    addPoint(t, x, y, pad = 0) {
      t.x0 = Math.min(t.x0, x - pad);
      t.y0 = Math.min(t.y0, y - pad);
      t.x1 = Math.max(t.x1, x + pad);
      t.y1 = Math.max(t.y1, y + pad);
      return t;
    },

    addSegment(t, x1, y1, x2, y2, pad = 0) {
      this.addPoint(t, x1, y1, pad);
      this.addPoint(t, x2, y2, pad);
      return t;
    },

    /** Zwraca { x, y, w, h } albo null, jeśli tracker jest pusty. */
    bounds(t) {
      if (!t || t.x0 > t.x1) return null;
      return window.PaintRect.fromPoints(t.x0, t.y0, t.x1, t.y1, 0);
    }
  }
};

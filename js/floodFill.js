/**
 * js/floodFill.js
 * Algorytm wypełniania obszaru (Wiadro z farbą / Flood Fill).
 *
 * W wersji v2 algorytm wyznacza i zwraca precyzyjny prostokąt zmienionych pikseli
 * (Dirty Rect: bounds) oraz wycinki ImageData przed i po wypełnieniu.
 * Dzięki temu historia przyrostowa zapisuje tylko zmodyfikowany fragment.
 */

window.PaintFloodFill = {
  /**
   * Konwertuje ciąg hex '#rrggbb' na trójkę liczb [r, g, b].
   */
  hexToRgb(hex) {
    const cleanHex = hex.replace('#', '');
    const num = parseInt(cleanHex, 16);
    return [
      (num >> 16) & 255,
      (num >> 8) & 255,
      num & 255
    ];
  },

  /**
   * Wyznacza obszar wypełnienia bez bezpośredniego modyfikowania kanwy.
   * Zwraca { bounds, before, after } lub null, jeśli kliknięto w ten sam kolor / poza kanwą.
   */
  compute(ctx, startX, startY, fillColorHex, tolerance = 32) {
    startX = Math.floor(startX);
    startY = Math.floor(startY);

    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    if (startX < 0 || startX >= width || startY < 0 || startY >= height) return null;

    // Pełny stan początkowy pikseli
    const origData = ctx.getImageData(0, 0, width, height);
    const dataSrc = origData.data;

    const startIndex = (startY * width + startX) * 4;
    const targetR = dataSrc[startIndex];
    const targetG = dataSrc[startIndex + 1];
    const targetB = dataSrc[startIndex + 2];
    const targetA = dataSrc[startIndex + 3];

    const [fillR, fillG, fillB] = this.hexToRgb(fillColorHex);
    const fillA = 255;

    // Jeśli punkt startowy ma już dokładnie kolor docelowy — brak zmian
    if (
      targetR === fillR &&
      targetG === fillG &&
      targetB === fillB &&
      targetA === fillA
    ) {
      return null;
    }

    const matchesTarget = (idx) => {
      const r = dataSrc[idx];
      const g = dataSrc[idx + 1];
      const b = dataSrc[idx + 2];
      const a = dataSrc[idx + 3];

      return (
        Math.abs(r - targetR) <= tolerance &&
        Math.abs(g - targetG) <= tolerance &&
        Math.abs(b - targetB) <= tolerance &&
        Math.abs(a - targetA) <= tolerance
      );
    };

    // Kopia danych do modyfikacji
    const modData = new ImageData(new Uint8ClampedArray(dataSrc), width, height);
    const dataDst = modData.data;

    const visited = new Uint8Array(width * height);
    const stack = [startX, startY];
    visited[startY * width + startX] = 1;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    while (stack.length > 0) {
      const cy = stack.pop();
      const cx = stack.pop();
      const pixelIdx = (cy * width + cx) * 4;

      dataDst[pixelIdx] = fillR;
      dataDst[pixelIdx + 1] = fillG;
      dataDst[pixelIdx + 2] = fillB;
      dataDst[pixelIdx + 3] = fillA;

      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      const neighbors = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1]
      ];

      for (let i = 0; i < 4; i++) {
        const nx = neighbors[i][0];
        const ny = neighbors[i][1];

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nVisitedIdx = ny * width + nx;
          if (!visited[nVisitedIdx]) {
            visited[nVisitedIdx] = 1;
            const nDataIdx = nVisitedIdx * 4;
            if (matchesTarget(nDataIdx)) {
              stack.push(nx, ny);
            }
          }
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      return null;
    }

    const bounds = {
      x: minX,
      y: minY,
      w: maxX - minX + 1,
      h: maxY - minY + 1
    };

    // Wycięcie wycinków ImageData tylko dla zmodyfikowanego prostokąta
    const subBefore = new ImageData(bounds.w, bounds.h);
    const subAfter = new ImageData(bounds.w, bounds.h);
    const src32 = new Uint32Array(dataSrc.buffer);
    const dst32 = new Uint32Array(dataDst.buffer);
    const b32 = new Uint32Array(subBefore.data.buffer);
    const a32 = new Uint32Array(subAfter.data.buffer);

    for (let r = 0; r < bounds.h; r++) {
      const offsetSrc = (bounds.y + r) * width + bounds.x;
      const offsetDst = r * bounds.w;
      b32.set(src32.subarray(offsetSrc, offsetSrc + bounds.w), offsetDst);
      a32.set(dst32.subarray(offsetSrc, offsetSrc + bounds.w), offsetDst);
    }

    return {
      bounds,
      before: subBefore,
      after: subAfter
    };
  },

  /**
   * Wykonuje wypełnienie obszaru bezpośrednio na zadanym kontekście Canvas 2D.
   * Zwraca obiekt z obszarem modyfikacji { bounds, before, after } lub null.
   */
  fill(ctx, startX, startY, fillColorHex, tolerance = 32) {
    const res = this.compute(ctx, startX, startY, fillColorHex, tolerance);
    if (res) {
      ctx.putImageData(res.after, res.bounds.x, res.bounds.y);
    }
    return res;
  }
};

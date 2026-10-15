/**
 * js/floodFill.js
 * Algorytm wypełniania obszaru (Wiadro z farbą / Flood Fill).
 *
 * Zastosowano iteracyjny algorytm wypełniania (kolejka 4-kierunkowa) z tolerancją różnicy kolorów.
 * Dzięki użyciu pętli while i tablicy zamiast rekurencji funkcyjnej,
 * unikamy błędu przepełnienia stosu wywołań (Call Stack Overflow) na dużych kanwach.
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
   * Wykonuje wypełnienie obszaru na zadanym kontekście Canvas 2D.
   * @param {CanvasRenderingContext2D} ctx - Kontekst kanwy docelowej
   * @param {number} startX - Współrzędna X kliknięcia (w pikselach kanwy)
   * @param {number} startY - Współrzędna Y kliknięcia (w pikselach kanwy)
   * @param {string} fillColorHex - Kolor docelowy w formacie hex, np. "#ff0000"
   * @param {number} tolerance - Tolerancja dopasowania barwy (0-255)
   */
  fill(ctx, startX, startY, fillColorHex, tolerance = 32) {
    startX = Math.floor(startX);
    startY = Math.floor(startY);

    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    // Poza zakresem kanwy
    if (startX < 0 || startX >= width || startY < 0 || startY >= height) return;

    // Pobranie bezpośredniej tablicy pikseli RGBA
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Pobranie koloru piksela startowego
    const startIndex = (startY * width + startX) * 4;
    const targetR = data[startIndex];
    const targetG = data[startIndex + 1];
    const targetB = data[startIndex + 2];
    const targetA = data[startIndex + 3];

    // Nowy kolor do wypełnienia
    const [fillR, fillG, fillB] = this.hexToRgb(fillColorHex);
    const fillA = 255; // Wypełniamy pełnym kryciem

    // Jeśli kliknięto w piksel, który już ma dokładnie docelowy kolor – nic nie zmieniamy
    if (
      targetR === fillR &&
      targetG === fillG &&
      targetB === fillB &&
      targetA === fillA
    ) {
      return;
    }

    // Funkcja sprawdzająca, czy dany piksel mieści się w tolerancji koloru docelowego
    const matchesTarget = (idx) => {
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      return (
        Math.abs(r - targetR) <= tolerance &&
        Math.abs(g - targetG) <= tolerance &&
        Math.abs(b - targetB) <= tolerance &&
        Math.abs(a - targetA) <= tolerance
      );
    };

    // Tablica odwiedzonych pikseli (1 bajt na piksel dla maksymalnej wydajności)
    const visited = new Uint8Array(width * height);

    // Stos współrzędnych [x, y, x, y, ...]
    const stack = [startX, startY];
    visited[startY * width + startX] = 1;

    while (stack.length > 0) {
      const cy = stack.pop();
      const cx = stack.pop();
      const pixelIdx = (cy * width + cx) * 4;

      // Pokoloruj piksel
      data[pixelIdx] = fillR;
      data[pixelIdx + 1] = fillG;
      data[pixelIdx + 2] = fillB;
      data[pixelIdx + 3] = fillA;

      // Sprawdź 4 sąsiadów: Góra, Dół, Lewo, Prawo
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

    // Zapisanie zmodyfikowanej tablicy pikseli z powrotem na kanwę
    ctx.putImageData(imgData, 0, 0);
  }
};

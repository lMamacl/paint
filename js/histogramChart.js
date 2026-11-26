/**
 * js/histogramChart.js
 * Rysowanie wykresu słupkowego histogramu (Ćwiczenie 6) własnym kodem, z samych prymitywów kanwy:
 * prostokąty (fillRect), linie (moveTo/lineTo/stroke) i napisy (fillText). Nie używamy bibliotek
 * wykresów ani gotowych komponentów.
 *
 * WYKRES:
 *  - 256 słupków (po jednym na wartość 0–255); wysokość skalowana do NAJWYŻSZEGO słupka wykresu
 *    (skala liniowa) albo logarytmicznie: log(1 + liczba) / log(1 + największa liczba) — przydatne,
 *    gdy jeden słupek (np. biała kanwa przy wartości 255) przytłacza resztę,
 *  - oś pozioma opisana wartościami 0–255 (podziałka co 32, opisy co 64 oraz 255), oś pionowa z liczbą pikseli,
 *  - serie: kolorowe słupki; histogram podglądu rysujemy półprzezroczystym kolorem na tle dokumentu,
 *  - znaczniki progów: pionowa linia z napisem „T = 88” w kolorze znacznika,
 *  - podświetlenie słupka pod kursorem (odczyt dokładnej pozycji słupka robi panel na podstawie binFromX).
 *
 * Funkcje geometryczne (layout, binFromX, xFromBin, barHeight, yTicks, formatCount) są czyste i
 * testowane w Node (tests/histogramOps.test.js); drawChart rysuje na dowolnym kontekście 2D,
 * a render() dodatkowo dopasowuje rozdzielczość płótna do ekranu (devicePixelRatio).
 */
(function () {
  'use strict';

  const LEVELS = 256;
  const MARGIN = { left: 66, right: 12, top: 10, bottom: 30 };
  const FONT = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const COLORS = {
    background: '#0e0e11',
    grid: 'rgba(255, 255, 255, 0.07)',
    axis: '#52525b',
    text: '#a1a1aa',
    gray: '#d4d4d8',
    r: '#ef4444',
    g: '#22c55e',
    b: '#3b82f6',
    preview: '#fbbf24',
    previewFill: 'rgba(251, 191, 36, 0.5)'
  };

  // ───────────────────────── geometria (czyste funkcje) ─────────────────────────

  /** Prostokąt obszaru wykresu (bez marginesów na opisy osi) dla płótna o danym rozmiarze w pikselach CSS. */
  function layout(width, height) {
    const plotW = Math.max(LEVELS / 4, width - MARGIN.left - MARGIN.right);
    const plotH = Math.max(20, height - MARGIN.top - MARGIN.bottom);
    return { width, height, left: MARGIN.left, top: MARGIN.top, plotW, plotH, bottom: MARGIN.top + plotH };
  }

  /** Początek (x0) i koniec (x1) słupka o numerze v w pikselach; sąsiednie słupki stykają się bez luk. */
  function barSpan(v, lay) {
    const x0 = lay.left + Math.floor((v * lay.plotW) / LEVELS);
    const x1 = lay.left + Math.floor(((v + 1) * lay.plotW) / LEVELS);
    return { x0, x1: Math.max(x1, x0 + 1) };
  }

  /** Środek słupka v w pikselach (tam stawiamy pionową linię progu). */
  function xFromBin(v, lay) {
    return lay.left + ((v + 0.5) * lay.plotW) / LEVELS;
  }

  /** Numer słupka (0–255) pod współrzędną x płótna albo −1, gdy x leży poza wykresem. */
  function binFromX(x, lay) {
    const rel = x - lay.left;
    if (rel < 0 || rel >= lay.plotW) return -1;
    return Math.min(LEVELS - 1, Math.floor((rel * LEVELS) / lay.plotW));
  }

  /**
   * Wysokość słupka w pikselach. Skala liniowa: liczba / największa · wysokość wykresu.
   * Skala logarytmiczna: log10(1 + liczba) / log10(1 + największa) · wysokość wykresu.
   * Niepusty słupek ma co najmniej 1 piksel wysokości, pusty — 0.
   */
  function barHeight(count, peak, plotH, logScale) {
    if (count <= 0 || peak <= 0) return 0;
    const ratio = logScale ? Math.log10(1 + count) / Math.log10(1 + peak) : count / peak;
    return Math.max(1, Math.round(ratio * plotH));
  }

  /** Czytelny zapis liczby pikseli: 950, 1,2 tys., 3,4 mln. */
  function formatCount(n) {
    const nf = (value) => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 }).format(value);
    if (n >= 1e6) return `${nf(n / 1e6)} mln`;
    if (n >= 1e4) return `${nf(n / 1e3)} tys.`;
    return new Intl.NumberFormat('pl-PL').format(n);
  }

  /**
   * Podziałka osi pionowej: lista { value, ratio }, gdzie ratio to położenie od dołu wykresu (0–1).
   * Skala liniowa: „ładne” wartości (1, 2, 5 · 10^k), skala logarytmiczna: kolejne potęgi dziesięciu.
   */
  function yTicks(peak, logScale) {
    const ticks = [{ value: 0, ratio: 0 }];
    if (peak <= 0) return ticks;

    if (logScale) {
      const top = Math.log10(1 + peak);
      for (let value = 1; value <= peak; value *= 10) {
        ticks.push({ value, ratio: Math.log10(1 + value) / top });
      }
      return ticks;
    }

    const rough = peak / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
    const normalized = rough / magnitude;
    const step = Math.max(1, (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude);
    for (let value = step; value <= peak; value += step) {
      ticks.push({ value, ratio: value / peak });
    }
    return ticks;
  }

  // ───────────────────────── rysowanie ─────────────────────────

  /**
   * Największy licznik spośród wszystkich serii — wspólna skala słupków na jednym wykresie.
   */
  function peakOf(series) {
    let peak = 0;
    for (const s of series) {
      for (let v = 0; v < LEVELS; v++) if (s.hist[v] > peak) peak = s.hist[v];
    }
    return peak;
  }

  /**
   * Rysuje wykres na kontekście 2D.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} width   szerokość w pikselach CSS
   * @param {number} height  wysokość w pikselach CSS
   * @param {object} opts
   *   series:   [{ hist: Uint32Array(256), color: string }]
   *   logScale: boolean — skala logarytmiczna słupków
   *   additive: boolean — mieszanie kolorów serii (wspólny wykres R, G, B)
   *   markers:  [{ value: 0–255, color: string, label: string }]
   *   highlight: numer słupka do podświetlenia albo −1
   * @returns {{layout: object, peak: number}}
   */
  function drawChart(ctx, width, height, opts) {
    const options = opts || {};
    const series = options.series || [];
    const lay = layout(width, height);
    const peak = peakOf(series);
    const logScale = !!options.logScale;

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);
    ctx.font = FONT;

    // — siatka i opisy osi pionowej —
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const tick of yTicks(peak, logScale)) {
      const y = Math.round(lay.bottom - tick.ratio * lay.plotH) + 0.5;
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lay.left, y);
      ctx.lineTo(lay.left + lay.plotW, y);
      ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.fillText(formatCount(tick.value), lay.left - 6, y);
    }

    // — słupki (serie wypełnione) —
    const previousComposite = ctx.globalCompositeOperation;
    if (options.additive) ctx.globalCompositeOperation = 'lighter';
    for (const s of series) {
      ctx.fillStyle = s.color;
      if (options.additive) ctx.globalAlpha = 0.85;
      for (let v = 0; v < LEVELS; v++) {
        const h = barHeight(s.hist[v], peak, lay.plotH, logScale);
        if (h === 0) continue;
        const span = barSpan(v, lay);
        ctx.fillRect(span.x0, lay.bottom - h, span.x1 - span.x0, h);
      }
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = previousComposite || 'source-over';

    // — podświetlenie słupka pod kursorem —
    if (options.highlight >= 0 && options.highlight < LEVELS) {
      const span = barSpan(options.highlight, lay);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.fillRect(span.x0, lay.top, Math.max(2, span.x1 - span.x0), lay.plotH);
    }

    // — oś pozioma: linia, podziałka co 32, opisy 0, 64, 128, 192 i 255 —
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lay.left, lay.bottom + 0.5);
    ctx.lineTo(lay.left + lay.plotW, lay.bottom + 0.5);
    ctx.stroke();
    ctx.textBaseline = 'top';
    for (let v = 0; v <= 255; v += 32) {
      const x = Math.round(xFromBin(v, lay)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, lay.bottom);
      ctx.lineTo(x, lay.bottom + (v % 64 === 0 ? 5 : 3));
      ctx.stroke();
    }
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    for (const v of [0, 64, 128, 192, 255]) {
      ctx.fillText(String(v), Math.round(xFromBin(v, lay)), lay.bottom + 7);
    }
    ctx.textAlign = 'right';
    ctx.fillText(options.xLabel || 'jasność / wartość kanału (0–255)', lay.left + lay.plotW, lay.bottom + 18);

    // — znaczniki progów —
    drawMarkers(ctx, lay, options.markers || []);

    return { layout: lay, peak };
  }

  /** Pionowe linie progów z napisami; napisy zachodzące na siebie lądują w kolejnych wierszach. */
  function drawMarkers(ctx, lay, markers) {
    const sorted = markers.slice().sort((a, b) => a.value - b.value);
    const rows = []; // rows[i] = zajęte przedziały poziome [od, do] napisów w wierszu i
    ctx.textBaseline = 'top';
    for (const m of sorted) {
      const x = Math.round(xFromBin(m.value, lay)) + 0.5;
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, lay.top);
      ctx.lineTo(x, lay.bottom);
      ctx.stroke();

      // napis obok linii: po prawej, a przy prawym brzegu wykresu po lewej
      const textWidth = ctx.measureText(m.label).width + 8;
      const placeRight = x + 3 + textWidth <= lay.left + lay.plotW;
      const x0 = placeRight ? x + 3 : x - 3 - textWidth;
      const x1 = x0 + textWidth;

      // pierwszy wiersz, w którym napis nie zachodzi na żaden wcześniejszy
      let row = 0;
      while (rows[row] && rows[row].some((range) => x0 < range[1] + 2 && x1 > range[0] - 2)) row++;
      if (!rows[row]) rows[row] = [];
      rows[row].push([x0, x1]);

      const y0 = lay.top + 2 + row * 16;
      ctx.fillStyle = 'rgba(14, 14, 17, 0.88)';
      ctx.fillRect(x0, y0, textWidth, 15);
      ctx.fillStyle = m.color;
      ctx.textAlign = 'left';
      ctx.fillText(m.label, x0 + 4, y0 + 2);
    }
  }

  /**
   * Rysuje wykres na elemencie <canvas>: dopasowuje rozdzielczość do ekranu (devicePixelRatio),
   * rysuje i zwraca układ wykresu `layout` (do przeliczania położenia kursora na słupek przez binFromX).
   * Dla ukrytego płótna (szerokość 0) nic nie rysuje i zwraca null.
   */
  function render(canvas, opts) {
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (!cssWidth || !cssHeight) return null;
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(cssWidth * dpr);
    const pixelHeight = Math.round(cssHeight * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return drawChart(ctx, cssWidth, cssHeight, opts).layout;
  }

  const api = {
    COLORS,
    layout,
    barSpan,
    xFromBin,
    binFromX,
    barHeight,
    yTicks,
    formatCount,
    drawChart,
    render
  };

  if (typeof window !== 'undefined') {
    window.PaintHistogramChart = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();

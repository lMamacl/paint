/**
 * tests/histogramOps.test.js
 * Testy histogramu, statystyk, progów (średnia i Otsu), rozciągania, equalizacji
 * oraz geometrii wykresu słupkowego (Ćwiczenie 6).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../js/histogramOps.js');
const Chart = require('../js/histogramChart.js');

function img(width, height, pixels) {
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach((p, i) => data.set(p.length === 3 ? [...p, 255] : p, i * 4));
  return { width, height, data };
}

const grayImg = (w, h, values) => img(w, h, values.map((v) => [v, v, v]));
const same = (a, b) => Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) === 0;

test('histogram: zlicza 256 przedziałów jasności oraz R, G, B; suma = N', () => {
  const src = img(2, 2, [
    [255, 0, 0, 200],
    [0, 255, 0, 255],
    [0, 0, 255, 100],
    [100, 100, 100, 255]
  ]);
  const res = H.computeHistograms(src);
  assert.equal(res.total, 4);
  assert.equal(res.r[255], 1);
  assert.equal(res.g[255], 1);
  assert.equal(res.b[255], 1);
  // Luma: red=76, green=150, blue=29, gray=100
  assert.equal(res.gray[76], 1);
  assert.equal(res.gray[150], 1);
  assert.equal(res.gray[29], 1);
  assert.equal(res.gray[100], 1);
  const sumGray = res.gray.reduce((a, b) => a + b, 0);
  assert.equal(sumGray, 4);
});

test('statystyki: min, max i średnia jasność', () => {
  const src = grayImg(4, 1, [20, 40, 60, 80]);
  const { gray, total } = H.computeHistograms(src);
  const s = H.stats(gray, total);
  assert.equal(s.min, 20);
  assert.equal(s.max, 80);
  assert.equal(s.mean, 50);
  assert.equal(H.meanThreshold(gray, total), 50);
});

test('Otsu: obraz dwupoziomowy 0 i 255 daje środek plateau (T = 128)', () => {
  const src = grayImg(2, 1, [0, 255]);
  const { gray, total } = H.computeHistograms(src);
  assert.equal(H.otsuThreshold(gray, total), 128);
});

test('Otsu: 90% tła (200) i 10% tekstu (60) oddziela dwie klasy (środek plateau 61..200 → T = 131)', () => {
  const pixels = new Array(90).fill(200).concat(new Array(10).fill(60));
  const src = grayImg(10, 10, pixels);
  const { gray, total } = H.computeHistograms(src);
  assert.equal(H.meanThreshold(gray, total), 186);
  const otsu = H.otsuThreshold(gray, total);
  assert.equal(otsu, 131);
});

test('obraz jednolity (min = max): brak dzielenia przez zero w Otsu, rozciąganiu i equalizacji', () => {
  const src = grayImg(3, 3, new Array(9).fill(123));
  const { gray, total } = H.computeHistograms(src);
  assert.equal(H.otsuThreshold(gray, total), 123);
  assert.ok(same(H.stretchHistogram(src), src));
  assert.ok(same(H.equalizeHistogram(src), src));
});

test('obraz 1×1 nie powoduje błędu', () => {
  const src = grayImg(1, 1, [77]);
  const { gray, total } = H.computeHistograms(src);
  assert.equal(H.meanThreshold(gray, total), 77);
  assert.equal(H.otsuThreshold(gray, total), 77);
  assert.ok(same(H.stretchHistogram(src), src));
  assert.ok(same(H.equalizeHistogram(src), src));
});

test('rozciąganie histogramu: zakres 80–140 staje się 0–255, alfa zachowana, wejście nienaruszone', () => {
  const src = img(3, 1, [
    [80, 80, 80, 42],
    [110, 110, 110, 128],
    [140, 140, 140, 255]
  ]);
  const copy = new Uint8ClampedArray(src.data);
  const out = H.stretchHistogram(src);
  assert.deepEqual(Array.from(src.data), Array.from(copy));
  assert.equal(out.data[0], 0);
  assert.equal(out.data[3], 42);
  assert.equal(out.data[4], 128);
  assert.equal(out.data[7], 128);
  assert.equal(out.data[8], 255);
  assert.equal(out.data[11], 255);
});

test('equalizacja histogramu: rozszerza wąski zakres i zachowuje kolejność jasności', () => {
  const src = grayImg(4, 1, [50, 60, 70, 80]);
  const out = H.equalizeHistogram(src);
  assert.equal(out.data[0], 0);
  assert.ok(out.data[4] > out.data[0] && out.data[8] > out.data[4] && out.data[12] === 255);
  for (let i = 0; i < out.data.length; i += 4) {
    assert.equal(out.data[i], out.data[i + 1]);
    assert.equal(out.data[i], out.data[i + 2]);
  }
});

test('geometria wykresu: binFromX i barHeight (liniowa i logarytmiczna)', () => {
  const lay = Chart.layout(300, 150);
  assert.equal(Chart.binFromX(lay.left - 1, lay), -1);
  assert.equal(Chart.binFromX(lay.left, lay), 0);
  assert.equal(Chart.binFromX(lay.left + lay.plotW - 0.1, lay), 255);
  assert.equal(Chart.binFromX(lay.left + lay.plotW + 1, lay), -1);

  assert.equal(Chart.barHeight(0, 1000, 100, false), 0);
  assert.equal(Chart.barHeight(1000, 1000, 100, false), 100);
  assert.equal(Chart.barHeight(100, 1000, 100, false), 10);
  assert.ok(Chart.barHeight(10, 10000, 100, true) > Chart.barHeight(10, 10000, 100, false));
});

/**
 * tests/imageOps.test.js
 * Testy operacji na całym obrazie: skala szarości (wagi i średnia), kanały R/G/B,
 * porównanie obu skal szarości oraz pomniejszanie podglądu (Ćwiczenie 3).
 * Uruchomienie:  node --test tests/*.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const Ops = require('../js/imageOps.js');

/** Buduje obraz testowy z listy pikseli [r,g,b,a]. */
function img(width, height, pixels) {
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach((p, i) => data.set(p.length === 3 ? [...p, 255] : p, i * 4));
  return { width, height, data };
}
const px = (image, i) => Array.from(image.data.slice(i * 4, i * 4 + 4));

test('wagi: czerwony → 76, zielony → 150, niebieski → 29, biały → 255, czarny → 0', () => {
  const src = img(5, 1, [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255], [0, 0, 0]]);
  const g = Ops.grayscaleLuma(src);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => px(g, i)[0]), [76, 150, 29, 255, 0]);
});

test('średnia: czerwony/zielony/niebieski → 85, biały → 255, czarny → 0', () => {
  const src = img(5, 1, [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255], [0, 0, 0]]);
  const g = Ops.grayscaleAverage(src);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => px(g, i)[0]), [85, 85, 85, 255, 0]);
});

test('wynik skali szarości ma R = G = B, a alfa jest zachowana', () => {
  const src = img(2, 1, [[10, 200, 30, 255], [90, 40, 250, 128]]);
  for (const g of [Ops.grayscaleLuma(src), Ops.grayscaleAverage(src)]) {
    for (let i = 0; i < 2; i++) {
      const [r, gg, b] = px(g, i);
      assert.ok(r === gg && gg === b);
    }
    assert.equal(px(g, 0)[3], 255);
    assert.equal(px(g, 1)[3], 128);
  }
});

test('szarość wejściowa (R=G=B) nie zmienia się w żadnym wariancie', () => {
  const pixels = [];
  for (let v = 0; v <= 255; v++) pixels.push([v, v, v]);
  const src = img(256, 1, pixels);
  const a = Ops.grayscaleLuma(src);
  const b = Ops.grayscaleAverage(src);
  for (let v = 0; v <= 255; v++) {
    assert.equal(px(a, v)[0], v, `wagi, poziom ${v}`);
    assert.equal(px(b, v)[0], v, `średnia, poziom ${v}`);
  }
});

test('funkcje nie modyfikują obrazu wejściowego', () => {
  const src = img(2, 1, [[10, 20, 30], [200, 100, 50]]);
  const copy = Uint8ClampedArray.from(src.data);
  Ops.grayscaleLuma(src);
  Ops.grayscaleAverage(src);
  Ops.extractChannel(src, 'g', 'color');
  Ops.differenceMap(src, 4);
  Ops.compareGrayscales(src);
  assert.deepEqual(Array.from(src.data), Array.from(copy));
});

test('kanały w skali szarości: wartość kanału trafia do R, G i B', () => {
  const src = img(1, 1, [[10, 20, 30]]);
  assert.deepEqual(px(Ops.extractChannel(src, 'r', 'gray'), 0), [10, 10, 10, 255]);
  assert.deepEqual(px(Ops.extractChannel(src, 'g', 'gray'), 0), [20, 20, 20, 255]);
  assert.deepEqual(px(Ops.extractChannel(src, 'b', 'gray'), 0), [30, 30, 30, 255]);
});

test('kanały w kolorze: tylko wybrany kanał, pozostałe zerowe', () => {
  const src = img(1, 1, [[10, 20, 30]]);
  assert.deepEqual(px(Ops.extractChannel(src, 'r', 'color'), 0), [10, 0, 0, 255]);
  assert.deepEqual(px(Ops.extractChannel(src, 'g', 'color'), 0), [0, 20, 0, 255]);
  assert.deepEqual(px(Ops.extractChannel(src, 'b', 'color'), 0), [0, 0, 30, 255]);
});

test('złożenie trzech kanałów w kolorze odtwarza oryginał', () => {
  const src = img(3, 1, [[12, 34, 56], [255, 0, 128], [7, 7, 7]]);
  const r = Ops.extractChannel(src, 'r', 'color');
  const g = Ops.extractChannel(src, 'g', 'color');
  const b = Ops.extractChannel(src, 'b', 'color');
  for (let i = 0; i < 3; i++) {
    // czerwony obraz niesie R w składowej 0, zielony G w składowej 1, niebieski B w składowej 2
    assert.deepEqual(
      [px(r, i)[0], px(g, i)[1], px(b, i)[2]],
      [src.data[i * 4], src.data[i * 4 + 1], src.data[i * 4 + 2]]
    );
  }
});

test('porównanie: szary obraz → różnica zerowa', () => {
  const src = img(3, 1, [[0, 0, 0], [128, 128, 128], [255, 255, 255]]);
  const st = Ops.compareGrayscales(src);
  assert.equal(st.maxDiff, 0);
  assert.equal(st.differing, 0);
  assert.equal(st.meanAbsDiff, 0);
});

test('porównanie: czysty zielony → różnica 65 (150 − 85), niebieski → 56, czerwony → 9', () => {
  assert.equal(Ops.compareGrayscales(img(1, 1, [[0, 255, 0]])).maxDiff, 65);
  assert.equal(Ops.compareGrayscales(img(1, 1, [[0, 0, 255]])).maxDiff, 56);
  assert.equal(Ops.compareGrayscales(img(1, 1, [[255, 0, 0]])).maxDiff, 9);
});

test('porównanie: statystyki dla obrazu mieszanego', () => {
  const src = img(4, 1, [[0, 0, 0], [255, 255, 255], [0, 255, 0], [0, 0, 255]]);
  const st = Ops.compareGrayscales(src);
  assert.equal(st.total, 4);
  assert.equal(st.differing, 2);
  assert.equal(st.differingPercent, 50);
  assert.equal(st.maxDiff, 65);
  assert.equal(st.meanAbsDiff, (65 + 56) / 4);
});

test('mapa różnicy: wzmocnienie i obcięcie do 255', () => {
  const src = img(2, 1, [[0, 255, 0], [128, 128, 128]]);
  assert.deepEqual(px(Ops.differenceMap(src, 1), 0), [65, 65, 65, 255]);
  assert.deepEqual(px(Ops.differenceMap(src, 2), 0), [130, 130, 130, 255]);
  assert.deepEqual(px(Ops.differenceMap(src, 10), 0), [255, 255, 255, 255], 'obcięcie do 255');
  assert.deepEqual(px(Ops.differenceMap(src, 4), 1), [0, 0, 0, 255], 'szarość → brak różnicy');
});

test('pomniejszanie podglądu: mały obraz bez zmian, duży do zadanego boku', () => {
  const small = img(3, 2, new Array(6).fill([1, 2, 3]));
  assert.equal(Ops.downscale(small, 100), small, 'zwraca ten sam obiekt');

  const pixels = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) pixels.push([x * 10, y * 10, 0]);
  const big = img(16, 8, pixels);
  const out = Ops.downscale(big, 8);
  assert.equal(out.width, 8);
  assert.equal(out.height, 4);
  assert.equal(out.data.length, 8 * 4 * 4);
  assert.deepEqual(px(out, 0).slice(0, 3), [0, 0, 0]);
});

/**
 * tests/pointOps.test.js
 * Testy przekształceń punktowych: jasność, kontrast, negatyw, gamma, progowanie (Ćwiczenie 4).
 * Uruchomienie:  node --test tests/*.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/pointOps.js');
const Ops = require('../js/imageOps.js');

/** Buduje obraz testowy z listy pikseli [r,g,b] lub [r,g,b,a]. */
function img(width, height, pixels) {
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach((p, i) => data.set(p.length === 3 ? [...p, 255] : p, i * 4));
  return { width, height, data };
}
const px = (image, i) => Array.from(image.data.slice(i * 4, i * 4 + 4));

/** Obraz 256×1, w którym piksel v ma wartość v we wszystkich kanałach RGB. */
function ramp() {
  const pixels = [];
  for (let v = 0; v < 256; v++) pixels.push([v, v, v]);
  return img(256, 1, pixels);
}
/** Wynik operacji na rampie jako tablica 256 wartości (kanał R). */
const curve = (op) => Array.from({ length: 256 }, (_, v) => px(op(ramp()), v)[0]);

test('clamp255: obcina do zakresu 0–255', () => {
  assert.equal(P.clamp255(-5), 0);
  assert.equal(P.clamp255(0), 0);
  assert.equal(P.clamp255(128), 128);
  assert.equal(P.clamp255(255), 255);
  assert.equal(P.clamp255(300), 255);
});

// ───────────────────────── jasność ─────────────────────────

test('jasność: +100 → 200 daje 255 (obcięcie), 50 daje 150; −100 → 50 daje 0', () => {
  const src = img(3, 1, [[200, 200, 200], [50, 50, 50], [10, 120, 250]]);
  const up = P.brightness(src, 100);
  assert.deepEqual(px(up, 0).slice(0, 3), [255, 255, 255]);
  assert.deepEqual(px(up, 1).slice(0, 3), [150, 150, 150]);
  assert.deepEqual(px(up, 2).slice(0, 3), [110, 220, 255], 'każdy kanał osobno');
  const down = P.brightness(src, -100);
  assert.deepEqual(px(down, 1).slice(0, 3), [0, 0, 0]);
  assert.deepEqual(px(down, 2).slice(0, 3), [0, 20, 150]);
});

test('jasność: b = 0 nie zmienia obrazu, ±255 daje biel/czerń, bez „zawijania” wartości', () => {
  assert.deepEqual(curve((s) => P.brightness(s, 0)), Array.from({ length: 256 }, (_, v) => v));
  assert.deepEqual(curve((s) => P.brightness(s, 255)).slice(1), new Array(255).fill(255), 'v ≥ 1 + 255 → 255');
  assert.deepEqual(curve((s) => P.brightness(s, -255)).slice(0, 255), new Array(255).fill(0), 'v ≤ 254 − 255 → 0');
  // 200 + 100 = 300 nie może zawinąć się do 44
  assert.equal(curve((s) => P.brightness(s, 100))[200], 255);
});

// ───────────────────────── kontrast ─────────────────────────

test('kontrast: k = 1 nie zmienia obrazu, k = 0 daje jednolity szary 128, 128 jest punktem stałym', () => {
  assert.deepEqual(curve((s) => P.contrast(s, 1)), Array.from({ length: 256 }, (_, v) => v));
  assert.deepEqual(curve((s) => P.contrast(s, 0)), new Array(256).fill(128));
  for (const k of [0.5, 2, 3]) assert.equal(curve((s) => P.contrast(s, k))[128], 128, `k = ${k}`);
});

test('kontrast: k = 3 → 100 daje 44, 200 daje 255 (obcięcie), 0 daje 0 (obcięcie); k = 0,5 zmniejsza rozrzut', () => {
  const c3 = curve((s) => P.contrast(s, 3));
  assert.equal(c3[100], 44);
  assert.equal(c3[200], 255);
  assert.equal(c3[0], 0);
  const half = curve((s) => P.contrast(s, 0.5));
  assert.equal(half[0], 64);
  assert.equal(half[255], 192); // (255 − 128)·0,5 + 128 = 191,5 → 192
});

// ───────────────────────── negatyw ─────────────────────────

test('negatyw: 255 − v w każdym kanale, dwa razy daje oryginał', () => {
  const src = img(2, 1, [[0, 128, 255], [10, 20, 30]]);
  const neg = P.invert(src);
  assert.deepEqual(px(neg, 0).slice(0, 3), [255, 127, 0]);
  assert.deepEqual(px(neg, 1).slice(0, 3), [245, 235, 225]);
  assert.deepEqual(Array.from(P.invert(neg).data), Array.from(src.data));
});

// ───────────────────────── gamma ─────────────────────────

test('gamma: γ = 1 nie zmienia obrazu, 0 i 255 są stałe dla każdej γ', () => {
  assert.deepEqual(curve((s) => P.gamma(s, 1)), Array.from({ length: 256 }, (_, v) => v));
  for (const g of [0.1, 0.45, 2.2, 5]) {
    const c = curve((s) => P.gamma(s, g));
    assert.equal(c[0], 0, `γ = ${g}`);
    assert.equal(c[255], 255, `γ = ${g}`);
  }
});

test('gamma: γ = 2,2 rozjaśnia (128 → 186), γ = 0,45 przyciemnia (128 → 55)', () => {
  assert.equal(curve((s) => P.gamma(s, 2.2))[128], 186);
  assert.equal(curve((s) => P.gamma(s, 0.45))[128], 55);
});

test('gamma: krzywa jest niemalejąca, a γ ≤ 0 lub NaN traktowane jak 1', () => {
  for (const g of [0.1, 0.5, 1, 2.2, 5]) {
    const c = curve((s) => P.gamma(s, g));
    for (let v = 1; v < 256; v++) assert.ok(c[v] >= c[v - 1], `γ = ${g}, v = ${v}`);
  }
  const identity = Array.from({ length: 256 }, (_, v) => v);
  for (const bad of [0, -2, NaN, undefined]) {
    assert.deepEqual(curve((s) => P.gamma(s, bad)), identity, `γ = ${bad}`);
  }
});

// ───────────────────────── próg ─────────────────────────

test('próg: wynik jest czarno-biały (tylko 0 lub 255, R = G = B)', () => {
  const src = img(4, 1, [[10, 200, 30], [255, 255, 255], [0, 0, 0], [90, 90, 250]]);
  const out = P.threshold(src, 100);
  for (let i = 0; i < 4; i++) {
    const [r, g, b] = px(out, i);
    assert.ok((r === 0 || r === 255) && r === g && g === b, `piksel ${i}: ${r},${g},${b}`);
  }
});

test('próg: używa skali szarości z wagami (zielony Y = 150, czerwony Y = 76, niebieski Y = 29)', () => {
  const src = img(3, 1, [[0, 255, 0], [255, 0, 0], [0, 0, 255]]);
  const out = P.threshold(src, 128);
  assert.deepEqual([0, 1, 2].map((i) => px(out, i)[0]), [255, 0, 0]);
  // średnia arytmetyczna dałaby 85 dla wszystkich trzech — tu wyniki się różnią, więc użyto wag
});

test('próg: granica — Y = T daje biel, Y = T − 1 daje czerń; T = 0 → cały biały; T = 255 → biały tylko dla Y = 255', () => {
  const src = ramp();
  const at = (t) => curve((s) => P.threshold(s, t));
  const c128 = at(128);
  assert.equal(c128[127], 0);
  assert.equal(c128[128], 255);
  assert.deepEqual(at(0), new Array(256).fill(255));
  const c255 = at(255);
  assert.equal(c255[254], 0);
  assert.equal(c255[255], 255);
});

test('próg: zgodny z funkcją skali szarości z Ćwiczenia 3 (Y ≥ T)', () => {
  const pixels = [];
  for (let i = 0; i < 500; i++) pixels.push([(i * 37) % 256, (i * 91) % 256, (i * 13) % 256]);
  const src = img(500, 1, pixels);
  const gray = Ops.grayscaleLuma(src);
  for (const t of [0, 1, 77, 128, 200, 255]) {
    const out = P.threshold(src, t);
    for (let i = 0; i < 500; i++) {
      assert.equal(px(out, i)[0], px(gray, i)[0] >= t ? 255 : 0, `T = ${t}, piksel ${i}`);
    }
  }
});

// ───────────────────────── własności wspólne ─────────────────────────

test('wszystkie operacje: alfa zachowana, wejście niezmodyfikowane, wartości całkowite 0–255', () => {
  const src = img(3, 1, [[10, 200, 30, 255], [90, 40, 250, 128], [0, 0, 0, 0]]);
  const copy = Uint8ClampedArray.from(src.data);
  const ops = [
    (s) => P.brightness(s, 80), (s) => P.brightness(s, -255),
    (s) => P.contrast(s, 3), (s) => P.contrast(s, 0),
    (s) => P.invert(s), (s) => P.gamma(s, 0.1), (s) => P.gamma(s, 5), (s) => P.threshold(s, 90)
  ];
  for (const op of ops) {
    const out = op(src);
    assert.equal(out.width, 3);
    assert.equal(out.height, 1);
    assert.deepEqual([px(out, 0)[3], px(out, 1)[3], px(out, 2)[3]], [255, 128, 0], 'alfa bez zmian');
    for (const v of out.data) assert.ok(Number.isInteger(v) && v >= 0 && v <= 255);
  }
  assert.deepEqual(Array.from(src.data), Array.from(copy), 'wejście nie jest modyfikowane');
});

test('piksele są przetwarzane niezależnie: ten sam kolor daje ten sam wynik w każdym miejscu', () => {
  const same = [60, 130, 220];
  const src = img(4, 1, [same, [0, 0, 0], [255, 255, 255], same]);
  for (const op of [(s) => P.brightness(s, 33), (s) => P.contrast(s, 1.7), (s) => P.gamma(s, 2.2), (s) => P.threshold(s, 120)]) {
    const out = op(src);
    assert.deepEqual(px(out, 0), px(out, 3));
  }
});

test('niepoprawne parametry (NaN, undefined) dają wartości domyślne — bez NaN w obrazie', () => {
  const src = img(1, 1, [[10, 120, 250]]);
  assert.deepEqual(px(P.brightness(src, NaN), 0), [10, 120, 250, 255]);
  assert.deepEqual(px(P.contrast(src, undefined), 0), [10, 120, 250, 255]);
  assert.deepEqual(px(P.gamma(src, NaN), 0), [10, 120, 250, 255]);
});

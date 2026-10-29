/**
 * tests/colorModels.test.js
 * Testy konwersji RGB ↔ HSV oraz RGB ↔ CMYK (Ćwiczenie 3).
 * Uruchomienie:  node --test tests/*.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/colorModels.js');

/** Porównanie liczb zmiennoprzecinkowych z tolerancją. */
function near(actual, expected, eps = 1e-9, msg = '') {
  assert.ok(Math.abs(actual - expected) <= eps, `${msg} oczekiwano ${expected}, jest ${actual}`);
}

test('czerwony: HSV 0°, 100%, 100%; CMYK 0, 100, 100, 0', () => {
  const hsv = C.rgbToHsv(255, 0, 0);
  near(hsv.h, 0); near(hsv.s, 1); near(hsv.v, 1);
  const cmyk = C.rgbToCmyk(255, 0, 0);
  near(cmyk.c, 0); near(cmyk.m, 1); near(cmyk.y, 1); near(cmyk.k, 0);
});

test('kolory wzorcowe z tabeli REFERENCE_COLORS zgadzają się z oczekiwaniami', () => {
  for (const ref of C.REFERENCE_COLORS) {
    const res = C.checkReference(ref);
    assert.ok(res.ok, `${ref.name}: HSV ${res.hsv} / CMYK ${res.cmyk} ≠ wzorzec ${ref.hsv} / ${ref.cmyk}`);
  }
});

test('czarny: brak dzielenia przez zero (HSV 0,0,0; CMYK 0,0,0,100)', () => {
  const hsv = C.rgbToHsv(0, 0, 0);
  assert.deepEqual([hsv.h, hsv.s, hsv.v], [0, 0, 0]);
  const cmyk = C.rgbToCmyk(0, 0, 0);
  assert.deepEqual([cmyk.c, cmyk.m, cmyk.y, cmyk.k], [0, 0, 0, 1]);
  for (const x of [hsv.h, hsv.s, hsv.v, cmyk.c, cmyk.m, cmyk.y, cmyk.k]) {
    assert.ok(Number.isFinite(x), 'wynik musi być liczbą skończoną (nie NaN/Infinity)');
  }
});

test('biały: HSV 0°, 0%, 100%; CMYK 0, 0, 0, 0', () => {
  const hsv = C.rgbToHsv(255, 255, 255);
  assert.deepEqual([hsv.h, hsv.s, hsv.v], [0, 0, 1]);
  const cmyk = C.rgbToCmyk(255, 255, 255);
  assert.deepEqual([cmyk.c, cmyk.m, cmyk.y, cmyk.k], [0, 0, 0, 0]);
});

test('szarości: H = 0 i S = 0 dla każdego poziomu 0..255', () => {
  for (let v = 0; v <= 255; v++) {
    const hsv = C.rgbToHsv(v, v, v);
    assert.equal(hsv.h, 0);
    assert.equal(hsv.s, 0);
    near(hsv.v, v / 255);
  }
});

test('barwa H zawsze w przedziale [0, 360) — także dla fioletów blisko czerwieni', () => {
  for (let b = 0; b <= 255; b += 5) {
    const h = C.rgbToHsv(255, 0, b).h;
    assert.ok(h >= 0 && h < 360, `h=${h} dla (255,0,${b})`);
  }
});

test('HSV → RGB dla wzorców (kąty co 60°)', () => {
  assert.deepEqual(C.hsvToRgb(0, 1, 1), { r: 255, g: 0, b: 0 });
  assert.deepEqual(C.hsvToRgb(60, 1, 1), { r: 255, g: 255, b: 0 });
  assert.deepEqual(C.hsvToRgb(120, 1, 1), { r: 0, g: 255, b: 0 });
  assert.deepEqual(C.hsvToRgb(180, 1, 1), { r: 0, g: 255, b: 255 });
  assert.deepEqual(C.hsvToRgb(240, 1, 1), { r: 0, g: 0, b: 255 });
  assert.deepEqual(C.hsvToRgb(300, 1, 1), { r: 255, g: 0, b: 255 });
  assert.deepEqual(C.hsvToRgb(360, 1, 1), { r: 255, g: 0, b: 0 }, '360° = 0°');
  assert.deepEqual(C.hsvToRgb(-60, 1, 1), { r: 255, g: 0, b: 255 }, 'kąt ujemny zawija się');
  assert.deepEqual(C.hsvToRgb(123, 0, 0.5), { r: 128, g: 128, b: 128 }, 'S = 0 → szarość');
  assert.deepEqual(C.hsvToRgb(123, 1, 0), { r: 0, g: 0, b: 0 }, 'V = 0 → czerń');
});

test('CMYK → RGB dla wzorców', () => {
  assert.deepEqual(C.cmykToRgb(0, 1, 1, 0), { r: 255, g: 0, b: 0 });
  assert.deepEqual(C.cmykToRgb(1, 0, 1, 0), { r: 0, g: 255, b: 0 });
  assert.deepEqual(C.cmykToRgb(1, 1, 0, 0), { r: 0, g: 0, b: 255 });
  assert.deepEqual(C.cmykToRgb(0, 0, 0, 1), { r: 0, g: 0, b: 0 });
  assert.deepEqual(C.cmykToRgb(0, 0, 0, 0), { r: 255, g: 255, b: 255 });
  assert.deepEqual(C.cmykToRgb(0.3, 0.9, 0.2, 1), { r: 0, g: 0, b: 0 }, 'K = 1 → czarny niezależnie od CMY');
});

test('round-trip RGB → HSV → RGB jest dokładny (siatka co 5 + wszystkie szarości + narożniki)', () => {
  const check = (r, g, b) => {
    const hsv = C.rgbToHsv(r, g, b);
    const back = C.hsvToRgb(hsv.h, hsv.s, hsv.v);
    assert.deepEqual(back, { r, g, b }, `(${r},${g},${b}) → HSV → ${JSON.stringify(back)}`);
  };
  for (let r = 0; r <= 255; r += 5) for (let g = 0; g <= 255; g += 5) for (let b = 0; b <= 255; b += 5) check(r, g, b);
  for (let v = 0; v <= 255; v++) check(v, v, v);
  for (const r of [0, 255]) for (const g of [0, 255]) for (const b of [0, 255]) check(r, g, b);
});

test('round-trip RGB → CMYK → RGB jest dokładny (siatka co 5 + wszystkie szarości + narożniki)', () => {
  const check = (r, g, b) => {
    const k = C.rgbToCmyk(r, g, b);
    const back = C.cmykToRgb(k.c, k.m, k.y, k.k);
    assert.deepEqual(back, { r, g, b }, `(${r},${g},${b}) → CMYK → ${JSON.stringify(back)}`);
  };
  for (let r = 0; r <= 255; r += 5) for (let g = 0; g <= 255; g += 5) for (let b = 0; b <= 255; b += 5) check(r, g, b);
  for (let v = 0; v <= 255; v++) check(v, v, v);
  for (const r of [0, 255]) for (const g of [0, 255]) for (const b of [0, 255]) check(r, g, b);
});

test('wartości po konwersji zawsze mieszczą się w zakresach', () => {
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
    const hsv = C.rgbToHsv(r, g, b);
    assert.ok(hsv.h >= 0 && hsv.h < 360 && hsv.s >= 0 && hsv.s <= 1 && hsv.v >= 0 && hsv.v <= 1);
    const k = C.rgbToCmyk(r, g, b);
    for (const x of [k.c, k.m, k.y, k.k]) assert.ok(x >= 0 && x <= 1);
  }
});

test('przykładowy kolor niewzorcowy (59, 130, 246): HSV ≈ 217,2°, 76%, 96,5%', () => {
  const hsv = C.rgbToHsv(59, 130, 246);
  near(hsv.h, 217.2, 0.1); near(hsv.s * 100, 76, 0.1); near(hsv.v * 100, 96.5, 0.1);
  const k = C.rgbToCmyk(59, 130, 246);
  near(k.c * 100, 76, 0.1); near(k.m * 100, 47.2, 0.1); near(k.y * 100, 0, 0.1); near(k.k * 100, 3.5, 0.1);
});

test('HEX: zapis, odczyt, skrót #rgb i błędne dane', () => {
  assert.equal(C.rgbToHex(255, 0, 128), '#ff0080');
  assert.equal(C.rgbToHex(0, 0, 0), '#000000');
  assert.equal(C.rgbToHex(300, -5, 15.4), '#ff000f', 'wartości spoza zakresu są obcinane');
  assert.deepEqual(C.hexToRgb('#3B82F6'), { r: 59, g: 130, b: 246 });
  assert.deepEqual(C.hexToRgb('3b82f6'), { r: 59, g: 130, b: 246 });
  assert.deepEqual(C.hexToRgb('#f0a'), { r: 255, g: 0, b: 170 });
  for (const bad of ['', '#', '#12', '#12345', '#1234567', '#gg0000', null, undefined, 12]) {
    assert.equal(C.hexToRgb(bad), null, `powinno odrzucić: ${bad}`);
  }
});

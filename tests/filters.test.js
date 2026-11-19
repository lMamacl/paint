/**
 * tests/filters.test.js
 * Testy filtrów z sąsiedztwem: splot 3×3, średnia, Gauss, wyostrzanie, mediana, Sobel
 * oraz szum „sól i pieprz” (Ćwiczenie 5).
 * Uruchomienie:  node --test tests/*.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/filters.js');
const Ops = require('../js/imageOps.js');

/** Buduje obraz testowy z listy pikseli [r,g,b] lub [r,g,b,a]. */
function img(width, height, pixels) {
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach((p, i) => data.set(p.length === 3 ? [...p, 255] : p, i * 4));
  return { width, height, data };
}
/** Obraz w skali szarości z listy wartości. */
const grayImg = (w, h, values) => img(w, h, values.map((v) => [v, v, v]));
/** Obraz jednolity. */
const flat = (w, h, rgb) => img(w, h, new Array(w * h).fill(rgb));
const px = (image, x, y) => Array.from(image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));
const R = (image) => Array.from({ length: image.width * image.height }, (_, i) => image.data[i * 4]);
const same = (a, b) => Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) === 0;

const IDENTITY = [0, 0, 0, 0, 1, 0, 0, 0, 0];

// ───────────────────────── splot z maską ─────────────────────────

test('splot: maska jednostkowa (środek 1, dzielnik 1) nie zmienia obrazu', () => {
  const src = img(3, 2, [[10, 20, 30], [40, 50, 60], [70, 80, 90], [1, 2, 3], [250, 5, 128], [0, 255, 7]]);
  assert.ok(same(F.convolve3x3(src, IDENTITY, 1), src));
});

test('splot: ręcznie policzone sąsiedztwo 3×3 w środku obrazu (średnia z 9 pikseli)', () => {
  const src = grayImg(3, 3, [10, 20, 30, 40, 50, 60, 70, 80, 90]);
  assert.equal(px(F.convolve3x3(src, F.MASKS.mean.kernel, F.MASKS.mean.divisor), 1, 1)[0], 50);
  // wagi Gaussa: (10+2·20+30 + 2·40+4·50+2·60 + 70+2·80+90) / 16 = 800/16 = 50
  assert.equal(px(F.convolve3x3(src, F.MASKS.gauss.kernel, F.MASKS.gauss.divisor), 1, 1)[0], 50);
});

test('brzegi: powielenie skrajnych pikseli — narożnik (0,0) maski średniej', () => {
  // obraz 3×3: wartości 0,10,…,80. Sąsiedzi (0,0) po powieleniu brzegu:
  // wiersz −1 → wiersz 0:  0, 0, 10;  wiersz 0: 0, 0, 10;  wiersz 1: 30, 30, 40  → suma 120, /9 = 13,3 → 13
  const src = grayImg(3, 3, [0, 10, 20, 30, 40, 50, 60, 70, 80]);
  const out = F.convolve3x3(src, F.MASKS.mean.kernel, 9);
  assert.equal(px(out, 0, 0)[0], 13);
  // prawy dolny róg (2,2): 40 50 50 | 70 80 80 | 70 80 80 → 600 / 9 = 66,7 → 67
  assert.equal(px(out, 2, 2)[0], 67);
});

test('brzegi: jednolity obraz pozostaje jednolity także na krawędziach (średnia, Gauss, wyostrzanie, mediana)', () => {
  const src = flat(5, 4, [90, 140, 200]);
  assert.ok(same(F.convolve3x3(src, F.MASKS.mean.kernel, F.MASKS.mean.divisor), src));
  assert.ok(same(F.convolve3x3(src, F.MASKS.gauss.kernel, F.MASKS.gauss.divisor), src));
  assert.ok(same(F.convolve3x3(src, F.MASKS.sharpen.kernel, F.MASKS.sharpen.divisor), src));
  assert.ok(same(F.median3x3(src), src));
});

test('brzegi: obrazy 1×1, 1×N i N×1 nie powodują błędu', () => {
  for (const [w, h] of [[1, 1], [1, 4], [4, 1]]) {
    const src = flat(w, h, [100, 100, 100]);
    assert.ok(same(F.convolve3x3(src, F.MASKS.mean.kernel, 9), src), `${w}×${h}`);
    assert.ok(same(F.median3x3(src), src), `${w}×${h}`);
    assert.equal(F.sobel(src, 'magnitude').data[0], 0, `${w}×${h}`);
  }
});

test('splot: wynik jest obcinany do 0–255 (współczynniki ujemne i dodatnie)', () => {
  const src = grayImg(3, 1, [0, 255, 0]);
  const out = F.convolve3x3(src, [0, 0, 0, -1, 3, -1, 0, 0, 0], 1);
  assert.deepEqual(R(out), [0, 255, 0], 'ujemne → 0, powyżej 255 → 255');
  const bright = F.convolve3x3(grayImg(1, 1, [200]), [0, 0, 0, 0, 2, 0, 0, 0, 0], 1);
  assert.equal(px(bright, 0, 0)[0], 255);
});

test('splot: dzielnik skaluje wynik (suma/dzielnik, zaokrąglenie)', () => {
  const src = grayImg(1, 1, [100]);
  assert.equal(px(F.convolve3x3(src, [0, 0, 0, 0, 1, 0, 0, 0, 0], 2), 0, 0)[0], 50);
  assert.equal(px(F.convolve3x3(src, [0, 0, 0, 0, 1, 0, 0, 0, 0], 3), 0, 0)[0], 33);
  assert.equal(px(F.convolve3x3(src, [0, 0, 0, 0, 1, 0, 0, 0, 0], -1), 0, 0)[0], 0, 'ujemny dzielnik odwraca znak → obcięte do 0');
});

test('splot: niepoprawna maska lub dzielnik zgłaszają błąd (nie NaN w obrazie)', () => {
  const src = flat(2, 2, [1, 2, 3]);
  assert.throws(() => F.convolve3x3(src, IDENTITY, 0), /Dzielnik/);
  assert.throws(() => F.convolve3x3(src, IDENTITY, NaN), /Dzielnik/);
  assert.throws(() => F.convolve3x3(src, [1, 2, 3], 1), /9 współczynników/);
  assert.throws(() => F.convolve3x3(src, [0, 0, 0, 0, NaN, 0, 0, 0, 0], 1), /liczbami/);
});

test('splot: maska niesymetryczna jest przykładana bez odwracania (współczynnik [0] mnoży lewego górnego sąsiada)', () => {
  const src = grayImg(3, 3, [10, 0, 0, 0, 0, 0, 0, 0, 0]);
  // tylko lewy górny sąsiad ma znaczenie: piksel (1,1) powinien „zobaczyć” 10 w swoim lewym górnym rogu
  const out = F.convolve3x3(src, [1, 0, 0, 0, 0, 0, 0, 0, 0], 1);
  assert.equal(px(out, 1, 1)[0], 10);
  assert.equal(px(out, 0, 0)[0], 10, 'brzeg: powielony skrajny piksel');
});

test('kanały R, G, B są filtrowane niezależnie; alfa kopiowana', () => {
  const src = img(3, 1, [[0, 100, 255, 255], [90, 0, 30, 128], [0, 100, 255, 0]]);
  const out = F.convolve3x3(src, F.MASKS.mean.kernel, 9);
  // wysokość 1: trzy wiersze sąsiedztwa to ten sam wiersz (powielenie brzegu), więc średnia z 3 pikseli poziomych
  assert.equal(px(out, 1, 0)[0], Math.round((0 + 90 + 0) / 3));
  assert.equal(px(out, 1, 0)[1], Math.round((100 + 0 + 100) / 3));
  assert.equal(px(out, 1, 0)[2], Math.round((255 + 30 + 255) / 3));
  assert.deepEqual([px(out, 0, 0)[3], px(out, 1, 0)[3], px(out, 2, 0)[3]], [255, 128, 0]);
});

test('wejście nie jest modyfikowane przez żaden filtr', () => {
  const src = img(4, 3, Array.from({ length: 12 }, (_, i) => [(i * 37) % 256, (i * 91) % 256, (i * 13) % 256]));
  const copy = Uint8ClampedArray.from(src.data);
  F.convolve3x3(src, F.MASKS.gauss.kernel, 16);
  F.median3x3(src);
  F.sobel(src, 'magnitude');
  F.addSaltPepper(src, 50, 3);
  assert.deepEqual(Array.from(src.data), Array.from(copy));
});

// ───────────────────────── filtry wygładzające i wyostrzający ─────────────────────────

test('maski: suma współczynników zgodna z dzielnikiem (średnia 9, Gauss 16, wyostrzanie 1)', () => {
  for (const key of ['mean', 'gauss', 'sharpen']) {
    const m = F.MASKS[key];
    const sum = m.kernel.reduce((a, b) => a + b, 0);
    assert.equal(sum, m.divisor, key);
  }
  assert.equal(F.MASKS.sharpen.kernel[4], 5, 'maska Laplace’a z centralnym współczynnikiem 5');
});

test('wygładzanie: pojedynczy jasny piksel jest rozmywany (średnia 1/9, Gauss 4/16)', () => {
  const src = grayImg(3, 3, [0, 0, 0, 0, 90, 0, 0, 0, 0]);
  const mean = F.convolve3x3(src, F.MASKS.mean.kernel, 9);
  assert.deepEqual(R(mean), new Array(9).fill(10));
  const gauss = F.convolve3x3(src, F.MASKS.gauss.kernel, 16);
  assert.equal(px(gauss, 1, 1)[0], Math.round(90 * 4 / 16));
  assert.equal(px(gauss, 0, 1)[0], Math.round(90 * 2 / 16));
  assert.equal(px(gauss, 0, 0)[0], Math.round(90 * 1 / 16));
});

test('wyostrzanie: krawędź zyskuje kontrast (przekroczenia obcięte do 0–255), obszar jednolity bez zmian', () => {
  const src = grayImg(5, 1, [100, 100, 100, 200, 200]);
  const out = F.convolve3x3(src, F.MASKS.sharpen.kernel, 1);
  // przy krawędzi: ciemniejsza strona ciemnieje, jasna jaśnieje
  assert.ok(px(out, 2, 0)[0] < 100, `ciemna strona: ${px(out, 2, 0)[0]}`);
  assert.ok(px(out, 3, 0)[0] > 200, `jasna strona: ${px(out, 3, 0)[0]}`);
  assert.equal(px(out, 0, 0)[0], 100);
  const bright = F.convolve3x3(grayImg(3, 1, [250, 255, 0]), F.MASKS.sharpen.kernel, 1);
  for (const v of R(bright)) assert.ok(v >= 0 && v <= 255);
});

// ───────────────────────── filtr medianowy ─────────────────────────

test('mediana: usuwa pojedynczy piksel „soli” i „pieprzu” w jednolitym obszarze', () => {
  const salt = flat(5, 5, [100, 100, 100]);
  salt.data.set([255, 255, 255, 255], (2 * 5 + 2) * 4);
  assert.ok(same(F.median3x3(salt), flat(5, 5, [100, 100, 100])));
  const pepper = flat(5, 5, [100, 100, 100]);
  pepper.data.set([0, 0, 0, 255], (1 * 5 + 3) * 4);
  assert.ok(same(F.median3x3(pepper), flat(5, 5, [100, 100, 100])));
});

test('mediana: wartość środkowa z 9 sąsiadów, osobno dla każdego kanału', () => {
  // okno 3×3 z kanałem R = 1..9 ułożonym wierszami; mediana = 5
  const pixels = Array.from({ length: 9 }, (_, i) => [i + 1, 9 - i, 5]);
  const out = F.median3x3(img(3, 3, pixels));
  assert.deepEqual(px(out, 1, 1).slice(0, 3), [5, 5, 5]);
});

test('mediana: zachowuje ostrą krawędź (średnia ją rozmywa)', () => {
  const src = grayImg(6, 3, [0, 0, 0, 200, 200, 200, 0, 0, 0, 200, 200, 200, 0, 0, 0, 200, 200, 200]);
  const median = F.median3x3(src);
  const mean = F.convolve3x3(src, F.MASKS.mean.kernel, 9);
  assert.deepEqual(R(median), R(src), 'krawędź pionowa pozostaje');
  assert.notDeepEqual(R(mean), R(src));
});

// ───────────────────────── Sobel ─────────────────────────

test('Sobel: jednolity obraz → Gx = Gy = 0 i czarny wynik', () => {
  const src = flat(6, 5, [90, 140, 200]);
  const g = F.sobelGradients(src);
  assert.ok(g.gx.every((v) => v === 0) && g.gy.every((v) => v === 0));
  assert.ok(R(F.sobel(src, 'magnitude')).every((v) => v === 0));
});

test('Sobel: pionowa krawędź 0 → 200: Gx = 800 po obu stronach krawędzi, Gy = 0, moduł obcięty do 255', () => {
  const src = grayImg(6, 3, Array.from({ length: 18 }, (_, i) => ((i % 6) < 3 ? 0 : 200)));
  const g = F.sobelGradients(src);
  const mid = [6, 7, 8, 9, 10, 11].map((i) => g.gx[i]);
  assert.deepEqual(mid, [0, 0, 800, 800, 0, 0]);
  assert.ok(g.gy.every((v) => v === 0));
  assert.deepEqual(R(F.sobel(src, 'magnitude')).slice(6, 12), [0, 0, 255, 255, 0, 0]);
});

test('Sobel: pozioma krawędź daje Gy (nie Gx); znak Gx zależy od kierunku przejścia jasności', () => {
  const horizontal = grayImg(3, 6, Array.from({ length: 18 }, (_, i) => (Math.floor(i / 3) < 3 ? 0 : 100)));
  const g = F.sobelGradients(horizontal);
  assert.ok(g.gx.every((v) => v === 0));
  assert.equal(g.gy[3 * 3 + 1], 400, 'środek, tuż pod krawędzią');
  const rising = F.sobelGradients(grayImg(4, 1, [0, 0, 100, 100]));
  const falling = F.sobelGradients(grayImg(4, 1, [100, 100, 0, 0]));
  assert.equal(rising.gx[1], 400);
  assert.equal(falling.gx[1], -400);
  // widok |Gx| nie ma znaku
  assert.equal(px(F.sobel(grayImg(4, 1, [100, 100, 0, 0]), 'gx'), 1, 0)[0], 255);
});

test('Sobel: moduł = √(Gx² + Gy²) dla krawędzi ukośnej; widoki gx / gy / magnitude', () => {
  // schodek ukośny 3×3: lewy górny róg ciemny, reszta jasna
  const src = grayImg(3, 3, [0, 0, 100, 0, 100, 100, 100, 100, 100]);
  const g = F.sobelGradients(src);
  const i = 4; // środek
  const expected = Math.round(Math.sqrt(g.gx[i] ** 2 + g.gy[i] ** 2));
  assert.equal(px(F.sobel(src, 'magnitude'), 1, 1)[0], Math.min(255, expected));
  assert.equal(px(F.sobel(src, 'gx'), 1, 1)[0], Math.min(255, Math.abs(g.gx[i])));
  assert.equal(px(F.sobel(src, 'gy'), 1, 1)[0], Math.min(255, Math.abs(g.gy[i])));
});

test('Sobel: liczony na skali szarości z wagami (zielony Y = 150 daje silniejszą krawędź niż niebieski Y = 29)', () => {
  const green = img(4, 1, [[0, 0, 0], [0, 0, 0], [0, 255, 0], [0, 255, 0]]);
  const blue = img(4, 1, [[0, 0, 0], [0, 0, 0], [0, 0, 255], [0, 0, 255]]);
  const gray = Ops.grayscaleLuma(green);
  assert.equal(px(gray, 2, 0)[0], 150);
  assert.ok(F.sobelGradients(green).gx[1] > F.sobelGradients(blue).gx[1]);
  const out = F.sobel(green, 'magnitude');
  assert.ok(px(out, 1, 0).slice(0, 3).every((v) => v === px(out, 1, 0)[0]), 'wynik jest szary (R = G = B)');
});

// ───────────────────────── szum sól i pieprz ─────────────────────────

test('szum: 0% nie zmienia obrazu, 100% zamienia każdy piksel na czarny lub biały', () => {
  const src = flat(20, 20, [120, 60, 200]);
  assert.ok(same(F.addSaltPepper(src, 0, 5), src));
  const all = F.addSaltPepper(src, 100, 5);
  for (let i = 0; i < 400; i++) {
    const [r, g, b] = px(all, i % 20, Math.floor(i / 20));
    assert.ok((r === 0 || r === 255) && r === g && g === b);
  }
});

test('szum: odsetek zaszumionych pikseli jest bliski zadanemu (tolerancja statystyczna)', () => {
  const src = flat(200, 200, [120, 60, 200]);
  for (const percent of [1, 5, 20, 50]) {
    const out = F.addSaltPepper(src, percent, 11);
    let changed = 0;
    for (let i = 0; i < 40000; i++) if (out.data[i * 4] !== 120) changed++;
    const measured = (changed / 40000) * 100;
    assert.ok(Math.abs(measured - percent) < 1.5, `zadane ${percent}%, zmierzone ${measured.toFixed(2)}%`);
  }
});

test('szum: „sól” i „pieprz” występują mniej więcej po równo', () => {
  const out = F.addSaltPepper(flat(200, 200, [120, 60, 200]), 30, 3);
  let salt = 0;
  let pepper = 0;
  for (let i = 0; i < 40000; i++) {
    if (out.data[i * 4] === 255) salt++;
    if (out.data[i * 4] === 0) pepper++;
  }
  assert.ok(Math.abs(salt - pepper) / (salt + pepper) < 0.1, `sól ${salt}, pieprz ${pepper}`);
});

test('szum: to samo ziarno daje ten sam wynik, inne ziarno inny; alfa bez zmian', () => {
  const src = img(30, 30, new Array(900).fill([120, 60, 200, 77]));
  assert.ok(same(F.addSaltPepper(src, 10, 42), F.addSaltPepper(src, 10, 42)));
  assert.ok(!same(F.addSaltPepper(src, 10, 42), F.addSaltPepper(src, 10, 43)));
  const out = F.addSaltPepper(src, 100, 1);
  for (let i = 0; i < 900; i++) assert.equal(out.data[i * 4 + 3], 77);
});

test('szum: zwiększenie natężenia przy tym samym ziarnie tylko dokłada piksele (stabilny podgląd z suwakiem)', () => {
  const src = flat(60, 60, [120, 60, 200]);
  const low = F.addSaltPepper(src, 5, 9);
  const high = F.addSaltPepper(src, 15, 9);
  for (let i = 0; i < 3600; i++) {
    if (low.data[i * 4] !== 120) assert.equal(high.data[i * 4], low.data[i * 4], `piksel ${i} zmienił wartość`);
  }
});

test('szum i filtry: mediana usuwa szum „sól i pieprz” skuteczniej niż średnia', () => {
  // gładki gradient + 5% szumu; błąd średniokwadratowy względem czystego obrazu
  const w = 64;
  const h = 64;
  const clean = img(w, h, Array.from({ length: w * h }, (_, i) => [(i % w) * 3, Math.floor(i / w) * 3, 120]));
  const noisy = F.addSaltPepper(clean, 5, 7);
  const mse = (a, b) => {
    let sum = 0;
    for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) sum += (a.data[i + c] - b.data[i + c]) ** 2;
    return sum / (w * h * 3);
  };
  const mseNoisy = mse(clean, noisy);
  const mseMean = mse(clean, F.convolve3x3(noisy, F.MASKS.mean.kernel, 9));
  const mseMedian = mse(clean, F.median3x3(noisy));
  assert.ok(mseMean < mseNoisy, 'średnia poprawia obraz');
  assert.ok(mseMedian < mseMean / 5, `mediana (${mseMedian.toFixed(1)}) znacznie lepsza niż średnia (${mseMean.toFixed(1)})`);
});

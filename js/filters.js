/**
 * js/filters.js
 * Filtry obrazu z uwzględnieniem sąsiedztwa piksela (Ćwiczenie 5): splot z maską 3×3, filtry
 * uśredniający, Gaussa i wyostrzający (maską Laplace'a), filtr medianowy, operator Sobela
 * oraz szum „sól i pieprz”.
 *
 * ZAKRES: moduł pracuje wyłącznie na obiektach ImageData i nie zna DOM-u ani kanwy, dzięki czemu
 * można go testować w Node (tests/filters.test.js). Żadne gotowe filtry (CSS filter, ctx.filter,
 * biblioteki) nie są używane — każdy piksel i jego sąsiedztwo przechodzimy własną pętlą.
 * Funkcje zwracają NOWY obraz i nie modyfikują wejścia.
 *
 * OBSŁUGA BRZEGÓW OBRAZU (powielenie skrajnych pikseli):
 * Dla piksela leżącego przy krawędzi część sąsiadów 3×3 wypada poza obraz. Zamiast ich pomijać
 * (co zmieniałoby sumę współczynników maski i ściemniało brzegi) przyjmujemy, że obraz „przedłuża się”
 * powtórzeniem skrajnych pikseli: współrzędną sąsiada obcinamy do przedziału [0, szerokość − 1]
 * i [0, wysokość − 1] (funkcja clampIndex). Dzięki temu każdy piksel ma zawsze komplet 9 sąsiadów,
 * a jednolity obraz pozostaje jednolity także na brzegach.
 *
 * SPLOT CZY KORELACJA: maska jest przykładana „tak, jak jest zapisana” (współczynnik w lewym górnym
 * rogu mnoży lewego górnego sąsiada), bez odwracania maski. Dla masek symetrycznych (średnia, Gauss,
 * wyostrzanie) nie ma to znaczenia. Dla niesymetrycznych odwrócenie maski dałoby wynik odbity
 * (np. dla Sobela zmieniłby się tylko znak Gx i Gy, a moduł gradientu zostałby ten sam).
 *
 * KAŻDY wynik filtru maskowego jest dzielony przez dzielnik, zaokrąglany i OBCINANY do zakresu 0–255
 * (clamp255). Filtry (poza Sobelem) działają osobno na kanałach R, G i B; kanał alfa jest kopiowany.
 */
(function () {
  'use strict';

  /** Gotowe maski 3×3 zapisane wierszami (lewy górny róg pierwszy) wraz z dzielnikiem. */
  const MASKS = {
    mean: { label: 'Uśredniający', kernel: [1, 1, 1, 1, 1, 1, 1, 1, 1], divisor: 9 },
    gauss: { label: 'Gaussa', kernel: [1, 2, 1, 2, 4, 2, 1, 2, 1], divisor: 16 },
    sharpen: { label: 'Wyostrzanie (Laplace)', kernel: [0, -1, 0, -1, 5, -1, 0, -1, 0], divisor: 1 }
  };

  /** Maski Sobela: pochodna pozioma (Gx) i pionowa (Gy). */
  const SOBEL_GX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const SOBEL_GY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  // ───────────────────────── pomocnicze ─────────────────────────

  /** Obcina wartość do zakresu 0–255. */
  function clamp255(v) {
    if (v < 0) return 0;
    if (v > 255) return 255;
    return v;
  }

  /** Obcina indeks do [0, max] — to jest „powielenie skrajnych pikseli” przy brzegach. */
  function clampIndex(i, max) {
    if (i < 0) return 0;
    if (i > max) return max;
    return i;
  }

  function finiteOr(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }

  /** Tworzy pusty obraz o rozmiarze wzorca (w Node, gdzie nie ma ImageData, zwykły obiekt). */
  function createLike(src) {
    if (typeof ImageData !== 'undefined') {
      return new ImageData(src.width, src.height);
    }
    return { width: src.width, height: src.height, data: new Uint8ClampedArray(src.width * src.height * 4) };
  }

  /** Funkcja skali szarości z Ćwiczenia 3 (w przeglądarce globalna, w Node z pliku). */
  function imageOps() {
    if (typeof window !== 'undefined' && window.PaintImageOps) return window.PaintImageOps;
    if (typeof require === 'function') return require('./imageOps.js');
    throw new Error('PaintFilters: brak modułu PaintImageOps (załaduj js/imageOps.js wcześniej).');
  }

  /** Wyciąga jeden kanał (0 = R, 1 = G, 2 = B) jako płaską tablicę w*h. */
  function channelPlane(src, channel) {
    const n = src.width * src.height;
    const plane = new Uint8Array(n);
    const s = src.data;
    for (let i = 0; i < n; i++) plane[i] = s[i * 4 + channel];
    return plane;
  }

  /**
   * Suma ważona sąsiedztwa 3×3 piksela (x, y) w jednej płaszczyźnie: Σ maska[k] · sąsiad[k].
   * Sąsiedzi spoza obrazu są zastępowani skrajnymi pikselami (clampIndex).
   * Wynik jest surowy: bez dzielenia, zaokrąglania i obcinania (potrzebny Sobelowi ze znakiem).
   */
  function neighborhoodSum(plane, width, height, x, y, kernel) {
    let sum = 0;
    for (let ky = -1; ky <= 1; ky++) {
      const yy = clampIndex(y + ky, height - 1);
      for (let kx = -1; kx <= 1; kx++) {
        const xx = clampIndex(x + kx, width - 1);
        sum += kernel[(ky + 1) * 3 + (kx + 1)] * plane[yy * width + xx];
      }
    }
    return sum;
  }

  /** Sprawdza maskę (9 skończonych liczb) i dzielnik (skończony, różny od zera); inaczej rzuca wyjątek. */
  function assertMask(kernel, divisor) {
    if (!kernel || kernel.length !== 9) {
      throw new RangeError('Maska musi mieć dokładnie 9 współczynników (3×3).');
    }
    for (let i = 0; i < 9; i++) {
      if (typeof kernel[i] !== 'number' || !isFinite(kernel[i])) {
        throw new RangeError('Wszystkie współczynniki maski muszą być liczbami.');
      }
    }
    if (typeof divisor !== 'number' || !isFinite(divisor) || divisor === 0) {
      throw new RangeError('Dzielnik musi być liczbą różną od zera.');
    }
  }

  // ───────────────────────── splot z maską ─────────────────────────

  /**
   * Uniwersalny splot obrazu z maską 3×3.
   * Dla każdego piksela i każdego z kanałów R, G, B:  wynik = obetnij0255(zaokrąglij(Σ maska·sąsiad / dzielnik)).
   * @param {ImageData} src
   * @param {number[]} kernel  9 współczynników zapisanych wierszami (lewy górny róg pierwszy)
   * @param {number} divisor   dzielnik (np. 9 dla średniej, 16 dla Gaussa); nie może być zerem
   * @returns {ImageData} nowy obraz; alfa skopiowana
   */
  function convolve3x3(src, kernel, divisor) {
    assertMask(kernel, divisor);
    const w = src.width;
    const h = src.height;
    const out = createLike(src);
    const d = out.data;
    const s = src.data;

    for (let channel = 0; channel < 3; channel++) {
      const plane = channelPlane(src, channel);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const sum = neighborhoodSum(plane, w, h, x, y, kernel);
          d[(y * w + x) * 4 + channel] = clamp255(Math.round(sum / divisor));
        }
      }
    }
    for (let i = 3; i < s.length; i += 4) d[i] = s[i];
    return out;
  }

  // ───────────────────────── filtr medianowy ─────────────────────────

  /**
   * Filtr medianowy 3×3: dla każdego piksela i każdego kanału RGB zbiera 9 sąsiadów
   * (z powieleniem brzegów), sortuje je przez wstawianie i bierze wartość środkową (5. z 9).
   */
  function median3x3(src) {
    const w = src.width;
    const h = src.height;
    const out = createLike(src);
    const d = out.data;
    const s = src.data;
    const window9 = new Int32Array(9);

    for (let channel = 0; channel < 3; channel++) {
      const plane = channelPlane(src, channel);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let count = 0;
          for (let ky = -1; ky <= 1; ky++) {
            const yy = clampIndex(y + ky, h - 1);
            for (let kx = -1; kx <= 1; kx++) {
              const value = plane[yy * w + clampIndex(x + kx, w - 1)];
              // sortowanie przez wstawianie do rosnącej tablicy window9[0..count)
              let j = count - 1;
              while (j >= 0 && window9[j] > value) {
                window9[j + 1] = window9[j];
                j--;
              }
              window9[j + 1] = value;
              count++;
            }
          }
          d[(y * w + x) * 4 + channel] = window9[4];
        }
      }
    }
    for (let i = 3; i < s.length; i += 4) d[i] = s[i];
    return out;
  }

  // ───────────────────────── operator Sobela ─────────────────────────

  /**
   * Surowe gradienty Sobela obrazu w skali szarości (funkcja grayscaleLuma z Ćwiczenia 3).
   * Gx i Gy mają znak i NIE są obcinane (obcinanie dopiero po obliczeniu modułu).
   * @returns {{width:number, height:number, gx:Int32Array, gy:Int32Array}}
   */
  function sobelGradients(src) {
    const w = src.width;
    const h = src.height;
    const gray = imageOps().grayscaleLuma(src);
    const plane = channelPlane(gray, 0);
    const gx = new Int32Array(w * h);
    const gy = new Int32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        gx[y * w + x] = neighborhoodSum(plane, w, h, x, y, SOBEL_GX);
        gy[y * w + x] = neighborhoodSum(plane, w, h, x, y, SOBEL_GY);
      }
    }
    return { width: w, height: h, gx, gy };
  }

  /**
   * Obraz krawędzi operatorem Sobela w skali szarości.
   * @param {'magnitude'|'gx'|'gy'} view  moduł gradientu √(Gx² + Gy²), |Gx| albo |Gy|; wynik obcięty do 0–255
   */
  function sobel(src, view) {
    const g = sobelGradients(src);
    const out = createLike(src);
    const d = out.data;
    const s = src.data;
    for (let i = 0; i < g.gx.length; i++) {
      let value;
      if (view === 'gx') value = Math.abs(g.gx[i]);
      else if (view === 'gy') value = Math.abs(g.gy[i]);
      else value = Math.sqrt(g.gx[i] * g.gx[i] + g.gy[i] * g.gy[i]);
      const v = clamp255(Math.round(value));
      d[i * 4] = v;
      d[i * 4 + 1] = v;
      d[i * 4 + 2] = v;
      d[i * 4 + 3] = s[i * 4 + 3];
    }
    return out;
  }

  // ───────────────────────── szum „sól i pieprz” ─────────────────────────

  /** Generator liczb pseudolosowych z ziarnem (mulberry32): to samo ziarno daje ten sam ciąg. */
  function createRandom(seed) {
    let a = Math.floor(finiteOr(seed, 1)) | 0;
    return function next() {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Szum „sól i pieprz”: każdy piksel z prawdopodobieństwem percent/100 zamieniany jest na czarny albo
   * biały (po 50%) we wszystkich kanałach RGB; alfa bez zmian. Dla każdego piksela losujemy ZAWSZE dwie
   * liczby (czy zaszumić, jaki kolor), więc przy tym samym ziarnie zwiększenie natężenia tylko dokłada
   * zaszumione piksele, a istniejące zostają — podgląd z suwakiem się nie „przetasowuje”, a wynik
   * „Zastosuj” jest identyczny z podglądem.
   * @param {number} percent natężenie: odsetek pikseli (0–100)
   * @param {number} seed    ziarno generatora
   */
  function addSaltPepper(src, percent, seed) {
    const p = Math.min(100, Math.max(0, finiteOr(percent, 0))) / 100;
    const random = createRandom(seed);
    const out = createLike(src);
    out.data.set(src.data);
    const d = out.data;
    for (let i = 0; i < d.length; i += 4) {
      const noisy = random() < p;
      const color = random() < 0.5 ? 0 : 255;
      if (noisy) {
        d[i] = color;
        d[i + 1] = color;
        d[i + 2] = color;
      }
    }
    return out;
  }

  const api = {
    MASKS,
    convolve3x3,
    median3x3,
    sobelGradients,
    sobel,
    addSaltPepper
  };

  if (typeof window !== 'undefined') {
    window.PaintFilters = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();

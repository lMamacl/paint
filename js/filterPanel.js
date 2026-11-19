/**
 * js/filterPanel.js
 * Sekcja „Filtry” w pasku bocznym (Ćwiczenie 5): filtr uśredniający, Gaussa, medianowy, wyostrzający
 * (maska Laplace'a), operator Sobela, własna maska 3×3 oraz szum „sól i pieprz”.
 *
 * PODZIAŁ ODPOWIEDZIALNOŚCI:
 *  - js/filters.js     — matematyka filtrów (czyste funkcje na ImageData),
 *  - ten plik          — wybór filtru, siatka maski 3×3 z dzielnikiem, widoki Sobela, natężenie szumu,
 *  - js/compareView.js — wspólna sesja podglądu: pokazanie obrazu (showImage), „Zastosuj” (jeden krok
 *                        historii), „Anuluj” i unieważnianie podglądu (Esc, Cofnij/Ponów, zmiana rozmiaru…).
 *
 * PRZEPŁYW: wybór filtru robi kopię dokumentu, liczy filtr i pokazuje wynik na overlay. Dokument nie jest
 * zmieniany, dopóki nie klikniesz „Zastosuj” (pasek #preview-bar). Aby porównać filtr uśredniający z
 * medianowym: dodaj szum → „Zastosuj” → wybierz „Uśredniający” (podgląd) → wybierz „Mediana” (podgląd).
 *
 * Wszystkie filtry maskowe (uśredniający, Gaussa, wyostrzanie, własna maska) korzystają z JEDNEJ funkcji
 * PaintFilters.convolve3x3 — gotowe maski są tylko wartościami wpisanymi do siatki (w trybach innych niż
 * „Własna maska” siatka jest tylko do odczytu). Obliczenia na bardzo dużych obrazach są poprzedzone
 * komunikatem „Obliczanie…”, żeby interfejs zdążył go pokazać przed zablokowaniem na czas liczenia.
 */
window.PaintFilterPanel = {
  /** Opis filtrów: nazwa w podglądzie, rodzaj panelu parametrów i opis działania. */
  OPS: {
    mean: {
      label: 'Filtr uśredniający', type: 'mask', preset: 'mean',
      formula: 'Splot 3×3: średnia z 9 sąsiadów (maska z jedynek, dzielnik 9).'
    },
    gauss: {
      label: 'Filtr Gaussa', type: 'mask', preset: 'gauss',
      formula: 'Splot 3×3 z maską Gaussa [1 2 1; 2 4 2; 1 2 1] i dzielnikiem 16: bliższe piksele mają większą wagę.'
    },
    median: {
      label: 'Filtr medianowy', type: 'none',
      formula: 'Mediana z sąsiedztwa 3×3 osobno dla kanałów R, G i B (wartość środkowa z 9 posortowanych).'
    },
    sharpen: {
      label: 'Wyostrzanie (Laplace)', type: 'mask', preset: 'sharpen',
      formula: 'Splot 3×3 z maską Laplace’a (środek 5, dzielnik 1): wzmacnia różnice względem sąsiadów.'
    },
    sobel: {
      label: 'Sobel', type: 'sobel',
      formula: 'Skala szarości → Gx i Gy (maski Sobela) → moduł √(Gx² + Gy²), wynik obcięty do 0–255.'
    },
    custom: {
      label: 'Własna maska', type: 'mask', editable: true,
      formula: 'Wynik = Σ maska · sąsiad / dzielnik, obcięty do 0–255, osobno dla R, G i B.'
    },
    noise: {
      label: 'Szum sól i pieprz', type: 'noise', min: 0, max: 40, def: 5,
      formula: 'Wskazany odsetek pikseli staje się czarny lub biały. Zastosuj szum, a potem porównaj filtr uśredniający z medianowym.'
    }
  },

  /** Powyżej tylu pikseli ciężkie filtry są poprzedzone komunikatem „Obliczanie…”. */
  HEAVY_PIXELS: 1500000,
  IDENTITY: [0, 0, 0, 0, 1, 0, 0, 0, 0],

  op: null,             // wybrany filtr albo null (brak sesji filtra)
  source: null,         // kopia dokumentu z chwili wyboru filtru
  kernel: [0, 0, 0, 0, 1, 0, 0, 0, 0],
  divisor: 1,
  sobelView: 'magnitude',
  noise: 5,
  seed: 1,
  token: 0,             // numer ostatniego żądania przeliczenia (stare żądania są pomijane)
  frame: 0,
  messageKind: '',      // 'error' | 'busy' (znikają po udanym przeliczeniu) albo 'note' (zostaje do kolejnej edycji)
  els: {},

  init() {
    this.els = {
      buttons: Array.from(document.querySelectorAll('[data-filter-op]')),
      controls: document.getElementById('flt-controls'),
      maskBox: document.getElementById('flt-mask-box'),
      cells: Array.from({ length: 9 }, (_, i) => document.getElementById(`flt-k${i}`)),
      divisor: document.getElementById('flt-divisor'),
      divSum: document.getElementById('btn-flt-divsum'),
      sobelBox: document.getElementById('flt-sobel-box'),
      sobelButtons: Array.from(document.querySelectorAll('[data-sobel-view]')),
      noiseBox: document.getElementById('flt-noise-box'),
      noiseSlider: document.getElementById('flt-noise-slider'),
      noiseNumber: document.getElementById('flt-noise-number'),
      reseed: document.getElementById('btn-flt-reseed'),
      message: document.getElementById('flt-message'),
      formula: document.getElementById('flt-formula')
    };
    if (!this.els.controls) return;

    this.els.buttons.forEach((button) => {
      button.addEventListener('click', () => this.select(button.dataset.filterOp));
    });

    // siatka maski i dzielnik: ponowne przeliczenie po każdej poprawnej zmianie
    this.els.cells.concat([this.els.divisor]).forEach((input) => {
      input.addEventListener('input', () => this.onMaskInput());
    });
    this.els.divSum.addEventListener('click', () => this.setDivisorToSum());

    this.els.sobelButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this.sobelView = button.dataset.sobelView;
        this.syncSobelButtons();
        this.requestRender();
      });
    });

    this.els.noiseSlider.addEventListener('input', () => {
      this.setNoise(parseFloat(this.els.noiseSlider.value), 'slider');
    });
    this.els.noiseNumber.addEventListener('input', () => {
      const typed = parseFloat(this.els.noiseNumber.value.replace(',', '.'));
      if (!Number.isFinite(typed)) return;
      this.setNoise(typed, 'number');
    });
    this.els.noiseNumber.addEventListener('change', () => this.syncNoiseFields());
    this.els.noiseNumber.addEventListener('blur', () => this.syncNoiseFields());
    this.els.reseed.addEventListener('click', () => {
      this.seed = this.newSeed();
      this.requestRender();
    });

    // koniec sesji z zewnątrz (Esc, Cofnij, zmiana rozmiaru) albo sesja innego modułu → sprzątanie
    window.addEventListener('paint:previewstate', (e) => this.onPreviewState(e.detail));
    this.reset();
  },

  // ───────────────────────── wybór filtru ─────────────────────────

  /** Wybór filtru: kopia dokumentu, ustawienie parametrów i pierwszy podgląd. Ponowny klik anuluje. */
  select(opId) {
    const def = this.OPS[opId];
    if (!def) return;

    if (this.op === opId) {
      window.PaintCompareView.cancel(); // ten sam przycisk drugi raz = wyłącz filtr
      return;
    }

    const { mainCanvas, mainCtx } = window.PaintCanvas;
    this.source = mainCtx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
    this.op = opId;

    if (def.preset) {
      const mask = window.PaintFilters.MASKS[def.preset];
      this.kernel = mask.kernel.slice();
      this.divisor = mask.divisor;
    } // „Własna maska” zaczyna od ostatnio pokazanej maski (albo jednostkowej), żeby można ją modyfikować
    if (def.type === 'noise') {
      this.noise = def.def;
      this.seed = this.newSeed();
    }

    this.clearMessage();
    this.showControls();
    if (this.isHeavy()) this.requestRender();
    else this.render();
  },

  newSeed() {
    return Math.floor(Math.random() * 2147483647) + 1;
  },

  // ───────────────────────── maska 3×3 ─────────────────────────

  /** Odczytuje siatkę i dzielnik; po poprawnych danych przelicza podgląd, po błędnych pokazuje komunikat. */
  onMaskInput() {
    if (!this.op || !this.OPS[this.op].editable) return;

    if (this.messageKind === 'note') this.clearMessage(); // uwaga o dzielniku dotyczyła poprzedniej edycji
    const parse = (input) => parseFloat(input.value.replace(',', '.'));
    const kernel = this.els.cells.map(parse);
    if (kernel.some((v) => !Number.isFinite(v))) {
      this.showMessage('Wpisz liczbę w każdym polu maski.');
      return;
    }
    const divisor = parse(this.els.divisor);
    if (!Number.isFinite(divisor) || divisor === 0) {
      this.showMessage('Dzielnik musi być liczbą różną od zera.');
      return;
    }

    this.kernel = kernel;
    this.divisor = divisor;
    this.requestRender();
  },

  /** Przycisk Σ: dzielnik = suma współczynników (dla sumy 0 przyjmujemy 1). */
  setDivisorToSum() {
    if (!this.op || !this.OPS[this.op].editable) return;
    const kernel = this.els.cells.map((input) => parseFloat(input.value.replace(',', '.')));
    if (kernel.some((v) => !Number.isFinite(v))) {
      this.showMessage('Wpisz liczbę w każdym polu maski.');
      return;
    }
    const sum = kernel.reduce((a, b) => a + b, 0);
    this.els.divisor.value = String(sum === 0 ? 1 : sum);
    this.onMaskInput();
    if (sum === 0) this.showMessage('Suma współczynników wynosi 0 — ustawiono dzielnik 1.', 'note');
  },

  // ───────────────────────── szum ─────────────────────────

  setNoise(raw, from) {
    if (this.op !== 'noise') return;
    const def = this.OPS.noise;
    this.noise = Math.min(def.max, Math.max(def.min, raw));
    if (from !== 'slider') this.els.noiseSlider.value = String(this.noise);
    if (from !== 'number') this.els.noiseNumber.value = String(this.noise);
    this.requestRender();
  },

  syncNoiseFields() {
    if (this.op !== 'noise') return;
    this.els.noiseNumber.value = String(this.noise);
  },

  // ───────────────────────── podgląd ─────────────────────────

  /** Czy przeliczenie na tym obrazie może na zauważalnie długo zablokować interfejs. */
  isHeavy() {
    if (!this.source || this.op === 'noise') return false;
    return this.source.width * this.source.height > this.HEAVY_PIXELS;
  },

  /**
   * Planuje przeliczenie: zwykle jedno na klatkę (requestAnimationFrame); na dużych obrazach
   * najpierw pokazuje „Obliczanie…” i liczy dopiero po chwili, żeby komunikat zdążył się wyświetlić.
   */
  requestRender() {
    const token = ++this.token;
    if (this.frame) {
      window.cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    if (this.isHeavy()) {
      this.showMessage('Obliczanie…', 'busy');
      window.setTimeout(() => {
        if (token === this.token) this.render();
      }, 30);
      return;
    }
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0;
      if (token === this.token) this.render();
    });
  },

  /** Liczy wybrany filtr na kopii dokumentu i pokazuje wynik na overlay. */
  render() {
    if (!this.op || !this.source) return;
    const F = window.PaintFilters;
    const def = this.OPS[this.op];
    let image;
    try {
      if (def.type === 'mask') image = F.convolve3x3(this.source, this.kernel, this.divisor);
      else if (def.type === 'sobel') image = F.sobel(this.source, this.sobelView);
      else if (def.type === 'noise') image = F.addSaltPepper(this.source, this.noise, this.seed);
      else image = F.median3x3(this.source);
    } catch (error) {
      this.showMessage(error.message);
      return;
    }
    if (this.messageKind !== 'note') this.clearMessage();
    window.PaintCompareView.showImage(image, this.describe(), this.source, 'filters');
  },

  /** Nazwa filtru z parametrem do komunikatu i paska podglądu. */
  describe() {
    const def = this.OPS[this.op];
    if (def.type === 'noise') return `${def.label} ${this.noise}%`;
    if (def.type === 'sobel') {
      const names = { magnitude: '|G|', gx: '|Gx|', gy: '|Gy|' };
      return `${def.label} (${names[this.sobelView]})`;
    }
    return def.label;
  },

  // ───────────────────────── wygląd kontrolek ─────────────────────────

  showControls() {
    const def = this.OPS[this.op];
    const e = this.els;

    e.controls.hidden = false;
    e.formula.textContent = def.formula;
    e.maskBox.hidden = def.type !== 'mask';
    e.sobelBox.hidden = def.type !== 'sobel';
    e.noiseBox.hidden = def.type !== 'noise';

    if (def.type === 'mask') {
      e.cells.forEach((input, i) => {
        input.value = String(this.kernel[i]);
        input.readOnly = !def.editable;
      });
      e.divisor.value = String(this.divisor);
      e.divisor.readOnly = !def.editable;
      e.divSum.hidden = !def.editable;
    }
    if (def.type === 'sobel') this.syncSobelButtons();
    if (def.type === 'noise') {
      e.noiseSlider.min = String(def.min);
      e.noiseSlider.max = String(def.max);
      e.noiseSlider.step = '1';
      e.noiseSlider.value = String(this.noise);
      e.noiseNumber.value = String(this.noise);
    }

    e.buttons.forEach((button) => {
      const selected = button.dataset.filterOp === this.op;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  },

  syncSobelButtons() {
    this.els.sobelButtons.forEach((button) => {
      const selected = button.dataset.sobelView === this.sobelView;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  },

  showMessage(text, kind) {
    this.els.message.textContent = text;
    this.messageKind = kind || 'error';
  },

  clearMessage() {
    this.els.message.textContent = '';
    this.messageKind = '';
  },

  /** Stan wyjściowy: brak wybranego filtru, ukryte kontrolki. */
  reset() {
    this.token++;
    if (this.frame) {
      window.cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    this.op = null;
    this.source = null;
    this.clearMessage();
    this.els.controls.hidden = true;
    this.els.buttons.forEach((button) => {
      button.classList.remove('active');
      button.setAttribute('aria-pressed', 'false');
    });
  },

  /** Reakcja na zmianę sesji podglądu: gdy to już nie nasza sesja, sprzątamy (także odroczone liczenie). */
  onPreviewState(detail) {
    const own = detail.active && detail.owner === 'filters';
    if (!own && this.op) this.reset();
  }
};

/**
 * js/adjustments.js
 * Sekcja „Korekcje” w pasku bocznym (Ćwiczenie 4): jasność, kontrast, gamma, próg i negatyw
 * z podglądem na żywo podczas przesuwania suwaka.
 *
 * PODZIAŁ ODPOWIEDZIALNOŚCI:
 *  - js/pointOps.js    — matematyka przekształceń (czyste funkcje na ImageData),
 *  - ten plik          — wybór operacji, suwak i pole liczbowe, planowanie przeliczeń,
 *  - js/compareView.js — wspólna sesja podglądu na overlay: pokazanie obrazu (showImage),
 *                        „Zastosuj” (jeden krok historii), „Anuluj” i unieważnianie podglądu
 *                        (zmiana rozmiaru, Cofnij/Ponów, Nowy, Otwórz, Esc). Przyciski Zastosuj
 *                        i Anuluj są wspólne: pasek #preview-bar na dole panelu bocznego.
 *
 * PODGLĄD NA ŻYWO: źródło (kopia dokumentu) jest pobierane RAZ, przy wyborze operacji.
 * Każde przesunięcie suwaka tylko przelicza tę kopię i rysuje wynik na overlay — dokument
 * nie jest zmieniany, dopóki nie klikniesz „Zastosuj”. Przeliczenia są łączone przez
 * requestAnimationFrame (najwyżej jedno na klatkę), więc szybkie ruchy suwakiem nie blokują UI.
 *
 * Reaguje na: kliknięcia przycisków [data-adjust-op], suwak #adj-slider, pole #adj-number,
 * przycisk Reset oraz zdarzenie paint:previewstate (koniec sesji albo sesja innego właściciela).
 */
window.PaintAdjustments = {
  /**
   * Opis operacji: zakres suwaka, wartość domyślna (= brak zmiany), zapis wzoru i funkcja liczącą.
   * Operacja bez parametru (negatyw) ma noParam: true.
   */
  OPS: {
    brightness: {
      label: 'Jasność', min: -255, max: 255, step: 1, def: 0, digits: 0, signed: true,
      formula: 'v′ = v + b, wynik obcięty do 0–255',
      run: (img, v) => window.PaintPointOps.brightness(img, v)
    },
    contrast: {
      label: 'Kontrast', min: 0, max: 3, step: 0.05, def: 1, digits: 2, prefix: '×',
      formula: 'v′ = (v − 128)·k + 128, wynik obcięty do 0–255 (k = 1: bez zmiany)',
      run: (img, v) => window.PaintPointOps.contrast(img, v)
    },
    gamma: {
      label: 'Gamma', min: 0.1, max: 5, step: 0.05, def: 1, digits: 2,
      formula: 'v′ = 255·(v / 255)^(1 / γ) (γ > 1 rozjaśnia, γ = 1: bez zmiany)',
      run: (img, v) => window.PaintPointOps.gamma(img, v)
    },
    threshold: {
      label: 'Próg', min: 0, max: 255, step: 1, def: 128, digits: 0,
      formula: 'Y = 0,299 R + 0,587 G + 0,114 B (skala szarości); Y ≥ T → biały, inaczej czarny',
      run: (img, v) => window.PaintPointOps.threshold(img, v)
    },
    invert: {
      label: 'Negatyw', noParam: true,
      formula: 'v′ = 255 − v w kanałach R, G i B',
      run: (img) => window.PaintPointOps.invert(img)
    }
  },

  op: null,        // identyfikator wybranej operacji albo null (brak sesji korekcji)
  value: 0,        // bieżąca wartość parametru
  source: null,    // kopia dokumentu z chwili wyboru operacji (nie zmienia się podczas sesji)
  frame: 0,        // identyfikator zaplanowanej klatki requestAnimationFrame
  els: {},

  init() {
    this.els = {
      buttons: Array.from(document.querySelectorAll('[data-adjust-op]')),
      controls: document.getElementById('adj-controls'),
      label: document.getElementById('adj-label'),
      slider: document.getElementById('adj-slider'),
      number: document.getElementById('adj-number'),
      sliderBox: document.getElementById('adj-slider-box'),
      min: document.getElementById('adj-min'),
      max: document.getElementById('adj-max'),
      reset: document.getElementById('btn-adj-reset'),
      formula: document.getElementById('adj-formula')
    };
    if (!this.els.controls) return;

    this.els.buttons.forEach((button) => {
      button.addEventListener('click', () => this.select(button.dataset.adjustOp));
    });
    this.els.slider.addEventListener('input', () => {
      this.setValue(parseFloat(this.els.slider.value), 'slider');
    });
    this.els.number.addEventListener('input', () => {
      const typed = parseFloat(this.els.number.value.replace(',', '.'));
      if (!Number.isFinite(typed)) return; // puste pole w trakcie pisania — czekamy
      this.setValue(typed, 'number');
    });
    this.els.number.addEventListener('change', () => this.syncValueFields());
    this.els.number.addEventListener('blur', () => this.syncValueFields());
    this.els.reset.addEventListener('click', () => {
      if (!this.op) return;
      this.setValue(this.OPS[this.op].def, 'reset');
    });
    // koniec sesji podglądu z zewnątrz (Esc, Cofnij, zmiana rozmiaru, inny podgląd) → sprzątanie
    window.addEventListener('paint:previewstate', (e) => this.onPreviewState(e.detail));
    this.reset();
  },

  // ───────────────────────── wybór operacji ─────────────────────────

  /** Wybór operacji: kopia dokumentu, wartość domyślna i pierwszy podgląd. Ponowny klik anuluje. */
  select(opId) {
    const def = this.OPS[opId];
    if (!def) return;

    if (this.op === opId) {
      window.PaintCompareView.cancel(); // ten sam przycisk drugi raz = wyłącz korekcję
      return;
    }

    const { mainCanvas, mainCtx } = window.PaintCanvas;
    this.source = mainCtx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
    this.op = opId;
    this.value = def.noParam ? 0 : def.def;
    this.showControls();
    this.render();
  },

  // ───────────────────────── wartość parametru ─────────────────────────

  /** Ustawia wartość (obciętą do zakresu operacji) i planuje przeliczenie podglądu. */
  setValue(raw, from) {
    if (!this.op) return;
    const def = this.OPS[this.op];
    if (def.noParam) return;

    const value = Math.min(def.max, Math.max(def.min, raw));
    this.value = value;
    if (from !== 'slider') this.els.slider.value = String(value);
    // pola, w którym użytkownik właśnie pisze, nie nadpisujemy
    if (from !== 'number') this.els.number.value = this.formatNumber(value);
    this.schedule();
  },

  /** Ujednolica zapis w polu liczbowym po zakończeniu edycji (np. „1,5” → „1.50”). */
  syncValueFields() {
    if (!this.op) return;
    this.els.number.value = this.formatNumber(this.value);
  },

  formatNumber(value) {
    const def = this.OPS[this.op];
    return value.toFixed(def.digits);
  },

  // ───────────────────────── podgląd ─────────────────────────

  /** Łączy szybkie zdarzenia suwaka: jedno przeliczenie na klatkę. */
  schedule() {
    if (this.frame) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  },

  /** Liczy operację na kopii dokumentu i pokazuje wynik na overlay. */
  render() {
    if (!this.op || !this.source) return;
    const def = this.OPS[this.op];
    const image = def.run(this.source, this.value);
    window.PaintCompareView.showImage(image, this.describe(), this.source, 'corrections');
  },

  /** Nazwa operacji z wartością, np. „Jasność +40”, „Kontrast ×1,50”, „Próg 128”. */
  describe() {
    const def = this.OPS[this.op];
    if (def.noParam) return def.label;
    const number = new Intl.NumberFormat('pl-PL', {
      minimumFractionDigits: def.digits,
      maximumFractionDigits: def.digits
    }).format(this.value);
    const sign = def.signed && this.value > 0 ? '+' : '';
    return `${def.label} ${def.prefix || ''}${sign}${number}`;
  },

  // ───────────────────────── wygląd kontrolek ─────────────────────────

  /** Pokazuje suwak (albo opis negatywu) i ustawia zakres, wartość oraz wzór dla wybranej operacji. */
  showControls() {
    const def = this.OPS[this.op];
    const e = this.els;

    e.controls.hidden = false;
    e.label.textContent = def.label;
    e.formula.textContent = def.formula;
    e.sliderBox.hidden = !!def.noParam;

    if (!def.noParam) {
      e.slider.min = String(def.min);
      e.slider.max = String(def.max);
      e.slider.step = String(def.step);
      e.slider.value = String(this.value);
      e.number.min = String(def.min);
      e.number.max = String(def.max);
      e.number.value = this.formatNumber(this.value);
      e.min.textContent = String(def.min);
      e.max.textContent = String(def.max);
    }

    e.buttons.forEach((button) => {
      const selected = button.dataset.adjustOp === this.op;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  },

  /** Stan wyjściowy: brak wybranej operacji, ukryte kontrolki, wyłączone przyciski. */
  reset() {
    if (this.frame) {
      window.cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    this.op = null;
    this.source = null;
    this.els.controls.hidden = true;
    this.els.buttons.forEach((button) => {
      button.classList.remove('active');
      button.setAttribute('aria-pressed', 'false');
    });
  },

  /** Reakcja na zmianę sesji podglądu: gdy to już nie nasza sesja, sprzątamy. */
  onPreviewState(detail) {
    const own = detail.active && detail.owner === 'corrections';
    if (!own && this.op) this.reset();
  }
};

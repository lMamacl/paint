/**
 * js/colorPanel.js
 * Panel „Modele barw” w prawym pasku bocznym (Ćwiczenie 3, wymaganie 1).
 *
 * Panel edytuje AKTYWNY kolor aplikacji (obrys albo wypełnienie — ten sam, który
 * rysują narzędzia). Użytkownik ustawia kolor w jednym modelu (RGB, CMYK lub HSV, suwakiem
 * albo polem liczbowym, albo kodem HEX), a pozostałe modele przeliczają się na bieżąco.
 *
 * ZAKRES: panel nie liczy konwersji sam — korzysta z window.PaintColor (js/colorModels.js).
 *
 * ZASADY, KTÓRE ROZWIĄZUJĄ „SKAKANIE” WARTOŚCI:
 *  1. Model, który użytkownik właśnie edytuje, NIE jest przeliczany z powrotem z RGB
 *     (zaokrąglenie do 0–255 zmieniałoby wpisaną wartość).
 *  2. Przy ręcznej edycji barwa H jest zapamiętana, gdy kolor staje się szary (S = 0),
 *     a nasycenie S, gdy kolor staje się czarny (V = 0). Wtedy suwak H nie „ucieka” do 0°.
 *  3. Zmiana z zewnątrz (paleta, pipeta, wzorce, zamiana kolorów) zawsze pokazuje wartości
 *     standardowe (np. biały = H 0°, S 0%, V 100%).
 *
 * Reaguje na: paint:statechange (strokeColor / fillColor), zmianę aktywnego celu
 * (PaintUI.setActiveColorTarget → refresh) oraz paint:colorpicked (pipeta).
 */
window.PaintColorPanel = {
  /** Opis kanałów: klucz, etykieta, zakres w jednostkach interfejsu i mnożnik (ułamek → %). */
  SPEC: [
    {
      model: 'rgb',
      title: 'RGB',
      channels: [
        { key: 'r', label: 'R', min: 0, max: 255, scale: 1, unit: '', name: 'czerwony' },
        { key: 'g', label: 'G', min: 0, max: 255, scale: 1, unit: '', name: 'zielony' },
        { key: 'b', label: 'B', min: 0, max: 255, scale: 1, unit: '', name: 'niebieski' }
      ]
    },
    {
      model: 'cmyk',
      title: 'CMYK',
      channels: [
        { key: 'c', label: 'C', min: 0, max: 100, scale: 100, unit: '%', name: 'cyjan' },
        { key: 'm', label: 'M', min: 0, max: 100, scale: 100, unit: '%', name: 'magenta' },
        { key: 'y', label: 'Y', min: 0, max: 100, scale: 100, unit: '%', name: 'żółty' },
        { key: 'k', label: 'K', min: 0, max: 100, scale: 100, unit: '%', name: 'czarny' }
      ]
    },
    {
      model: 'hsv',
      title: 'HSV',
      channels: [
        { key: 'h', label: 'H', min: 0, max: 360, scale: 1, unit: '°', name: 'barwa' },
        { key: 's', label: 'S', min: 0, max: 100, scale: 100, unit: '%', name: 'nasycenie' },
        { key: 'v', label: 'V', min: 0, max: 100, scale: 100, unit: '%', name: 'jasność' }
      ]
    }
  ],

  DEFAULT_SOURCE: 'Ustawiony ręcznie',

  target: 'stroke',
  models: { stroke: null, fill: null },
  inputs: {},        // inputs['rgb.r'] = { range, number, track }
  els: {},
  _internal: false,  // true, gdy zmianę koloru wywołał sam panel (nie przeliczamy wtedy z powrotem)

  // ───────────────────────── inicjalizacja ─────────────────────────

  init() {
    const C = window.PaintColor;
    if (!C || !document.getElementById('cm-groups')) return;

    this.els = {
      groups: document.getElementById('cm-groups'),
      sample: document.getElementById('cm-sample'),
      hex: document.getElementById('cm-hex'),
      source: document.getElementById('cm-source'),
      targetBtns: Array.from(document.querySelectorAll('.cm-target-btn')),
      pickChip: document.getElementById('eyedropper-chip'),
      pickReadout: document.getElementById('eyedropper-readout')
    };

    this.models.stroke = this.makeModel(window.PaintState.strokeColor);
    this.models.fill = this.makeModel(window.PaintState.fillColor);

    this.buildGroups();
    this.bindEvents();
    this.refresh();
  },

  /** Tworzy komplet wartości we wszystkich modelach dla koloru HEX. */
  makeModel(hex) {
    const C = window.PaintColor;
    const rgb = C.hexToRgb(hex) || { r: 0, g: 0, b: 0 };
    return {
      rgb,
      hsv: C.rgbToHsv(rgb.r, rgb.g, rgb.b),
      cmyk: C.rgbToCmyk(rgb.r, rgb.g, rgb.b),
      source: this.DEFAULT_SOURCE
    };
  },

  current() {
    return this.models[this.target];
  },

  // ───────────────────────── budowa DOM ─────────────────────────

  /** Buduje sekcje RGB / CMYK / HSV: etykieta + suwak + pole liczbowe dla każdego kanału. */
  buildGroups() {
    this.SPEC.forEach((group) => {
      const box = document.createElement('div');
      box.className = 'cm-group';
      box.dataset.model = group.model;

      const title = document.createElement('div');
      title.className = 'cm-group-title';
      title.textContent = group.title;
      box.appendChild(title);

      group.channels.forEach((ch) => {
        const row = document.createElement('div');
        row.className = 'cm-row';

        const label = document.createElement('span');
        label.className = 'cm-label';
        label.textContent = ch.label;
        label.title = `${group.title}: ${ch.name}`;

        const range = document.createElement('input');
        range.type = 'range';
        range.className = 'cm-range';
        range.min = String(ch.min);
        range.max = String(ch.max);
        range.step = '1';
        range.setAttribute('aria-label', `${group.title} ${ch.label} — suwak`);

        const number = document.createElement('input');
        number.type = 'number';
        number.className = 'input-number cm-number';
        number.min = String(ch.min);
        number.max = String(ch.max);
        number.step = group.model === 'rgb' ? '1' : '0.1';
        number.setAttribute('aria-label', `${group.title} ${ch.label} — wartość`);

        const unit = document.createElement('span');
        unit.className = 'cm-unit';
        unit.textContent = ch.unit;

        row.appendChild(label);
        row.appendChild(range);
        row.appendChild(number);
        row.appendChild(unit);
        box.appendChild(row);

        this.inputs[`${group.model}.${ch.key}`] = { range, number, ch, group: group.model };

        range.addEventListener('input', () => {
          this.onEdit(group.model, ch, parseFloat(range.value));
        });
        number.addEventListener('input', () => {
          const raw = parseFloat(number.value);
          if (Number.isNaN(raw)) return; // puste pole w trakcie pisania — czekamy
          this.onEdit(group.model, ch, raw);
        });
        number.addEventListener('change', () => this.render()); // normalizacja po zakończeniu edycji
        number.addEventListener('blur', () => this.render());
      });

      this.els.groups.appendChild(box);
    });
  },

  bindEvents() {
    // przełącznik: który kolor edytujemy (obrys / wypełnienie)
    this.els.targetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (window.PaintUI && window.PaintUI.setActiveColorTarget) {
          window.PaintUI.setActiveColorTarget(btn.dataset.target);
        }
      });
    });

    // pole HEX
    this.els.hex.addEventListener('input', () => {
      const rgb = window.PaintColor.hexToRgb(this.els.hex.value);
      const text = this.els.hex.value.trim();
      const complete = text.replace('#', '').length === 6; // reagujemy dopiero na pełny zapis
      if (rgb && complete) this.onEditRgb(rgb);
    });
    this.els.hex.addEventListener('change', () => this.render());
    this.els.hex.addEventListener('blur', () => this.render());

    // zmiany stanu aplikacji (paleta, zamiana kolorów, reset, pipeta)
    window.addEventListener('paint:statechange', (e) => {
      const key = e.detail && e.detail.key;
      if (key === 'strokeColor' || key === 'fillColor' || key === 'activeColorTarget') {
        this.refresh();
      }
    });

    // pipeta
    window.addEventListener('paint:colorpicked', (e) => this.onColorPicked(e.detail));
  },

  // ───────────────────────── edycja ─────────────────────────

  /** Użytkownik zmienił jeden kanał w jednym modelu. */
  onEdit(model, ch, uiValue) {
    const value = Math.min(ch.max, Math.max(ch.min, uiValue)) / ch.scale; // jednostki UI → wewnętrzne
    const m = this.current();
    const next = Object.assign({}, m[model]);
    next[ch.key] = model === 'rgb' ? Math.round(value) : value;
    this.applyModel(model, next);
  },

  /** Zmiana w polu HEX — traktowana jak edycja RGB. */
  onEditRgb(rgb) {
    this.applyModel('rgb', { r: rgb.r, g: rgb.g, b: rgb.b });
  },

  /**
   * Zatwierdza nowy komplet wartości jednego modelu: wylicza RGB, odświeża pozostałe modele
   * (ale nie ten edytowany) i zapisuje kolor do stanu aplikacji.
   */
  applyModel(model, values) {
    const C = window.PaintColor;
    let rgb;
    if (model === 'rgb') rgb = { r: values.r, g: values.g, b: values.b };
    else if (model === 'hsv') rgb = C.hsvToRgb(values.h, values.s, values.v);
    else rgb = C.cmykToRgb(values.c, values.m, values.y, values.k);

    const prev = this.current();
    const next = this.derive(rgb, prev, model, true);
    next[model] = values; // edytowany model zostaje dokładnie taki, jak go wpisano
    next.source = this.DEFAULT_SOURCE;
    this.models[this.target] = next;

    this.commit(rgb);
    this.render();
  },

  /**
   * Wylicza pozostałe modele z RGB.
   * @param {object} prev   poprzednie wartości (do zachowania H i S dla szarości/czerni)
   * @param {string|null} source model, którego NIE przeliczamy (edytowany przez użytkownika)
   * @param {boolean} preserve  czy zachować H dla szarości i S dla czerni (edycja ręczna)
   */
  derive(rgb, prev, source, preserve) {
    const C = window.PaintColor;
    const out = { rgb, hsv: prev.hsv, cmyk: prev.cmyk, source: prev.source };
    if (source !== 'hsv') {
      const hsv = C.rgbToHsv(rgb.r, rgb.g, rgb.b);
      if (preserve && hsv.s === 0) hsv.h = prev.hsv.h;
      if (preserve && hsv.v === 0) hsv.s = prev.hsv.s;
      out.hsv = hsv;
    }
    if (source !== 'cmyk') {
      out.cmyk = C.rgbToCmyk(rgb.r, rgb.g, rgb.b);
    }
    return out;
  },

  stateKey() {
    return this.target === 'stroke' ? 'strokeColor' : 'fillColor';
  },

  /** Zapisuje kolor do stanu aplikacji (nie wywołuje ponownego przeliczania panelu). */
  commit(rgb) {
    const hex = window.PaintColor.rgbToHex(rgb.r, rgb.g, rgb.b);
    this._internal = true;
    try {
      window.PaintState.set(this.stateKey(), hex);
      if (window.PaintUI && window.PaintUI.updateColorDisplays) {
        window.PaintUI.updateColorDisplays();
      }
    } finally {
      this._internal = false;
    }
  },

  /** Ustawia kolor „z zewnątrz” (wzorce): panel pokaże wtedy wartości standardowe. */
  setExternalColor(hex) {
    window.PaintState.set(this.stateKey(), hex);
    if (window.PaintUI && window.PaintUI.updateColorDisplays) {
      window.PaintUI.updateColorDisplays();
    }
  },

  // ───────────────────────── synchronizacja ─────────────────────────

  /** Wczytuje kolor aktywnego celu ze stanu aplikacji i odświeża panel. */
  refresh() {
    if (this._internal || !this.els.groups) return;
    const C = window.PaintColor;

    this.target = window.PaintState.activeColorTarget === 'fill' ? 'fill' : 'stroke';
    const hex = this.target === 'stroke' ? window.PaintState.strokeColor : window.PaintState.fillColor;
    const rgb = C.hexToRgb(hex) || { r: 0, g: 0, b: 0 };

    const m = this.current();
    if (C.rgbToHex(m.rgb.r, m.rgb.g, m.rgb.b) !== C.rgbToHex(rgb.r, rgb.g, rgb.b)) {
      // kolor zmieniono poza panelem — wartości standardowe, bez „pamięci” barwy
      const next = this.derive(rgb, m, null, false);
      next.source = this.DEFAULT_SOURCE;
      this.models[this.target] = next;
    }
    this.render();
  },

  /** Pipeta pobrała kolor piksela: pokazujemy jego współrzędne i opis we wszystkich modelach. */
  onColorPicked(detail) {
    if (!detail) return;
    const target = detail.target === 'fill' ? 'fill' : 'stroke';
    this.models[target].source = `Pipeta: piksel (${detail.x}, ${detail.y})`;

    const m = this.models[target];
    if (this.els.pickChip) this.els.pickChip.style.backgroundColor = detail.hex;
    if (this.els.pickReadout) {
      this.els.pickReadout.textContent = `(${detail.x}, ${detail.y})  ${this.describe(m)}`;
    }
    this.render();
  },

  // ───────────────────────── wyświetlanie ─────────────────────────

  /** Liczba do zapisu w interfejsie: RGB całkowite, reszta z jednym miejscem po przecinku. */
  fmt(value, model) {
    return model === 'rgb' ? String(Math.round(value)) : String(Math.round(value * 10) / 10);
  },

  /** Jednowierszowy opis koloru we wszystkich modelach (pasek opcji pipety, status wzorca). */
  describe(m) {
    const f = (v, model) => this.fmt(v, model);
    const hex = window.PaintColor.rgbToHex(m.rgb.r, m.rgb.g, m.rgb.b).toUpperCase();
    return `${hex}  RGB ${m.rgb.r}, ${m.rgb.g}, ${m.rgb.b}  ` +
      `HSV ${f(m.hsv.h, 'hsv')}°, ${f(m.hsv.s * 100, 'hsv')}%, ${f(m.hsv.v * 100, 'hsv')}%  ` +
      `CMYK ${f(m.cmyk.c * 100, 'cmyk')}, ${f(m.cmyk.m * 100, 'cmyk')}, ` +
      `${f(m.cmyk.y * 100, 'cmyk')}, ${f(m.cmyk.k * 100, 'cmyk')}`;
  },

  /** Ustawia wartości kontrolek, tła torów suwaków, próbkę, HEX i status wzorca. */
  render() {
    const C = window.PaintColor;
    const m = this.current();
    if (!m) return;
    const hex = C.rgbToHex(m.rgb.r, m.rgb.g, m.rgb.b);

    // wartości
    Object.keys(this.inputs).forEach((id) => {
      const { range, number, ch, group } = this.inputs[id];
      const ui = m[group][ch.key] * ch.scale;
      range.value = String(ui);
      if (document.activeElement !== number) number.value = this.fmt(ui, group);
      range.style.setProperty('--cm-track', this.trackGradient(group, ch.key, m));
    });

    // próbka, HEX, źródło
    this.els.sample.style.backgroundColor = hex;
    if (document.activeElement !== this.els.hex) this.els.hex.value = hex;
    this.els.source.textContent = m.source || this.DEFAULT_SOURCE;

    // przełącznik obrys / wypełnienie
    this.els.targetBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.target === this.target);
    });

  },

  /** Tło toru suwaka pokazuje, jaki kolor da dany kanał przy pozostałych wartościach bez zmian. */
  trackGradient(model, key, m) {
    const C = window.PaintColor;
    const css = (c) => `rgb(${c.r}, ${c.g}, ${c.b})`;
    let from;
    let to;

    if (model === 'rgb') {
      const a = { r: m.rgb.r, g: m.rgb.g, b: m.rgb.b };
      const b = { r: m.rgb.r, g: m.rgb.g, b: m.rgb.b };
      a[key] = 0;
      b[key] = 255;
      from = a;
      to = b;
    } else if (model === 'cmyk') {
      const a = Object.assign({}, m.cmyk);
      const b = Object.assign({}, m.cmyk);
      a[key] = 0;
      b[key] = 1;
      from = C.cmykToRgb(a.c, a.m, a.y, a.k);
      to = C.cmykToRgb(b.c, b.m, b.y, b.k);
    } else if (key === 'h') {
      // tęcza barw przy pełnym nasyceniu i jasności (inaczej przy S = 0 lub V = 0 byłaby szara)
      const stops = [];
      for (let i = 0; i <= 6; i++) stops.push(css(C.hsvToRgb(i * 60, 1, 1)));
      return `linear-gradient(to right, ${stops.join(', ')})`;
    } else {
      const a = Object.assign({}, m.hsv);
      const b = Object.assign({}, m.hsv);
      a[key] = 0;
      b[key] = 1;
      from = C.hsvToRgb(a.h, a.s, a.v);
      to = C.hsvToRgb(b.h, b.s, b.v);
    }
    return `linear-gradient(to right, ${css(from)}, ${css(to)})`;
  }
};

/**
 * js/histogramPanel.js
 * Sekcja „Histogram i binaryzacja” w prawym panelu bocznym (Ćwiczenie 6):
 *  - wykres słupkowy jasności oraz kanałów R, G, B (z opcją skali logarytmicznej),
 *  - statystyki (min, max, średnia) oraz odczyt słupka pod kursorem,
 *  - progowanie ręczne (suwak + znacznik na wykresie),
 *  - automatyczny dobór progu: średnia jasność oraz metoda Otsu (oba znaczniki i przełącznik podglądu),
 *  - rozciąganie i wyrównywanie histogramu (wykres przed/po na jednym płótnie i podgląd na overlay).
 *
 * Korzysta ze wspólnej sesji podglądu PaintCompareView (owner: 'histogram'), więc „Zastosuj”,
 * „Anuluj”, Ctrl+Z i unieważnianie przy zmianie rozmiaru działają tak samo jak w Ćwiczeniach 4–5.
 */
window.PaintHistogramPanel = {
  channel: 'gray',       // 'gray' | 'rgb' | 'r' | 'g' | 'b'
  logScale: false,
  op: null,              // null | 'manual' | 'auto' | 'stretch' | 'equalize'
  manualThreshold: 128,
  autoMethod: 'otsu',    // 'otsu' | 'mean'
  hoverBin: -1,
  chartLayout: null,
  docHist: null,
  previewHist: null,
  source: null,
  frame: 0,
  els: {},

  init() {
    this.els = {
      canvas: document.getElementById('hist-canvas'),
      logBtn: document.getElementById('btn-hist-log'),
      channelBtns: Array.from(document.querySelectorAll('[data-hist-channel]')),
      stats: document.getElementById('hist-stats'),
      hover: document.getElementById('hist-hover'),
      opBtns: Array.from(document.querySelectorAll('[data-hist-op]')),
      controls: document.getElementById('hist-controls'),
      manualBox: document.getElementById('hist-manual-box'),
      threshSlider: document.getElementById('hist-thresh-slider'),
      threshNumber: document.getElementById('hist-thresh-number'),
      autoBox: document.getElementById('hist-auto-box'),
      autoBtns: Array.from(document.querySelectorAll('[data-hist-auto]')),
      autoMeanVal: document.getElementById('hist-auto-mean-val'),
      autoOtsuVal: document.getElementById('hist-auto-otsu-val'),
      formula: document.getElementById('hist-formula')
    };
    if (!this.els.canvas) return;

    this.els.channelBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.channel = btn.dataset.histChannel;
        this.syncButtons();
        this.draw();
      });
    });

    this.els.logBtn.addEventListener('click', () => {
      this.logScale = !this.logScale;
      this.syncButtons();
      this.draw();
    });

    this.els.opBtns.forEach((btn) => {
      btn.addEventListener('click', () => this.selectOp(btn.dataset.histOp));
    });

    this.els.threshSlider.addEventListener('input', () => {
      this.setManualThreshold(parseInt(this.els.threshSlider.value, 10), 'slider');
    });
    this.els.threshNumber.addEventListener('input', () => {
      const v = parseInt(this.els.threshNumber.value, 10);
      if (Number.isFinite(v)) this.setManualThreshold(v, 'number');
    });
    this.els.threshNumber.addEventListener('blur', () => {
      this.els.threshNumber.value = String(this.manualThreshold);
    });

    this.els.autoBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.autoMethod = btn.dataset.histAuto;
        this.syncButtons();
        this.requestRenderOp();
      });
    });

    // Odczyt dokładnej pozycji słupka pod kursorem
    this.els.canvas.addEventListener('mousemove', (e) => this.onCanvasMove(e));
    this.els.canvas.addEventListener('mouseleave', () => {
      if (this.hoverBin !== -1) {
        this.hoverBin = -1;
        this.updateHoverText();
        this.draw();
      }
    });

    // Odświeżanie po każdej zmianie dokumentu (także po narzędziach i Ćw. 4–5)
    window.addEventListener('paint:historychange', () => this.refreshFromCanvas());
    window.addEventListener('paint:dimensionschange', () => this.refreshFromCanvas());
    window.addEventListener('paint:previewstate', (e) => this.onPreviewState(e.detail));
    window.addEventListener('resize', () => this.draw());

    this.syncButtons();
    this.refreshFromCanvas();
  },

  // ───────────────────────── odczyt dokumentu i sesja ─────────────────────────

  refreshFromCanvas() {
    if (!window.PaintCanvas || !window.PaintCanvas.mainCtx) return;
    const { mainCanvas, mainCtx } = window.PaintCanvas;
    const img = mainCtx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
    this.docHist = window.PaintHistogramOps.computeHistograms(img);
    this.draw();
  },

  onPreviewState(detail) {
    const own = detail.active && detail.owner === 'histogram';
    if (!own && this.op) this.resetOp();

    // Histogram „po” ma sens dla rozciągania, wyrównywania i podglądów z Ćw. 4–5.
    // Dla binaryzacji (manual/auto) wynik jest tylko czarno-biały, więc go nie rysujemy.
    const useful = detail.active && this.op !== 'manual' && this.op !== 'auto';
    if (useful && window.PaintCompareView && window.PaintCompareView.previewImage) {
      this.previewHist = window.PaintHistogramOps.computeHistograms(window.PaintCompareView.previewImage);
    } else {
      this.previewHist = null;
    }
    this.draw();
  },

  selectOp(opId) {
    if (this.op === opId) {
      window.PaintCompareView.cancel();
      return;
    }
    const { mainCanvas, mainCtx } = window.PaintCanvas;
    this.source = mainCtx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
    this.docHist = window.PaintHistogramOps.computeHistograms(this.source);
    this.op = opId;
    this.channel = 'gray'; // progi i normalizacja dotyczą jasności, nie pojedynczego kanału

    if (opId === 'manual') {
      this.els.threshSlider.value = String(this.manualThreshold);
      this.els.threshNumber.value = String(this.manualThreshold);
    }

    this.showControls();
    this.renderOp();
  },

  setManualThreshold(raw, from) {
    if (this.op !== 'manual') return;
    this.manualThreshold = Math.max(0, Math.min(255, Math.round(raw)));
    if (from !== 'slider') this.els.threshSlider.value = String(this.manualThreshold);
    if (from !== 'number') this.els.threshNumber.value = String(this.manualThreshold);
    this.requestRenderOp();
  },

  requestRenderOp() {
    if (this.frame) window.cancelAnimationFrame(this.frame);
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0;
      this.renderOp();
    });
  },

  renderOp() {
    if (!this.op || !this.source) return;
    const Ops = window.PaintHistogramOps;
    let image;
    let label;

    if (this.op === 'manual') {
      image = Ops.threshold(this.source, this.manualThreshold);
      label = `Progowanie (T = ${this.manualThreshold})`;
    } else if (this.op === 'auto') {
      const tMean = Ops.meanThreshold(this.docHist.gray, this.docHist.total);
      const tOtsu = Ops.otsuThreshold(this.docHist.gray, this.docHist.total);
      this.els.autoMeanVal.textContent = String(tMean);
      this.els.autoOtsuVal.textContent = String(tOtsu);
      const t = this.autoMethod === 'mean' ? tMean : tOtsu;
      image = Ops.threshold(this.source, t);
      label = this.autoMethod === 'mean' ? `Próg średniej (T = ${t})` : `Próg Otsu (T = ${t})`;
    } else if (this.op === 'stretch') {
      image = Ops.stretchHistogram(this.source);
      label = 'Rozciąganie histogramu';
    } else if (this.op === 'equalize') {
      image = Ops.equalizeHistogram(this.source);
      label = 'Wyrównywanie histogramu';
    }

    if (image) {
      window.PaintCompareView.showImage(image, label, this.source, 'histogram');
    }
  },

  resetOp() {
    if (this.frame) {
      window.cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    this.op = null;
    this.source = null;
    this.els.controls.hidden = true;
    this.syncButtons();
  },

  // ───────────────────────── rysowanie wykresu i statystyk ─────────────────────────

  showControls() {
    const formulas = {
      manual: 'Y ≥ T → biały (255), inaczej czarny (0).',
      auto: 'Próg średniej jasności i metoda Otsu (maksymalizacja wariancji międzyklasowej). Kliknij próg, aby zobaczyć jego binaryzację; oba są zaznaczone na histogramie.',
      stretch: 'v′ = (v − min) · 255 / (max − min) w skali szarości. Półprzezroczyste żółte słupki = histogram po operacji.',
      equalize: 'v′ = (cdf[v] − cdfMin) · 255 / (N − cdfMin) w skali szarości. Półprzezroczyste żółte słupki = histogram po operacji.'
    };
    this.els.controls.hidden = false;
    this.els.manualBox.hidden = this.op !== 'manual';
    this.els.autoBox.hidden = this.op !== 'auto';
    this.els.formula.textContent = formulas[this.op] || '';
    this.syncButtons();
  },

  syncButtons() {
    this.els.channelBtns.forEach((btn) => {
      const active = btn.dataset.histChannel === this.channel;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    this.els.logBtn.classList.toggle('active', this.logScale);
    this.els.logBtn.setAttribute('aria-pressed', String(this.logScale));
    this.els.opBtns.forEach((btn) => {
      const active = btn.dataset.histOp === this.op;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    this.els.autoBtns.forEach((btn) => {
      const active = btn.dataset.histAuto === this.autoMethod;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  },

  draw() {
    if (!this.docHist || !window.PaintHistogramChart) return;
    const Chart = window.PaintHistogramChart;
    const C = Chart.COLORS;
    const series = [];

    if (this.channel === 'rgb') {
      series.push({ hist: this.docHist.r, color: C.r });
      series.push({ hist: this.docHist.g, color: C.g });
      series.push({ hist: this.docHist.b, color: C.b });
    } else {
      const colorMap = { gray: C.gray, r: C.r, g: C.g, b: C.b };
      series.push({ hist: this.docHist[this.channel], color: colorMap[this.channel] });
    }

    // Gdy aktywny jest podgląd (poza samą binaryzacją 0/255), rysujemy obrys histogramu „po”
    if (this.previewHist) {
      const key = this.channel === 'rgb' ? 'gray' : this.channel;
      series.push({ hist: this.previewHist[key], color: C.previewFill });
    }

    const markers = [];
    if (this.op === 'manual') {
      markers.push({ value: this.manualThreshold, color: C.preview, label: `T = ${this.manualThreshold}` });
    } else if (this.op === 'auto') {
      const tMean = window.PaintHistogramOps.meanThreshold(this.docHist.gray, this.docHist.total);
      const tOtsu = window.PaintHistogramOps.otsuThreshold(this.docHist.gray, this.docHist.total);
      markers.push({ value: tMean, color: '#38bdf8', label: `Śr = ${tMean}` });
      markers.push({ value: tOtsu, color: C.preview, label: `Otsu = ${tOtsu}` });
    }

    this.chartLayout = Chart.render(this.els.canvas, {
      series,
      logScale: this.logScale,
      additive: this.channel === 'rgb',
      markers,
      highlight: this.hoverBin,
      xLabel: this.channel === 'gray' ? 'jasność (0–255)' : `kanał ${this.channel.toUpperCase()} (0–255)`
    });

    this.updateStatsText();
    this.updateHoverText();
  },

  updateStatsText() {
    if (!this.docHist) return;
    const Ops = window.PaintHistogramOps;
    const key = this.channel === 'rgb' ? 'gray' : this.channel;
    const s = Ops.stats(this.docHist[key], this.docHist.total);
    const prefix = this.previewHist ? 'Przed: ' : '';
    let text = `${prefix}Min: ${s.min} · Max: ${s.max} · Śr: ${s.mean.toFixed(1)}`;

    if (this.previewHist) {
      const ps = Ops.stats(this.previewHist[key], this.previewHist.total);
      text += `\nPo: Min ${ps.min} · Max ${ps.max} · Śr ${ps.mean.toFixed(1)}`;
    }
    this.els.stats.textContent = text;
  },

  onCanvasMove(e) {
    if (!this.chartLayout || !window.PaintHistogramChart) return;
    const rect = this.els.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const bin = window.PaintHistogramChart.binFromX(x, this.chartLayout);
    if (bin !== this.hoverBin) {
      this.hoverBin = bin;
      this.updateHoverText();
      this.draw();
    }
  },

  updateHoverText() {
    if (this.hoverBin < 0 || !this.docHist) {
      this.els.hover.textContent = 'Najedź na wykres, aby odczytać słupek.';
      return;
    }
    const v = this.hoverBin;
    const total = this.docHist.total || 1;
    if (this.channel === 'rgb') {
      const r = this.docHist.r[v];
      const g = this.docHist.g[v];
      const b = this.docHist.b[v];
      this.els.hover.textContent = `Poziom ${v}: R ${r} · G ${g} · B ${b}`;
    } else {
      const count = this.docHist[this.channel][v];
      const pct = ((count / total) * 100).toFixed(1);
      this.els.hover.textContent = `Poziom ${v}: ${window.PaintHistogramChart.formatCount(count)} px (${pct}%)`;
    }
  }
};

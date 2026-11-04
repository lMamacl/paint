/**
 * js/compareView.js
 * Podgląd nieniszczących operacji obrazu na warstwie overlay nad dokumentem.
 *
 * Jedna sesja podglądu naraz. Źródłem obrazu może być:
 *  - tryb 'color' / 'gray': kanały R, G, B oraz skala szarości (Ćwiczenie 3, ta klasa liczy je sama),
 *  - tryb 'adjust': korekcje z Ćwiczenia 4 — obraz liczy js/adjustments.js i przekazuje go
 *    metodą showImage(); zatwierdzanie, anulowanie i unieważnianie podglądu jest wspólne.
 * Każda zmiana stanu sesji wysyła zdarzenie paint:previewstate { active, mode }.
 */
window.PaintCompareView = {
  mode: 'color',
  grayMethod: 'luma',
  channel: null,
  active: false,
  kind: null,
  previewImage: null,
  baseImage: null,   // opcjonalny snapshot dokumentu sprzed podglądu (używany jako stan „przed” w historii)
  adjustLabel: '',

  init() {
    document.querySelectorAll('[data-image-mode]').forEach((button) => {
      button.addEventListener('click', () => this.setMode(button.dataset.imageMode));
    });

    document.querySelectorAll('[data-color-channel]').forEach((button) => {
      button.addEventListener('click', () => this.showChannel(button.dataset.colorChannel));
    });

    document.querySelectorAll('[data-gray-method]').forEach((button) => {
      button.addEventListener('click', () => this.showGrayMethod(button.dataset.grayMethod));
    });

    const applyButton = document.getElementById('btn-image-preview-apply');
    const cancelButton = document.getElementById('btn-image-preview-cancel');
    if (applyButton) applyButton.addEventListener('click', () => this.apply());
    if (cancelButton) cancelButton.addEventListener('click', () => this.cancel());
    window.addEventListener('paint:dimensionschange', () => {
      if (this.active) this.cancel();
    });
    this.updateControls();
  },

  setMode(mode) {
    if (mode === 'gray') {
      this.mode = 'gray';
      this.channel = null;
      this.renderPreview();
      return;
    }

    this.mode = 'color';
    this.channel = null;
    this.clearPreview();
  },

  showChannel(channel) {
    if (this.active && this.mode === 'color' && this.channel === channel) {
      this.setMode('color');
      return;
    }
    this.mode = 'color';
    this.channel = channel;
    this.renderPreview();
  },

  showGrayMethod(method) {
    this.mode = 'gray';
    this.grayMethod = (method === 'average' || method === 'diff') ? method : 'luma';
    this.channel = null;
    this.renderPreview();
  },

  renderPreview() {
    const { mainCanvas, mainCtx, overlayCtx } = window.PaintCanvas;
    const source = mainCtx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
    const Ops = window.PaintImageOps;

    if (this.mode === 'gray') {
      if (this.grayMethod === 'average') {
        this.kind = 'gray-average';
        this.previewImage = Ops.grayscaleAverage(source);
      } else if (this.grayMethod === 'diff') {
        this.kind = 'gray-diff';
        this.previewImage = Ops.differenceMap(source, 1);
        if (window.PaintUI && window.PaintUI.showToast) {
          const stats = Ops.compareGrayscales(source);
          window.PaintUI.showToast(
            `Różnica: śr. |Δ| = ${stats.meanAbsDiff.toFixed(1)}, max Δ = ${stats.maxDiff}, różne: ${stats.differingPercent.toFixed(1)}%`
          );
        }
      } else {
        this.kind = 'gray-luma';
        this.previewImage = Ops.grayscaleLuma(source);
      }
    } else if (this.channel) {
      this.kind = `channel-${this.channel}`;
      this.previewImage = Ops.extractChannel(source, this.channel, 'color');
    } else {
      this.clearPreview();
      return;
    }

    this.active = true;
    overlayCtx.putImageData(this.previewImage, 0, 0);
    this.updateControls();
    if (window.PaintUI) window.PaintUI.refreshPixelReadout();
  },

  /**
   * Pokazuje na overlay gotowy obraz policzony na zewnątrz (korekcje, Ćwiczenie 4).
   * @param {ImageData} image  wynik przekształcenia (taki sam rozmiar jak dokument)
   * @param {string} label     nazwa operacji do komunikatu po zastosowaniu
   * @param {ImageData} [base] snapshot dokumentu sprzed podglądu (oszczędza ponowny odczyt przy Zastosuj)
   */
  showImage(image, label, base) {
    this.mode = 'adjust';
    this.channel = null;
    this.kind = 'adjust';
    this.adjustLabel = label;
    this.previewImage = image;
    this.baseImage = base || null;
    this.active = true;
    window.PaintCanvas.overlayCtx.putImageData(image, 0, 0);
    this.updateControls();
    if (window.PaintUI) window.PaintUI.refreshPixelReadout();
  },

  apply() {
    if (!this.active || !this.previewImage) return;
    const { mainCanvas, mainCtx, history } = window.PaintCanvas;
    const full = window.PaintRect.full(mainCanvas.width, mainCanvas.height);
    history.begin(mainCtx, full, this.baseImage);
    mainCtx.putImageData(this.previewImage, 0, 0);
    const changed = history.commit(mainCtx);
    const label = this.label();

    this.mode = 'color';
    this.grayMethod = 'luma';
    this.channel = null;
    this.clearPreview();
    if (window.PaintUI) {
      window.PaintUI.showToast(changed ? `Zastosowano: ${label}. Cofnij: Ctrl+Z.` : `Obraz bez zmian (${label}).`);
      window.PaintUI.refreshPixelReadout();
    }
  },

  cancel() {
    this.mode = 'color';
    this.grayMethod = 'luma';
    this.channel = null;
    this.clearPreview();
  },

  clearPreview() {
    this.active = false;
    this.kind = null;
    this.previewImage = null;
    this.baseImage = null;
    window.PaintCanvas.clearOverlay();
    this.updateControls();
    if (window.PaintUI) window.PaintUI.refreshPixelReadout();
  },

  notifyDrawBlocked() {
    if (!this.active) return;
    if (window.PaintUI) {
      window.PaintUI.showToast('Nie można rysować na podglądzie. Zastosuj zmiany albo anuluj podgląd.');
    }
  },

  label() {
    if (this.kind === 'gray-luma') return 'skala szarości (wagi)';
    if (this.kind === 'gray-average') return 'skala szarości (średnia)';
    if (this.kind === 'gray-diff') return 'mapa różnicy (|wagi − średnia|)';
    if (this.kind === 'adjust') return this.adjustLabel;
    if (this.channel) return `kanał ${this.channel.toUpperCase()} w kolorze`;
    return 'kolor';
  },

  updateControls() {
    const applyButton = document.getElementById('btn-image-preview-apply');
    const cancelButton = document.getElementById('btn-image-preview-cancel');
    const channelControls = document.getElementById('image-channel-controls');
    const grayControls = document.getElementById('image-gray-controls');
    const ownSession = this.active && this.mode !== 'adjust'; // korekcje mają własne przyciski
    if (applyButton) applyButton.disabled = !ownSession;
    if (cancelButton) cancelButton.disabled = !ownSession;
    if (channelControls) channelControls.hidden = this.mode !== 'color';
    if (grayControls) grayControls.hidden = this.mode !== 'gray';

    document.querySelectorAll('[data-image-mode]').forEach((button) => {
      const selected = button.dataset.imageMode === this.mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('[data-color-channel]').forEach((button) => {
      const selected = button.dataset.colorChannel === this.channel;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('[data-gray-method]').forEach((button) => {
      const selected = button.dataset.grayMethod === this.grayMethod;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });

    window.dispatchEvent(new CustomEvent('paint:previewstate', {
      detail: { active: this.active, mode: this.mode }
    }));
  }
};

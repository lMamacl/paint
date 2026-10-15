/**
 * js/ui.js
 * Moduł powiązań interfejsu użytkownika (UI):
 * - Przełączanie narzędzi w Toolbarze
 * - Pasek opcji aktywnego narzędzia (ToolOptions)
 * - Obsługa próbników barw i palety (ColorPanel)
 * - Wskaźnik pozycji kursora, wymiarów i kontrolki zoomu (StatusBar)
 * - Obsługa zdarzeń myszy, skrótów klawiszowych i ujednoliconego modalu zapisu
 */

window.PaintUI = {
  init() {
    this.bindToolButtons();
    this.bindToolOptions();
    this.bindColorPanel();
    this.bindTopBarActions();
    this.bindSaveModal();
    this.bindCanvasEvents();
    this.bindZoomControls();
    this.bindKeyboardShortcuts();
    this.bindStateObservers();
    this.updateToolOptionsVisibility();
    this.updateColorDisplays();
  },

  /**
   * Przyciski wyboru narzędzia w lewym pasku bocznym.
   */
  bindToolButtons() {
    const buttons = document.querySelectorAll('.tool-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const toolId = btn.dataset.tool;
        if (!toolId) return;

        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        window.PaintState.set('currentTool', toolId);
        if (toolId === 'bucket') {
          this.setActiveColorTarget('fill');
        } else if (toolId === 'pencil' || toolId === 'line' || toolId === 'eraser') {
          this.setActiveColorTarget('stroke');
        }
        this.updateToolOptionsVisibility();
        this.updateStatusToolHint();
      });
    });
  },

  /**
   * Aktualizuje widoczność kontrolek w górnym pasku opcji (ToolOptions).
   */
  updateToolOptionsVisibility() {
    const tool = window.PaintState.currentTool;

    // Przełączanie sekcji opcji
    const optPencil = document.getElementById('opt-pencil');
    const optEraser = document.getElementById('opt-eraser');
    const optLine = document.getElementById('opt-line');
    const optShape = document.getElementById('opt-shape');
    const optBucket = document.getElementById('opt-bucket');

    if (optPencil) optPencil.style.display = tool === 'pencil' ? 'flex' : 'none';
    if (optEraser) optEraser.style.display = tool === 'eraser' ? 'flex' : 'none';
    if (optLine) optLine.style.display = tool === 'line' ? 'flex' : 'none';
    if (optShape) optShape.style.display = (tool === 'rect' || tool === 'ellipse') ? 'flex' : 'none';
    if (optBucket) optBucket.style.display = tool === 'bucket' ? 'flex' : 'none';

    // Synchronizacja stanu kontrolek w widocznym panelu
    this.syncDashStyleUI(window.PaintState.lineDash);
    this.syncLineWidthUI(window.PaintState.lineWidth);
    this.syncShapeStrokeVisibility();

    // Nazwa aktywnego narzędzia w nagłówku paska opcji
    const labelEl = document.getElementById('active-tool-label');
    const names = {
      pencil: 'Ołówek',
      eraser: 'Gumka',
      line: 'Linia',
      rect: 'Prostokąt',
      ellipse: 'Elipsa',
      bucket: 'Wiadro z farbą'
    };
    if (labelEl) labelEl.textContent = names[tool] || tool;
  },

  /**
   * Synchronizuje przyciski stylu linii (ciągła/przerywana/kropkowana) we wszystkich narzędziach.
   */
  syncDashStyleUI(dash) {
    document.querySelectorAll('.btn-dash-style').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.dash === dash);
    });
  },

  /**
   * Synchronizuje suwaki grubości linii między narzędziami.
   */
  syncLineWidthUI(width) {
    ['pencil-width-slider', 'line-width-slider', 'shape-width-slider'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = width;
    });
    ['pencil-width-val', 'line-width-val', 'shape-width-val'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = `${width}px`;
    });
  },

  /**
   * Aktualizuje widoczność kontrolek obrysu w zależności od trybu wypełnienia kształtu.
   */
  syncShapeStrokeVisibility() {
    const strokeControls = document.getElementById('shape-stroke-controls');
    if (strokeControls) {
      const wantsStroke = window.PaintState.fillMode !== 'fill';
      strokeControls.style.display = wantsStroke ? 'flex' : 'none';
    }
  },

  /**
   * Wiązanie suwaków i pól w pasku opcji.
   */
  bindToolOptions() {
    // 1. Grubość ołówka
    const pencilWidthSlider = document.getElementById('pencil-width-slider');
    if (pencilWidthSlider) {
      pencilWidthSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        window.PaintState.set('lineWidth', val);
        this.syncLineWidthUI(val);
      });
    }

    // Presety grubości ołówka (1, 2, 4, 8, 16, 24 px)
    document.querySelectorAll('.pencil-size-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        const size = parseInt(btn.dataset.size, 10);
        window.PaintState.set('lineWidth', size);
        this.syncLineWidthUI(size);
      });
    });

    // 2. Rozmiar gumki
    const eraserSizeSlider = document.getElementById('eraser-size-slider');
    const eraserSizeVal = document.getElementById('eraser-size-val');
    if (eraserSizeSlider) {
      eraserSizeSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        window.PaintState.set('eraserSize', val);
        if (eraserSizeVal) eraserSizeVal.textContent = `${val}px`;
      });
    }

    // 3. Grubość linii
    const lineWidthSlider = document.getElementById('line-width-slider');
    if (lineWidthSlider) {
      lineWidthSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        window.PaintState.set('lineWidth', val);
        this.syncLineWidthUI(val);
      });
    }

    // Styl linii (ciągła, przerywana, kropkowana) - synchronizowany między Linia i Kształty
    document.querySelectorAll('.btn-dash-style').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dash = btn.dataset.dash;
        window.PaintState.set('lineDash', dash);
        this.syncDashStyleUI(dash);
      });
    });

    // 4. Kształty (tryb: obrys, wypełnienie, oba)
    document.querySelectorAll('.btn-fill-mode').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-fill-mode').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        window.PaintState.set('fillMode', btn.dataset.mode);
        this.syncShapeStrokeVisibility();
      });
    });

    // Grubość obrysu kształtów
    const shapeWidthSlider = document.getElementById('shape-width-slider');
    if (shapeWidthSlider) {
      shapeWidthSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        window.PaintState.set('lineWidth', val);
        this.syncLineWidthUI(val);
      });
    }

    // 5. Tolerancja i kolor wiadra
    const bucketTolSlider = document.getElementById('bucket-tol-slider');
    const bucketTolVal = document.getElementById('bucket-tol-val');
    if (bucketTolSlider) {
      bucketTolSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        window.PaintState.set('tolerance', val);
        if (bucketTolVal) bucketTolVal.textContent = val;
      });
    }

    const inputBucketColor = document.getElementById('input-bucket-color');
    if (inputBucketColor) {
      inputBucketColor.addEventListener('input', (e) => {
        window.PaintState.set('fillColor', e.target.value);
        this.updateColorDisplays();
      });
    }
  },

  /**
   * Ustawia aktywny cel edycji koloru: 'stroke' (obrys) lub 'fill' (wypełnienie).
   */
  setActiveColorTarget(target) {
    window.PaintState.activeColorTarget = target;
    const swatchStroke = document.getElementById('preview-stroke-color');
    const swatchFill = document.getElementById('preview-fill-color');
    const rowStroke = document.getElementById('row-stroke-color');
    const rowFill = document.getElementById('row-fill-color');

    if (swatchStroke) swatchStroke.classList.toggle('active', target === 'stroke');
    if (swatchFill) swatchFill.classList.toggle('active', target === 'fill');
    if (rowStroke) rowStroke.classList.toggle('active', target === 'stroke');
    if (rowFill) rowFill.classList.toggle('active', target === 'fill');

    const hint = document.querySelector('.palette-hint');
    if (hint) {
      if (target === 'stroke') {
        hint.textContent = 'Aktywny: Obrys · Klik: zmiana obrysu · Shift/PPM: wypełnienie';
      } else {
        hint.textContent = 'Aktywny: Wypełnienie · Klik: zmiana wypełnienia · Shift/PPM: obrys';
      }
    }
  },

  /**
   * Obsługa wyboru kolorów, nakładających się próbników i palety barw.
   */
  bindColorPanel() {
    const inputStroke = document.getElementById('input-stroke-color');
    const inputFill = document.getElementById('input-fill-color');
    const previewStroke = document.getElementById('preview-stroke-color');
    const previewFill = document.getElementById('preview-fill-color');
    const rowStroke = document.getElementById('row-stroke-color');
    const rowFill = document.getElementById('row-fill-color');

    // Kolor obrysu z systemowego próbnika
    if (inputStroke) {
      inputStroke.addEventListener('input', (e) => {
        window.PaintState.set('strokeColor', e.target.value);
        this.setActiveColorTarget('stroke');
        this.updateColorDisplays();
      });
    }

    // Kolor wypełnienia z systemowego próbnika
    if (inputFill) {
      inputFill.addEventListener('input', (e) => {
        window.PaintState.set('fillColor', e.target.value);
        this.setActiveColorTarget('fill');
        this.updateColorDisplays();
      });
    }

    // Kliknięcie w próbnik obrysu lub etykietę aktywuje obrys
    if (previewStroke) {
      previewStroke.addEventListener('click', (e) => {
        if (e.target !== inputStroke) this.setActiveColorTarget('stroke');
      });
    }
    if (rowStroke) {
      rowStroke.addEventListener('click', () => this.setActiveColorTarget('stroke'));
    }

    // Kliknięcie w próbnik wypełnienia lub etykietę aktywuje wypełnienie
    if (previewFill) {
      previewFill.addEventListener('click', (e) => {
        if (e.target !== inputFill) this.setActiveColorTarget('fill');
      });
    }
    if (rowFill) {
      rowFill.addEventListener('click', () => this.setActiveColorTarget('fill'));
    }

    // Zamiana kolorów (X)
    const btnSwap = document.getElementById('btn-swap-colors');
    if (btnSwap) {
      btnSwap.addEventListener('click', () => {
        window.PaintState.swapColors();
        this.updateColorDisplays();
      });
    }

    // Reset kolorów (domyślne)
    const btnReset = document.getElementById('btn-reset-colors');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        window.PaintState.resetColors();
        this.updateColorDisplays();
      });
    }

    // Paleta gotowych próbek kolorów
    document.querySelectorAll('.color-swatch').forEach((swatch) => {
      const color = swatch.dataset.color;

      // Kliknięcie LPM: modyfikuje aktywny cel (lub drugi, jeśli wciśnięty Shift)
      swatch.addEventListener('click', (e) => {
        const activeTarget = window.PaintState.activeColorTarget || 'stroke';
        const targetToSet = e.shiftKey ? (activeTarget === 'stroke' ? 'fill' : 'stroke') : activeTarget;

        if (targetToSet === 'stroke') {
          window.PaintState.set('strokeColor', color);
        } else {
          window.PaintState.set('fillColor', color);
        }
        this.updateColorDisplays();
      });

      // Kliknięcie PPM: modyfikuje nieaktywny cel (wypełnienie, gdy aktywny obrys)
      swatch.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const activeTarget = window.PaintState.activeColorTarget || 'stroke';
        const targetToSet = activeTarget === 'stroke' ? 'fill' : 'stroke';

        if (targetToSet === 'stroke') {
          window.PaintState.set('strokeColor', color);
        } else {
          window.PaintState.set('fillColor', color);
        }
        this.updateColorDisplays();
      });
    });
  },

  /**
   * Aktualizuje podgląd wizualny kolorów w panelu oraz w pasku narzędzi.
   */
  updateColorDisplays() {
    const inputStroke = document.getElementById('input-stroke-color');
    const inputFill = document.getElementById('input-fill-color');
    const previewStroke = document.getElementById('preview-stroke-color');
    const previewFill = document.getElementById('preview-fill-color');
    const hexStroke = document.getElementById('hex-stroke-color');
    const hexFill = document.getElementById('hex-fill-color');

    const previewBucket = document.getElementById('preview-bucket-color');
    const inputBucket = document.getElementById('input-bucket-color');
    const hexBucket = document.getElementById('hex-bucket-color');

    if (inputStroke) inputStroke.value = window.PaintState.strokeColor;
    if (inputFill) inputFill.value = window.PaintState.fillColor;

    if (previewStroke) previewStroke.style.backgroundColor = window.PaintState.strokeColor;
    if (previewFill) previewFill.style.backgroundColor = window.PaintState.fillColor;

    if (hexStroke) hexStroke.textContent = window.PaintState.strokeColor.toUpperCase();
    if (hexFill) hexFill.textContent = window.PaintState.fillColor.toUpperCase();

    // Synchronizacja wskaźnika koloru wiadra
    if (previewBucket) previewBucket.style.backgroundColor = window.PaintState.fillColor;
    if (inputBucket) inputBucket.value = window.PaintState.fillColor;
    if (hexBucket) hexBucket.textContent = window.PaintState.fillColor.toUpperCase();
  },

  /**
   * Akcje w górnym menu (Nowy, Otwórz, Zapisz, Cofnij, Ponów, Wyczyść, Rozmiar).
   */
  bindTopBarActions() {
    // 1. Nowy dokument
    const btnNew = document.getElementById('btn-new-file');
    if (btnNew) {
      btnNew.addEventListener('click', () => window.PaintFiles.newDocument());
    }

    // 2. Otwórz plik obrazu
    const btnOpenFile = document.getElementById('btn-open-file');
    if (btnOpenFile) {
      btnOpenFile.addEventListener('click', () => window.PaintFiles.openImageFile());
    }

    // 3. Ujednolicony przycisk Zapisz
    const btnSaveFile = document.getElementById('btn-save-file');
    if (btnSaveFile) {
      btnSaveFile.addEventListener('click', () => window.PaintFiles.openSaveModal());
    }

    // 4. Cofnij / Ponów
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');

    if (btnUndo) {
      btnUndo.addEventListener('click', () => {
        window.PaintCanvas.history.undo(window.PaintCanvas.mainCtx, (w, h) => {
          window.PaintCanvas.setDimensions(w, h);
        });
      });
    }

    if (btnRedo) {
      btnRedo.addEventListener('click', () => {
        window.PaintCanvas.history.redo(window.PaintCanvas.mainCtx, (w, h) => {
          window.PaintCanvas.setDimensions(w, h);
        });
      });
    }

    // 5. Wyczyść całą kanwę do bieli
    const btnClear = document.getElementById('btn-clear-canvas');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (confirm('Czy na pewno chcesz wyczyścić całą kanwę?')) {
          window.PaintCanvas.clearToWhite(true);
        }
      });
    }

    // 6. Zmiana rozmiaru kanwy z panelu bocznego
    const inputCanvasW = document.getElementById('input-canvas-width');
    const inputCanvasH = document.getElementById('input-canvas-height');
    const btnApplySize = document.getElementById('btn-apply-canvas-size');

    const applySize = () => {
      const w = parseInt(inputCanvasW.value, 10);
      const h = parseInt(inputCanvasH.value, 10);
      if (w > 0 && h > 0) {
        window.PaintCanvas.resize(w, h, true);
      }
    };

    if (btnApplySize && inputCanvasW && inputCanvasH) {
      btnApplySize.addEventListener('click', applySize);
      inputCanvasW.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applySize();
      });
      inputCanvasH.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applySize();
      });
    }

    // Aktualizacja wartości pól rozmiaru przy zdarzeniu zmiany wymiarów
    window.addEventListener('paint:dimensionschange', (e) => {
      const { width, height } = e.detail;
      if (inputCanvasW) inputCanvasW.value = width;
      if (inputCanvasH) inputCanvasH.value = height;

      const statusDim = document.getElementById('status-dimensions');
      if (statusDim) statusDim.textContent = `${width} × ${height} px`;
    });
  },

  /**
   * Obsługa ujednoliconego modalu zapisu obrazu (PNG / JPG).
   */
  bindSaveModal() {
    const modal = document.getElementById('save-modal');
    if (!modal) return;

    // Przełącznik formatu PNG / JPG
    const formatButtons = document.querySelectorAll('.btn-save-format');
    const pngOptions = document.getElementById('save-png-options');
    const jpgOptions = document.getElementById('save-jpg-options');

    formatButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        formatButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        const format = btn.dataset.format;
        if (format === 'png') {
          if (pngOptions) pngOptions.style.display = 'block';
          if (jpgOptions) jpgOptions.style.display = 'none';
        } else {
          if (pngOptions) pngOptions.style.display = 'none';
          if (jpgOptions) jpgOptions.style.display = 'block';
        }
      });
    });

    // Suwak jakości dla JPG
    const qualitySlider = document.getElementById('save-quality-slider');
    const qualityVal = document.getElementById('save-quality-val');
    if (qualitySlider && qualityVal) {
      qualitySlider.addEventListener('input', (e) => {
        qualityVal.textContent = `${e.target.value}%`;
      });
    }

    // Zamknięcie modalu
    const btnClose = document.getElementById('btn-modal-close');
    const btnCancel = document.getElementById('btn-modal-cancel');
    const btnConfirm = document.getElementById('btn-modal-confirm');

    if (btnClose) btnClose.addEventListener('click', () => window.PaintFiles.closeSaveModal());
    if (btnCancel) btnCancel.addEventListener('click', () => window.PaintFiles.closeSaveModal());
    if (btnConfirm) btnConfirm.addEventListener('click', () => window.PaintFiles.saveFromModal());

    // Kliknięcie w tło (backdrop) zamyka okno
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        window.PaintFiles.closeSaveModal();
      }
    });

    // Enter w polu nazwy zatwierdza zapis
    const filenameInput = document.getElementById('save-filename');
    if (filenameInput) {
      filenameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          window.PaintFiles.saveFromModal();
        }
      });
    }
  },

  /**
   * Zdarzenia myszy / wskaźnika na płótnie.
   */
  bindCanvasEvents() {
    const overlay = window.PaintCanvas.overlayCanvas;
    const statusCoords = document.getElementById('status-coords');

    // Wyłączenie menu kontekstowego przeglądarki na płótnie (obsługa PPM)
    overlay.addEventListener('contextmenu', (e) => e.preventDefault());

    overlay.addEventListener('pointerdown', (e) => {
      overlay.setPointerCapture(e.pointerId);
      const coords = window.PaintCanvas.getCanvasCoords(e);
      window.PaintTools.onPointerDown(e, coords);
    });

    window.addEventListener('pointermove', (e) => {
      // Wylicz pozycję kursora na kanwie
      const coords = window.PaintCanvas.getCanvasCoords(e);

      // Aktualizuj współrzędne w pasku stanu, jeśli wskaźnik znajduje się nad kanwą
      if (coords.x >= 0 && coords.x <= window.PaintState.canvasWidth &&
          coords.y >= 0 && coords.y <= window.PaintState.canvasHeight) {
        if (statusCoords) {
          statusCoords.textContent = `${Math.floor(coords.x)}, ${Math.floor(coords.y)} px`;
        }
      }

      window.PaintTools.onPointerMove(e, coords);
    });

    window.addEventListener('pointerup', (e) => {
      const coords = window.PaintCanvas.getCanvasCoords(e);
      window.PaintTools.onPointerUp(e, coords);
    });

    // Obsługa przeciągania pliku obrazu bezpośrednio na kanwę (Drag & Drop)
    const container = window.PaintCanvas.container;
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      container.classList.add('drag-over');
    });

    container.addEventListener('dragleave', () => {
      container.classList.remove('drag-over');
    });

    container.addEventListener('drop', (e) => {
      e.preventDefault();
      container.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        window.PaintFiles.loadImageFromFile(file);
      }
    });
  },

  /**
   * Kontrolki powiększenia (zoom).
   */
  bindZoomControls() {
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const btnZoomReset = document.getElementById('btn-zoom-reset');
    const btnZoomFit = document.getElementById('btn-zoom-fit');
    const statusZoom = document.getElementById('status-zoom');

    if (btnZoomIn) {
      btnZoomIn.addEventListener('click', () => {
        window.PaintCanvas.setZoom(window.PaintState.zoom * 1.25);
      });
    }

    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', () => {
        window.PaintCanvas.setZoom(window.PaintState.zoom / 1.25);
      });
    }

    if (btnZoomReset) {
      btnZoomReset.addEventListener('click', () => {
        window.PaintCanvas.setZoom(1);
      });
    }

    if (btnZoomFit) {
      btnZoomFit.addEventListener('click', () => {
        window.PaintCanvas.fitToScreen();
      });
    }

    window.addEventListener('paint:zoomchange', (e) => {
      if (statusZoom) {
        statusZoom.textContent = `${Math.round(e.detail.zoom * 100)}%`;
      }
    });

    // Zoom kółkiem myszy (Ctrl + Wheel)
    const workspace = document.querySelector('.workspace');
    if (workspace) {
      workspace.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
          window.PaintCanvas.setZoom(window.PaintState.zoom * factor);
        }
      }, { passive: false });
    }
  },

  /**
   * Skróty klawiszowe (P, E, L, R, O, B, X, Ctrl+Z, Ctrl+Y, Ctrl+S).
   */
  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Anulowanie rysowania kształtu lub zamknięcie modalu klawiszem Escape
      if (e.key === 'Escape') {
        const saveModal = document.getElementById('save-modal');
        if (saveModal && saveModal.classList.contains('open')) {
          e.preventDefault();
          window.PaintFiles.closeSaveModal();
          return;
        }
        if (window.PaintTools.isDrawing) {
          window.PaintTools.cancelGesture();
          return;
        }
      }

      // Ignoruj, gdy użytkownik pisze w polu tekstowym (w tym contenteditable)
      if (e.target && e.target.matches && e.target.matches('input, select, textarea, [contenteditable]')) return;

      const key = e.key.toLowerCase();

      // Undo: Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        window.PaintCanvas.history.undo(window.PaintCanvas.mainCtx, (w, h) => {
          window.PaintCanvas.setDimensions(w, h);
        });
        return;
      }

      // Redo: Ctrl+Y lub Ctrl+Shift+Z
      if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        window.PaintCanvas.history.redo(window.PaintCanvas.mainCtx, (w, h) => {
          window.PaintCanvas.setDimensions(w, h);
        });
        return;
      }

      // Zapisz: Ctrl+S -> otwiera ujednolicony modal zapisu
      if ((e.ctrlKey || e.metaKey) && key === 's') {
        e.preventDefault();
        window.PaintFiles.openSaveModal();
        return;
      }

      // Otwórz: Ctrl+O
      if ((e.ctrlKey || e.metaKey) && key === 'o') {
        e.preventDefault();
        window.PaintFiles.openImageFile();
        return;
      }

      // Zamiana kolorów: X
      if (key === 'x') {
        window.PaintState.swapColors();
        this.updateColorDisplays();
        return;
      }

      // Narzędzia:
      const toolShortcuts = {
        p: 'pencil',
        e: 'eraser',
        l: 'line',
        r: 'rect',
        o: 'ellipse',
        b: 'bucket',
        g: 'bucket'
      };

      if (toolShortcuts[key]) {
        const toolBtn = document.querySelector(`.tool-btn[data-tool="${toolShortcuts[key]}"]`);
        if (toolBtn) toolBtn.click();
      }
    });
  },

  /**
   * Aktualizuje podpowiedź w pasku statusu dla aktywnego narzędzia.
   */
  updateStatusToolHint() {
    const hintEl = document.getElementById('status-tool-hint');
    if (!hintEl) return;

    const tool = window.PaintState.currentTool;
    const hints = {
      pencil: 'Ołówek – rysowanie odręczne (P)',
      eraser: 'Gumka – zmazywanie do białego tła (E)',
      line: 'Linia – przeciągnij myszą; przytrzymaj Shift dla kątów 0°, 45°, 90° (L)',
      rect: 'Prostokąt – przeciągnij myszą; przytrzymaj Shift dla kwadratu (R)',
      ellipse: 'Elipsa – przeciągnij myszą; przytrzymaj Shift dla idealnego koła (O)',
      bucket: 'Wiadro z farbą – kliknij, aby wypełnić ciągły obszar kolorem (B)'
    };

    hintEl.textContent = hints[tool] || '';
  },

  /**
   * Obserwatorzy stanu (np. dostępność Undo / Redo).
   */
  bindStateObservers() {
    window.addEventListener('paint:historychange', (e) => {
      const { canUndo, canRedo } = e.detail;
      const btnUndo = document.getElementById('btn-undo');
      const btnRedo = document.getElementById('btn-redo');

      if (btnUndo) {
        btnUndo.disabled = !canUndo;
        btnUndo.classList.toggle('disabled', !canUndo);
      }
      if (btnRedo) {
        btnRedo.disabled = !canRedo;
        btnRedo.classList.toggle('disabled', !canRedo);
      }
    });
  }
};

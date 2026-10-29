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
  colorFormat: 'rgb',
  hoveredCanvasCoords: null,

  init() {
    this.bindToolButtons();
    this.bindToolOptions();
    this.bindColorPanel();
    this.bindTopBarActions();
    this.bindSaveModal();
    this.bindFileInfoModal();
    this.bindErrorModal();
    this.bindDragAndDrop();
    this.bindCanvasEvents();
    this.bindZoomControls();
    this.bindKeyboardShortcuts();
    this.bindStateObservers();
    this.updateToolOptionsVisibility();
    this.updateColorDisplays();

    // Ćwiczenie 3: panel modeli barw i okno operacji na obrazie
    if (window.PaintColorPanel) window.PaintColorPanel.init();
    if (window.PaintCompareView) window.PaintCompareView.init();
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
      bucket: 'Wiadro z farbą',
      eyedropper: 'Pipeta'
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

    const previewBucketColor = document.getElementById('preview-bucket-color');
    if (previewBucketColor) {
      previewBucketColor.addEventListener('click', () => this.openColorPicker('fill'));
    }
  },

  /**
   * Ustawia aktywny cel edycji koloru: 'stroke' (obrys) lub 'fill' (wypełnienie).
   */
  setActiveColorTarget(target) {
    window.PaintState.set('activeColorTarget', target);
    const swatchStroke = document.getElementById('preview-stroke-color');
    const swatchFill = document.getElementById('preview-fill-color');
    const rowStroke = document.getElementById('row-stroke-color');
    const rowFill = document.getElementById('row-fill-color');

    if (swatchStroke) swatchStroke.classList.toggle('active', target === 'stroke');
    if (swatchFill) swatchFill.classList.toggle('active', target === 'fill');
    if (rowStroke) rowStroke.classList.toggle('active', target === 'stroke');
    if (rowFill) rowFill.classList.toggle('active', target === 'fill');

    // panel modeli barw edytuje aktywny kolor — pokaż wartości właściwego celu
    if (window.PaintColorPanel) window.PaintColorPanel.refresh();
    const pickerModal = document.getElementById('color-picker-modal');
    const pickerTitle = document.getElementById('color-picker-title');
    if (pickerModal && pickerModal.classList.contains('open') && pickerTitle) {
      pickerTitle.textContent = target === 'fill' ? 'Edytuj kolor wypełnienia' : 'Edytuj kolor obrysu';
    }
  },

  openColorPicker(target) {
    this.setActiveColorTarget(target);
    const modal = document.getElementById('color-picker-modal');
    const title = document.getElementById('color-picker-title');
    if (title) title.textContent = target === 'fill' ? 'Edytuj kolor wypełnienia' : 'Edytuj kolor obrysu';
    if (modal) modal.classList.add('open');
  },

  closeColorPicker() {
    const modal = document.getElementById('color-picker-modal');
    if (modal) modal.classList.remove('open');
  },

  cancelImagePreview() {
    if (window.PaintCompareView && window.PaintCompareView.active) {
      window.PaintCompareView.cancel();
    }
  },

  /**
   * Obsługa wyboru kolorów, nakładających się próbników i palety barw.
   */
  bindColorPanel() {
    const previewStroke = document.getElementById('preview-stroke-color');
    const previewFill = document.getElementById('preview-fill-color');
    const rowStroke = document.getElementById('row-stroke-color');
    const rowFill = document.getElementById('row-fill-color');

    // Kliknięcie próbki otwiera edytor modeli dla tego koloru.
    if (previewStroke) {
      previewStroke.addEventListener('click', () => this.openColorPicker('stroke'));
    }
    if (rowStroke) {
      rowStroke.addEventListener('click', () => this.setActiveColorTarget('stroke'));
    }

    // Kliknięcie próbki otwiera edytor modeli dla tego koloru.
    if (previewFill) {
      previewFill.addEventListener('click', () => this.openColorPicker('fill'));
    }
    if (rowFill) {
      rowFill.addEventListener('click', () => this.setActiveColorTarget('fill'));
    }

    const colorModal = document.getElementById('color-picker-modal');
    ['btn-color-picker-close', 'btn-color-picker-done'].forEach((id) => {
      const button = document.getElementById(id);
      if (button) button.addEventListener('click', () => this.closeColorPicker());
    });
    if (colorModal) {
      colorModal.addEventListener('mousedown', (e) => {
        if (e.target === colorModal) this.closeColorPicker();
      });
    }
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && colorModal && colorModal.classList.contains('open')) {
        e.preventDefault();
        this.closeColorPicker();
      }
    });

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
    const previewStroke = document.getElementById('preview-stroke-color');
    const previewFill = document.getElementById('preview-fill-color');
    const hexStroke = document.getElementById('hex-stroke-color');
    const hexFill = document.getElementById('hex-fill-color');

    const previewBucket = document.getElementById('preview-bucket-color');
    const hexBucket = document.getElementById('hex-bucket-color');

    if (previewStroke) previewStroke.style.backgroundColor = window.PaintState.strokeColor;
    if (previewFill) previewFill.style.backgroundColor = window.PaintState.fillColor;

    if (hexStroke) hexStroke.textContent = window.PaintState.strokeColor.toUpperCase();
    if (hexFill) hexFill.textContent = window.PaintState.fillColor.toUpperCase();

    // Synchronizacja wskaźnika koloru wiadra
    if (previewBucket) previewBucket.style.backgroundColor = window.PaintState.fillColor;
    if (hexBucket) hexBucket.textContent = window.PaintState.fillColor.toUpperCase();

    // kolor mógł zmienić się spoza panelu modeli barw (paleta, zamiana, reset)
    if (window.PaintColorPanel) window.PaintColorPanel.refresh();
  },

  bindTopBarActions() {
    // 1. Nowy dokument
    const btnNew = document.getElementById('btn-new-file');
    if (btnNew) {
      btnNew.addEventListener('click', () => {
        this.cancelImagePreview();
        window.PaintFiles.newDocument();
      });
    }

    // 2. Otwórz plik obrazu
    const btnOpenFile = document.getElementById('btn-open-file');
    if (btnOpenFile) {
      btnOpenFile.addEventListener('click', () => {
        this.cancelImagePreview();
        window.PaintFiles.openImageFile();
      });
    }

    // 3. Ujednolicony przycisk Zapisz
    const btnSaveFile = document.getElementById('btn-save-file');
    if (btnSaveFile) {
      btnSaveFile.addEventListener('click', () => {
        this.cancelImagePreview();
        window.PaintFiles.openSaveModal();
      });
    }

    // 3b. Informacje o pliku
    const btnFileInfo = document.getElementById('btn-file-info');
    if (btnFileInfo) {
      btnFileInfo.addEventListener('click', () => this.openFileInfoModal());
    }

    // 4. Cofnij / Ponów
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');

    if (btnUndo) {
      btnUndo.addEventListener('click', () => {
        this.cancelImagePreview();
        window.PaintCanvas.history.undo(window.PaintCanvas.mainCtx, (w, h) => {
          window.PaintCanvas.setDimensions(w, h);
        });
      });
    }

    if (btnRedo) {
      btnRedo.addEventListener('click', () => {
        this.cancelImagePreview();
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
          this.cancelImagePreview();
          window.PaintCanvas.clearToWhite(true);
        }
      });
    }

    // Zmiana rozmiaru kanwy z panelu bocznego
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

      // Aktualizacja wymiarów w metadanych bieżącego pliku
      const curInfo = window.PaintState?.currentFileInfo;
      if (curInfo) {
        curInfo.width = width;
        curInfo.height = height;
      }
    });
  },

  /**
   * Obsługa ujednoliconego modalu zapisu obrazu (PPM P3/P6, PNG, JPG).
   */
  bindSaveModal() {
    const modal = document.getElementById('save-modal');
    if (!modal) return;

    // Przełącznik formatu (PPM P6, PPM P3, PNG, JPG)
    const formatButtons = document.querySelectorAll('.btn-save-format');
    const p6Options = document.getElementById('save-ppm-p6-options');
    const p3Options = document.getElementById('save-ppm-p3-options');
    const pngOptions = document.getElementById('save-png-options');
    const jpgOptions = document.getElementById('save-jpg-options');
    const commentGroup = document.getElementById('save-comment-group');
    const extBadge = document.getElementById('save-extension-badge');

    formatButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        formatButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        const format = btn.dataset.format;
        if (p6Options) p6Options.style.display = format === 'ppm-p6' ? 'block' : 'none';
        if (p3Options) p3Options.style.display = format === 'ppm-p3' ? 'block' : 'none';
        if (pngOptions) pngOptions.style.display = format === 'png' ? 'block' : 'none';
        if (jpgOptions) jpgOptions.style.display = format === 'jpg' ? 'block' : 'none';
        if (commentGroup) commentGroup.style.display = (format === 'ppm-p6' || format === 'ppm-p3') ? 'block' : 'none';

        if (extBadge) {
          if (format === 'ppm-p6' || format === 'ppm-p3') {
            extBadge.textContent = '.ppm';
          } else if (format === 'png') {
            extBadge.textContent = '.png';
          } else if (format === 'jpg') {
            extBadge.textContent = '.jpg';
          }
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
    const formatSelect = document.getElementById('status-color-format');
    if (formatSelect) {
      this.colorFormat = formatSelect.value || 'rgb';
      formatSelect.addEventListener('change', () => {
        this.colorFormat = formatSelect.value;
        this.refreshPixelReadout();
      });
    }

    // Wyłączenie menu kontekstowego przeglądarki na płótnie (obsługa PPM)
    overlay.addEventListener('contextmenu', (e) => e.preventDefault());

    overlay.addEventListener('pointerdown', (e) => {
      if (window.PaintCompareView && window.PaintCompareView.active) {
        if (window.PaintState.currentTool === 'eyedropper') {
          overlay.setPointerCapture(e.pointerId);
          const coords = window.PaintCanvas.getCanvasCoords(e);
          window.PaintTools.onPointerDown(e, coords);
          return;
        }
        e.preventDefault();
        window.PaintCompareView.notifyDrawBlocked();
        return;
      }
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
        this.hoveredCanvasCoords = coords;
        if (statusCoords) {
          statusCoords.textContent = `${Math.floor(coords.x)}, ${Math.floor(coords.y)} px`;
        }
        this.refreshPixelReadout();
      } else {
        this.hoveredCanvasCoords = null;
        this.updateStatusToolHint();
      }

      if (!window.PaintCompareView || !window.PaintCompareView.active) {
        window.PaintTools.onPointerMove(e, coords);
      } else if (window.PaintState.currentTool === 'eyedropper' && window.PaintTools.isDrawing) {
        window.PaintTools.onPointerMove(e, coords);
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (window.PaintCompareView && window.PaintCompareView.active) {
        if (window.PaintState.currentTool === 'eyedropper' && window.PaintTools.isDrawing) {
          const coords = window.PaintCanvas.getCanvasCoords(e);
          window.PaintTools.onPointerUp(e, coords);
        }
        return;
      }
      const coords = window.PaintCanvas.getCanvasCoords(e);
      window.PaintTools.onPointerUp(e, coords);
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
      // Anulowanie rysowania kształtu lub zamknięcie modali klawiszem Escape
      if (e.key === 'Escape') {
        const errorModal = document.getElementById('error-modal');
        if (errorModal && errorModal.classList.contains('open')) {
          e.preventDefault();
          this.closeErrorModal();
          return;
        }
        const fileInfoModal = document.getElementById('file-info-modal');
        if (fileInfoModal && fileInfoModal.classList.contains('open')) {
          e.preventDefault();
          this.closeFileInfoModal();
          return;
        }
        const saveModal = document.getElementById('save-modal');
        if (saveModal && saveModal.classList.contains('open')) {
          e.preventDefault();
          window.PaintFiles.closeSaveModal();
          return;
        }
        if (window.PaintCompareView && window.PaintCompareView.active) {
          e.preventDefault();
          this.cancelImagePreview();
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
        this.cancelImagePreview();
        window.PaintCanvas.history.undo(window.PaintCanvas.mainCtx, (w, h) => {
          window.PaintCanvas.setDimensions(w, h);
        });
        return;
      }

      // Redo: Ctrl+Y lub Ctrl+Shift+Z
      if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        this.cancelImagePreview();
        window.PaintCanvas.history.redo(window.PaintCanvas.mainCtx, (w, h) => {
          window.PaintCanvas.setDimensions(w, h);
        });
        return;
      }

      // Zapisz: Ctrl+S -> otwiera ujednolicony modal zapisu
      if ((e.ctrlKey || e.metaKey) && key === 's') {
        e.preventDefault();
        this.cancelImagePreview();
        window.PaintFiles.openSaveModal();
        return;
      }

      // Otwórz: Ctrl+O
      if ((e.ctrlKey || e.metaKey) && key === 'o') {
        e.preventDefault();
        this.cancelImagePreview();
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
        g: 'bucket',
        i: 'eyedropper'
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
      bucket: 'Wiadro z farbą – kliknij, aby wypełnić ciągły obszar kolorem (B)',
      eyedropper: 'Pipeta – kliknij piksel: LPM ustawia aktywny kolor, PPM drugi; odczyt koloru jest na pasku stanu (I)'
    };

    hintEl.textContent = hints[tool] || '';
    hintEl.title = hintEl.textContent;
    if (this.hoveredCanvasCoords) this.refreshPixelReadout();
  },

  refreshPixelReadout() {
    const hintEl = document.getElementById('status-tool-hint');
    const coords = this.hoveredCanvasCoords;
    if (!hintEl || !coords) return;

    const x = Math.floor(coords.x);
    const y = Math.floor(coords.y);
    const inBounds = x >= 0 && y >= 0 &&
      x < window.PaintState.canvasWidth && y < window.PaintState.canvasHeight;
    if (!inBounds) return;

    const previewActive = window.PaintCompareView && window.PaintCompareView.active;
    const compareView = window.PaintCompareView;
    const C = window.PaintColor;
    const Ops = window.PaintImageOps;

    let r, g, b;
    if (previewActive && compareView && compareView.previewImage) {
      const img = compareView.previewImage;
      const idx = (y * img.width + x) * 4;
      r = img.data[idx];
      g = img.data[idx + 1];
      b = img.data[idx + 2];
    } else {
      const pixel = window.PaintCanvas.mainCtx.getImageData(x, y, 1, 1).data;
      r = pixel[0];
      g = pixel[1];
      b = pixel[2];
    }

    const hex = C.rgbToHex(r, g, b).toUpperCase();
    const fmt = (value) => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 }).format(value);

    // Gdy aktywny jest podgląd szarości (wagi, średnia lub różnica) — pokazujemy porównanie obu wariantów!
    if (previewActive && compareView && compareView.mode === 'gray') {
      const orig = window.PaintCanvas.mainCtx.getImageData(x, y, 1, 1).data;
      const luma = Ops.lumaOf(orig[0], orig[1], orig[2]);
      const avg = Ops.averageOf(orig[0], orig[1], orig[2]);
      const diff = Math.abs(luma - avg);
      hintEl.textContent = `Piksel (${x}, ${y}) · wagi ${luma} · średnia ${avg} · Δ ${diff} · ${hex}`;
      hintEl.title = hintEl.textContent;
      return;
    }

    let values;
    if (this.colorFormat === 'hsv') {
      const hsv = C.rgbToHsv(r, g, b);
      values = `HSV ${fmt(hsv.h)}°, ${fmt(hsv.s * 100)}%, ${fmt(hsv.v * 100)}%`;
    } else if (this.colorFormat === 'cmyk') {
      const cmyk = C.rgbToCmyk(r, g, b);
      values = `CMYK ${fmt(cmyk.c * 100)}%, ${fmt(cmyk.m * 100)}%, ${fmt(cmyk.y * 100)}%, ${fmt(cmyk.k * 100)}%`;
    } else {
      values = `RGB ${r}, ${g}, ${b}`;
    }

    hintEl.textContent = `Piksel (${x}, ${y}) · ${values} · ${hex}`;
    hintEl.title = hintEl.textContent;
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
  },

  /**
   * Obsługa modalu informacji o pliku (Wymóg 3).
   */
  bindFileInfoModal() {
    const modal = document.getElementById('file-info-modal');
    if (!modal) return;

    const btnClose = document.getElementById('btn-file-info-close');
    const btnOk = document.getElementById('btn-file-info-ok');

    if (btnClose) btnClose.addEventListener('click', () => this.closeFileInfoModal());
    if (btnOk) btnOk.addEventListener('click', () => this.closeFileInfoModal());

    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeFileInfoModal();
    });
  },

  /**
   * Obsługa modalu błędu (Wymóg 4).
   */
  bindErrorModal() {
    const modal = document.getElementById('error-modal');
    if (!modal) return;

    const btnClose = document.getElementById('btn-error-modal-close');
    const btnOk = document.getElementById('btn-error-modal-ok');

    if (btnClose) btnClose.addEventListener('click', () => this.closeErrorModal());
    if (btnOk) btnOk.addEventListener('click', () => this.closeErrorModal());

    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeErrorModal();
    });
  },

  /**
   * Obsługa przeciągania plików metodą Przeciągnij i Upuść (Drag and Drop).
   */
  bindDragAndDrop() {
    const workspace = document.querySelector('.workspace');
    if (!workspace) return;

    ['dragenter', 'dragover'].forEach((eventName) => {
      window.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        workspace.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      window.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target === workspace || !workspace.contains(e.relatedTarget)) {
          workspace.classList.remove('drag-over');
        }
      });
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      workspace.classList.remove('drag-over');

      const file = e.dataTransfer?.files?.[0];
      if (file && window.PaintFiles) {
        window.PaintFiles.loadImageFromFile(file);
      }
    });
  },

  /**
   * Wyświetla informacje o wczytanym pliku w pasku stanu i przygotowuje modal informacji (Wymóg 3).
   * @param {{ name: string, type: string, width: number, height: number, maxVal: number, comments: string[] }} info 
   */
  displayFileInfo(info) {
    if (!info) return;

    const isPPM = info.type === 'P3' || info.type === 'P6';

    // Podpowiedź w pasku stanu
    const hintText = isPPM
      ? `Wczytano plik PPM (${info.type}): ${info.width} × ${info.height} px, maxVal: ${info.maxVal}`
      : `Wczytano plik ${info.type}: ${info.width} × ${info.height} px`;

    const hintEl = document.getElementById('status-tool-hint');
    if (hintEl) {
      hintEl.textContent = hintText;
    }

    // Pływające powiadomienie Toast
    this.showToast(hintText);
  },

  /**
   * Otwiera modal informacji o pliku z danymi bieżącego obrazu.
   */
  openFileInfoModal() {
    const modal = document.getElementById('file-info-modal');
    if (!modal) return;

    const info = window.PaintState.currentFileInfo || {
      name: 'Nowy dokument (bez nazwy)',
      type: 'Brak (kanwa robocza)',
      width: window.PaintCanvas.mainCanvas.width,
      height: window.PaintCanvas.mainCanvas.height,
      maxVal: 255,
      comments: []
    };

    const nameEl = document.getElementById('info-file-name');
    const typeEl = document.getElementById('info-file-type');
    const dimEl = document.getElementById('info-file-dimensions');
    const maxValEl = document.getElementById('info-file-maxval');
    const pixelsEl = document.getElementById('info-file-pixels');
    const commentsEl = document.getElementById('info-file-comments');

    if (nameEl) nameEl.textContent = info.name || 'Dokument Paint';
    if (typeEl) {
      if (info.type === 'P3') typeEl.textContent = 'PPM P3 (tekstowy / ASCII)';
      else if (info.type === 'P6') typeEl.textContent = 'PPM P6 (binarny / Raw)';
      else typeEl.textContent = info.type;
    }
    if (dimEl) dimEl.textContent = `${info.width} × ${info.height} px`;
    if (maxValEl) maxValEl.textContent = `${info.maxVal}`;
    if (pixelsEl) pixelsEl.textContent = `${(info.width * info.height).toLocaleString('pl-PL')} pikseli`;

    if (commentsEl) {
      if (info.comments && info.comments.length > 0) {
        commentsEl.textContent = info.comments.map((c) => `# ${c}`).join('\n');
      } else {
        commentsEl.textContent = 'Brak komentarzy w nagłówku pliku.';
      }
    }

    modal.classList.add('open');
  },

  /**
   * Zamyka modal informacji o pliku.
   */
  closeFileInfoModal() {
    const modal = document.getElementById('file-info-modal');
    if (modal) modal.classList.remove('open');
  },

  /**
   * Otwiera modal z komunikatem błędu (Wymóg 4).
   * @param {string} title 
   * @param {string} message 
   */
  showErrorModal(title, message) {
    const modal = document.getElementById('error-modal');
    if (!modal) {
      alert(`${title}: ${message}`);
      return;
    }

    const titleEl = document.getElementById('error-modal-title');
    const msgEl = document.getElementById('error-modal-message');

    if (titleEl) titleEl.textContent = title || 'Błąd pliku';
    if (msgEl) msgEl.textContent = message || 'Wystąpił nieoczekiwany błąd.';

    modal.classList.add('open');
  },

  /**
   * Zamyka modal błędu.
   */
  closeErrorModal() {
    const modal = document.getElementById('error-modal');
    if (modal) modal.classList.remove('open');
  },

  /**
   * Wyświetla pływające powiadomienie Toast na dole ekranu.
   * @param {string} message 
   * @param {number} [duration=3500] 
   */
  showToast(message, duration = 3500) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;

    toast.textContent = message;
    toast.style.display = 'flex';
    toast.classList.remove('hide');

    if (this._toastTimer) clearTimeout(this._toastTimer);

    this._toastTimer = setTimeout(() => {
      toast.classList.add('hide');
      setTimeout(() => {
        toast.style.display = 'none';
      }, 300);
    }, duration);
  }
};

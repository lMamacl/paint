/**
 * js/canvas.js
 * Moduł zarządzania płótnami: Płótno Główne (Main Canvas) oraz Płótno Podglądu (Overlay Canvas).
 *
 * Zastosowano wzorzec dwóch nałożonych na siebie płócien:
 * 1. Main Canvas - białe tło, trwały rysunek.
 * 2. Overlay Canvas - przezroczysty, na wierzchu, do renderowania podglądu (rubberbanding)
 *    w trakcie przeciągania myszą bez modyfikowania głównego rysunku.
 */

window.PaintCanvas = {
  mainCanvas: null,
  mainCtx: null,
  overlayCanvas: null,
  overlayCtx: null,
  container: null,
  history: null,

  /**
   * Inicjalizacja płócien w podanym kontenerze DOM.
   */
  init(containerEl) {
    this.container = containerEl;
    this.mainCanvas = document.getElementById('canvas-main');
    this.mainCtx = this.mainCanvas.getContext('2d', { willReadFrequently: true });

    this.overlayCanvas = document.getElementById('canvas-overlay');
    this.overlayCtx = this.overlayCanvas.getContext('2d');

    this.history = new window.PaintHistory(30);

    // Ustawienie początkowych wymiarów z białym tłem
    this.setDimensions(window.PaintState.canvasWidth, window.PaintState.canvasHeight);
    this.clearToWhite(false);
    this.history.reset(this.mainCtx);
  },

  /**
   * Czyści główne płótno do czystej bieli.
   */
  clearToWhite(recordHistory = true) {
    this.mainCtx.fillStyle = '#ffffff';
    this.mainCtx.fillRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);
    this.clearOverlay();

    if (recordHistory) {
      this.history.pushState(this.mainCtx);
    }
  },

  /**
   * Czyści bufor podglądu (overlay).
   */
  clearOverlay() {
    this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
  },

  /**
   * Ustawia fizyczne wymiary obu płócien w pikselach.
   */
  setDimensions(w, h) {
    w = Math.max(10, Math.min(8192, Math.round(w)));
    h = Math.max(10, Math.min(8192, Math.round(h)));

    this.mainCanvas.width = w;
    this.mainCanvas.height = h;

    this.overlayCanvas.width = w;
    this.overlayCanvas.height = h;

    this.updateContainerStyle();

    window.PaintState.canvasWidth = w;
    window.PaintState.canvasHeight = h;

    if (window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('paint:dimensionschange', { detail: { width: w, height: h } }));
    }
  },

  /**
   * Zmienia rozmiar kanwy z zachowaniem dotychczasowego rysunku.
   */
  resize(newWidth, newHeight, recordHistory = true) {
    newWidth = Math.max(10, Math.round(newWidth));
    newHeight = Math.max(10, Math.round(newHeight));

    // Kopia zapasowa dotychczasowej zawartości
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.mainCanvas.width;
    tempCanvas.height = this.mainCanvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(this.mainCanvas, 0, 0);

    // Zmiana wymiarów
    this.setDimensions(newWidth, newHeight);

    // Wypełnienie nowego obszaru na biało
    this.mainCtx.fillStyle = '#ffffff';
    this.mainCtx.fillRect(0, 0, newWidth, newHeight);

    // Przerysowanie starej zawartości w lewym górnym rogu
    this.mainCtx.drawImage(tempCanvas, 0, 0);

    if (recordHistory) {
      this.history.pushState(this.mainCtx);
    }
  },

  /**
   * Przelicza współrzędne zdarzenia myszy/wskaźnika (clientX, clientY)
   * na dokładne współrzędne pikselowe kanwy (uwzględniając skalowanie CSS i zoom).
   */
  getCanvasCoords(e) {
    const rect = this.overlayCanvas.getBoundingClientRect();
    const scaleX = this.overlayCanvas.width / rect.width;
    const scaleY = this.overlayCanvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  },

  /**
   * Aktualizuje wymiary kontenera z uwzględnieniem poziomu zoomu.
   */
  updateContainerStyle() {
    const z = window.PaintState.zoom;
    const w = Math.round(this.mainCanvas.width * z);
    const h = Math.round(this.mainCanvas.height * z);

    this.container.style.width = `${w}px`;
    this.container.style.height = `${h}px`;
    this.container.style.minWidth = `${w}px`;
    this.container.style.minHeight = `${h}px`;
  },

  /**
   * Zmienia współczynnik powiększenia (zoom).
   */
  setZoom(z) {
    const clamped = Math.max(0.1, Math.min(10, z));
    window.PaintState.zoom = clamped;
    this.updateContainerStyle();

    if (window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('paint:zoomchange', { detail: { zoom: clamped } }));
    }
  },

  /**
   * Automatycznie dopasowuje zoom, aby cała kanwa zmieściła się w oknie roboczym.
   */
  fitToScreen() {
    const workspace = this.container.parentElement;
    if (!workspace) return;

    const pad = 80;
    const availW = workspace.clientWidth - pad;
    const availH = workspace.clientHeight - pad;

    const scaleX = availW / this.mainCanvas.width;
    const scaleY = availH / this.mainCanvas.height;
    const fitScale = Math.min(1, Math.min(scaleX, scaleY));

    this.setZoom(Math.max(0.1, Math.floor(fitScale * 100) / 100));
  }
};

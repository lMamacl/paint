/**
 * js/state.js
 * Centralny stan aplikacji Paint (Grafika Komputerowa).
 * Przechowuje: aktywne narzędzie, kolor obrysu i wypełnienia, grubość śladu,
 * styl linii, tryb wypełnienia kształtów, tolerancję wiadra oraz parametry kanwy.
 *
 * ZAKRES: stan dotyczy JEDNEJ płaszczyzny pikseli — projekt nie ma warstw.
 */

// Jedno źródło prawdy o kolorach domyślnych (używa tego też przycisk "przywróć domyślne")
window.PaintDefaults = {
  strokeColor: '#8b5cf6',
  fillColor: '#3b82f6'
};

window.PaintState = {
  // Aktywne narzędzie: 'pencil' | 'eraser' | 'line' | 'rect' | 'ellipse' | 'bucket'
  currentTool: 'pencil',

  // Kolory
  strokeColor: window.PaintDefaults.strokeColor,
  fillColor: window.PaintDefaults.fillColor,
  activeColorTarget: 'stroke', // 'stroke' | 'fill' – który próbnik jest aktywny dla palety

  // Opcje linii i pędzla
  lineWidth: 4,           // Grubość linii (1 - 50 px)
  eraserSize: 20,         // Rozmiar gumki (4 - 100 px)
  lineDash: 'solid',      // 'solid' | 'dashed' | 'dotted'

  // Opcje kształtów (prostokąt, elipsa)
  // 'stroke' = tylko obrys, 'fill' = tylko wypełnienie, 'both' = obrys i wypełnienie
  fillMode: 'stroke',

  // Opcje wiadra (flood fill)
  tolerance: 32,          // Tolerancja dopasowania koloru (0 - 255)

  // Parametry kanwy
  canvasWidth: 1024,
  canvasHeight: 640,
  zoom: 1,                // Skala podglądu (np. 1 = 100%)

  // Zmiana właściwości z powiadomieniem obserwatorów (paint:statechange)
  set(key, value) {
    this[key] = value;
    if (window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('paint:statechange', { detail: { key, value } }));
    }
  },

  /** Zamiana kolorów obrysu i wypełnienia (przycisk ⇄ oraz klawisz X). */
  swapColors() {
    const prevStroke = this.strokeColor;
    this.set('strokeColor', this.fillColor);
    this.set('fillColor', prevStroke);
  },

  /** Przywrócenie kolorów domyślnych. */
  resetColors() {
    this.set('strokeColor', window.PaintDefaults.strokeColor);
    this.set('fillColor', window.PaintDefaults.fillColor);
    this.set('activeColorTarget', 'stroke');
  }
};

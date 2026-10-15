/**
 * app.js
 * Punkt wejściowy aplikacji GK Paint.
 * Inicjalizuje moduły Canvas i UI po załadowaniu drzewa DOM.
 */

document.addEventListener('DOMContentLoaded', () => {
  const stage = document.getElementById('canvas-stage');
  if (!stage) {
    console.error('Nie znaleziono kontenera canvas-stage');
    return;
  }

  // 1. Inicjalizacja podwójnego płótna i historii
  window.PaintCanvas.init(stage);

  // 2. Inicjalizacja interfejsu użytkownika, narzędzi i zdarzeń
  window.PaintUI.init();

  // 3. Dopasowanie widoku do ekranu
  setTimeout(() => {
    window.PaintCanvas.fitToScreen();
  }, 50);

  console.log('Paint zainicjalizowany pomyślnie. Wzorzec dwóch płócien aktywny.');
});

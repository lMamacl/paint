/**
 * js/history.js
 * Moduł zarządzania historią operacji (Undo / Redo).
 * Przechowuje migawki pikseli (ImageData) na stosach, umożliwiając cofanie i ponawianie.
 */

window.PaintHistory = class PaintHistory {
  constructor(maxSteps = 30) {
    this.maxSteps = maxSteps;
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Zapisuje bieżący stan kanwy na stosie cofania.
   * Czyści stos ponawiania, ponieważ wykonano nową operację.
   */
  pushState(ctx) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const snapshot = ctx.getImageData(0, 0, w, h);

    this.undoStack.push({
      width: w,
      height: h,
      data: snapshot
    });

    if (this.undoStack.length > this.maxSteps) {
      this.undoStack.shift(); // Usuń najstarszy krok, gdy przekroczono limit
    }

    this.redoStack = [];
    this.notifyChange();
  }

  get canUndo() {
    return this.undoStack.length > 1; // Musi zostać przynajmniej 1 stan początkowy
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * Cofa ostatnią operację.
   */
  undo(ctx, onResizeNeeded) {
    if (!this.canUndo) return;

    // Przenieś bieżący stan do stosu redo
    const currentState = this.undoStack.pop();
    this.redoStack.push(currentState);

    // Odtwórz poprzedni stan
    const prevState = this.undoStack[this.undoStack.length - 1];
    this.applySnapshot(ctx, prevState, onResizeNeeded);
    this.notifyChange();
  }

  /**
   * Ponawia cofniętą operację.
   */
  redo(ctx, onResizeNeeded) {
    if (!this.canRedo) return;

    const nextState = this.redoStack.pop();
    this.undoStack.push(nextState);

    this.applySnapshot(ctx, nextState, onResizeNeeded);
    this.notifyChange();
  }

  /**
   * Przywraca migawkę na kanwę (uwzględnia ewentualną zmianę rozmiaru).
   */
  applySnapshot(ctx, state, onResizeNeeded) {
    if (ctx.canvas.width !== state.width || ctx.canvas.height !== state.height) {
      if (onResizeNeeded) {
        onResizeNeeded(state.width, state.height, false);
      } else {
        ctx.canvas.width = state.width;
        ctx.canvas.height = state.height;
      }
    }
    ctx.putImageData(state.data, 0, 0);
  }

  /**
   * Resetuje historię i zapisuje początkowy stan pustej/nowej kanwy.
   */
  reset(ctx) {
    this.undoStack = [];
    this.redoStack = [];
    this.pushState(ctx);
  }

  notifyChange() {
    if (window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('paint:historychange', {
        detail: {
          canUndo: this.canUndo,
          canRedo: this.canRedo
        }
      }));
    }
  }
};

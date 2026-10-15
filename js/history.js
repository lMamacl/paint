/**
 * js/history.js
 * Transakcyjny moduł zarządzania historią operacji (Undo / Redo) w architekturze Dirty Rect.
 *
 * Zamiast przechowywać pełne kopie całej kanwy (~2.5 MiB na krok), historia v2 zapisuje
 * wyłącznie prostokąt zmienionych pikseli (przed i po operacji).
 *
 * Kontrakt API:
 *  - begin(ctx, bounds?)      — otwiera transakcję przed pierwszą modyfikacją pikseli
 *  - beginLazy(ctx)          — dla narzędzi o nieznanym z góry obszarze (ołówek, gumka)
 *  - commit(ctx, bounds?)    — zatwierdza transakcję po zakończeniu rysowania
 *  - abort()                 — wycofuje bieżącą, niezatwierdzoną transakcję (np. Escape)
 *  - undo(ctx) / redo(ctx)   — przywracanie stanu pikseli
 *  - markClean() / isDirty   — śledzenie stanu zapisu pliku
 *  - describe()              — diagnostyka zużycia pamięci RAM
 */

window.PaintHistory = class PaintHistory {
  constructor(options = {}) {
    if (typeof options === 'number') {
      this.maxSteps = options;
      this.maxBytes = 64 * 1024 * 1024; // Domyślnie 64 MiB
    } else {
      this.maxSteps = options.maxSteps || 30;
      this.maxBytes = options.maxBytes || 64 * 1024 * 1024;
    }

    this.undoStack = [];
    this.redoStack = [];
    this.currentTx = null;
    this._cleanIndex = 0;
    this.strictMode = false;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  get isDirty() {
    return this.undoStack.length !== this._cleanIndex;
  }

  /**
   * Oznacza bieżący stan jako zapisany (punkt odniesienia dla isDirty).
   */
  markClean() {
    this._cleanIndex = this.undoStack.length;
  }

  /**
   * Pomocnicze wyliczanie sumy bajtów na stosach.
   */
  _calcTotalBytes() {
    let sum = 0;
    for (let i = 0; i < this.undoStack.length; i++) {
      sum += this.undoStack[i].bytes || 0;
    }
    for (let i = 0; i < this.redoStack.length; i++) {
      sum += this.redoStack[i].bytes || 0;
    }
    return sum;
  }

  /**
   * Rozpoczyna transakcję dla operacji o znanym obszarze modyfikacji.
   */
  begin(ctx, bounds = null, beforeData = null) {
    if (this.currentTx) {
      this.abort();
    }

    const canvasW = ctx.canvas.width;
    const canvasH = ctx.canvas.height;
    let clamped = null;

    if (bounds && window.PaintRect) {
      clamped = window.PaintRect.clamp(bounds, canvasW, canvasH);
    } else if (bounds) {
      const x = Math.max(0, Math.floor(bounds.x));
      const y = Math.max(0, Math.floor(bounds.y));
      const w = Math.min(canvasW - x, Math.ceil(bounds.w));
      const h = Math.min(canvasH - y, Math.ceil(bounds.h));
      if (w > 0 && h > 0) clamped = { x, y, w, h };
    }

    let before = beforeData;
    if (!before) {
      if (clamped) {
        before = ctx.getImageData(clamped.x, clamped.y, clamped.w, clamped.h);
      } else {
        before = ctx.getImageData(0, 0, canvasW, canvasH);
      }
    }

    this.currentTx = {
      ctx,
      lazy: false,
      bounds: clamped,
      beforeData: before,
      canvasWidth: canvasW,
      canvasHeight: canvasH
    };
  }

  /**
   * Rozpoczyna transakcję leniwą (lazy) dla ołówka i gumki.
   * Pobiera migawkę kanwy przed rysowaniem, a wycięcie właściwego wycinka
   * następuje dopiero w momencie commit().
   */
  beginLazy(ctx) {
    if (this.currentTx) {
      this.abort();
    }

    const canvasW = ctx.canvas.width;
    const canvasH = ctx.canvas.height;
    const fullSnapshot = ctx.getImageData(0, 0, canvasW, canvasH);

    this.currentTx = {
      ctx,
      lazy: true,
      bounds: null,
      beforeData: fullSnapshot,
      canvasWidth: canvasW,
      canvasHeight: canvasH
    };
  }

  /**
   * Pomocnicze wycięcie podobszaru ImageData z pełnego ImageData.
   */
  _extractSubImageData(full, bounds) {
    const sub = new ImageData(bounds.w, bounds.h);
    const src32 = new Uint32Array(full.data.buffer);
    const dst32 = new Uint32Array(sub.data.buffer);

    for (let r = 0; r < bounds.h; r++) {
      const srcOffset = (bounds.y + r) * full.width + bounds.x;
      const dstOffset = r * bounds.w;
      dst32.set(src32.subarray(srcOffset, srcOffset + bounds.w), dstOffset);
    }
    return sub;
  }

  /**
   * Porównanie dwóch buforów ImageData pod kątem faktycznych zmian pikseli.
   */
  _isEqual(a, b) {
    if (!a || !b) return false;
    if (a.width !== b.width || a.height !== b.height) return false;
    const d1 = new Uint32Array(a.data.buffer);
    const d2 = new Uint32Array(b.data.buffer);
    if (d1.length !== d2.length) return false;
    for (let i = 0; i < d1.length; i++) {
      if (d1[i] !== d2[i]) return false;
    }
    return true;
  }

  /**
   * Zatwierdza transakcję i zapisuje krok historii.
   * Zwraca true jeśli operacja wprowadziła zmiany, false jeśli brak zmian (no-op).
   */
  commit(ctx, boundsOverride = null) {
    if (!this.currentTx) return false;

    const tx = this.currentTx;
    this.currentTx = null;

    const currentW = ctx.canvas.width;
    const currentH = ctx.canvas.height;
    const isResize = (tx.canvasWidth !== currentW || tx.canvasHeight !== currentH);

    let finalBounds = boundsOverride;
    if (!finalBounds && tx.bounds) {
      finalBounds = tx.bounds;
    }

    if (window.PaintRect && finalBounds) {
      finalBounds = window.PaintRect.clamp(finalBounds, currentW, currentH);
    }

    let beforeData = tx.beforeData;
    let afterData = null;

    if (isResize) {
      // Zmiana rozmiaru kanwy — pełny stan przed i po
      afterData = ctx.getImageData(0, 0, currentW, currentH);
    } else if (tx.lazy) {
      if (!finalBounds || finalBounds.w <= 0 || finalBounds.h <= 0) {
        // Gest nie narysował żadnego piksela
        return false;
      }
      beforeData = this._extractSubImageData(tx.beforeData, finalBounds);
      afterData = ctx.getImageData(finalBounds.x, finalBounds.y, finalBounds.w, finalBounds.h);
    } else if (finalBounds) {
      afterData = ctx.getImageData(finalBounds.x, finalBounds.y, finalBounds.w, finalBounds.h);
    } else {
      // Pełna kanwa (np. clearToWhite)
      finalBounds = { x: 0, y: 0, w: currentW, h: currentH };
      afterData = ctx.getImageData(0, 0, currentW, currentH);
    }

    // Weryfikacja czy piksele faktycznie uległy zmianie (brak pustych kroków)
    if (!isResize && this._isEqual(beforeData, afterData)) {
      return false;
    }

    // Obliczenie wagi kroku
    const stepBytes = (beforeData.data.byteLength || 0) + (afterData.data.byteLength || 0);

    const step = {
      isResize,
      bounds: finalBounds,
      before: beforeData,
      after: afterData,
      prevWidth: tx.canvasWidth,
      prevHeight: tx.canvasHeight,
      nextWidth: currentW,
      nextHeight: currentH,
      bytes: stepBytes
    };

    this.undoStack.push(step);
    this.redoStack = []; // Nowa akcja czyści stos redo

    // Pilnowanie limitu kroków oraz limitu pamięci (64 MiB)
    while (this.undoStack.length > this.maxSteps || this._calcTotalBytes() > this.maxBytes) {
      if (this.undoStack.length <= 1) break; // Zostaw przynajmniej 1 krok
      this.undoStack.shift();
      if (this._cleanIndex > 0) this._cleanIndex--;
    }

    this._notify();
    return true;
  }

  /**
   * Anuluje bieżącą transakcję i przywraca stan sprzed jej otwarcia.
   */
  abort() {
    if (!this.currentTx) return;
    const tx = this.currentTx;
    this.currentTx = null;

    if (tx.ctx && tx.beforeData) {
      if (tx.lazy || !tx.bounds) {
        tx.ctx.putImageData(tx.beforeData, 0, 0);
      } else {
        tx.ctx.putImageData(tx.beforeData, tx.bounds.x, tx.bounds.y);
      }
    }
  }

  /**
   * Cofa ostatnią operację.
   */
  undo(ctx) {
    if (!this.canUndo) return false;
    if (this.currentTx) this.abort();

    const step = this.undoStack.pop();

    if (step.isResize) {
      if (window.PaintCanvas && typeof window.PaintCanvas.setDimensions === 'function') {
        window.PaintCanvas.setDimensions(step.prevWidth, step.prevHeight);
      } else {
        ctx.canvas.width = step.prevWidth;
        ctx.canvas.height = step.prevHeight;
      }
      ctx.putImageData(step.before, 0, 0);
    } else {
      ctx.putImageData(step.before, step.bounds.x, step.bounds.y);
    }

    this.redoStack.push(step);
    this._notify();
    return true;
  }

  /**
   * Ponawia cofniętą operację.
   */
  redo(ctx) {
    if (!this.canRedo) return false;
    if (this.currentTx) this.abort();

    const step = this.redoStack.pop();

    if (step.isResize) {
      if (window.PaintCanvas && typeof window.PaintCanvas.setDimensions === 'function') {
        window.PaintCanvas.setDimensions(step.nextWidth, step.nextHeight);
      } else {
        ctx.canvas.width = step.nextWidth;
        ctx.canvas.height = step.nextHeight;
      }
      ctx.putImageData(step.after, 0, 0);
    } else {
      ctx.putImageData(step.after, step.bounds.x, step.bounds.y);
    }

    this.undoStack.push(step);
    this._notify();
    return true;
  }

  /**
   * Resetuje całą historię (np. nowy dokument, wczytanie pliku).
   */
  reset() {
    this.currentTx = null;
    this.undoStack = [];
    this.redoStack = [];
    this._cleanIndex = 0;
    this._notify();
  }

  /**
   * Stara metoda rzucająca błąd, zapobiegająca cichym pomyłkom i regresjom.
   */
  pushState() {
    throw new Error(
      'Metoda pushState() zostala zastapiona transakcyjnym API: begin(), commit() i abort(). ' +
      'Zajrzyj do INTEGRACJA.md, aby zapoznac sie z prawidlowym uzyciem historii v2.'
    );
  }

  /**
   * Zwraca szczegółowe dane diagnostyczne o zużyciu pamięci.
   */
  describe() {
    const totalBytes = this._calcTotalBytes();
    return {
      kroki: this.undoStack.length,
      krokiRedo: this.redoStack.length,
      pamiecBajtow: totalBytes,
      pamiecMiB: +(totalBytes / (1024 * 1024)).toFixed(3),
      limitKrokow: this.maxSteps,
      limitMiB: +(this.maxBytes / (1024 * 1024)).toFixed(1),
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      isDirty: this.isDirty
    };
  }

  _notify() {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(
        new CustomEvent('paint:historychange', {
          detail: {
            canUndo: this.canUndo,
            canRedo: this.canRedo,
            isDirty: this.isDirty
          }
        })
      );
    }
  }
};

/**
 * js/tools.js
 * Implementacja narzędzi edytora graficznego — pełna lista:
 * - Ołówek (rysowanie odręczne, grubość 1–50 px)
 * - Gumka (zmazywanie do koloru tła, 4–100 px)
 * - Linia (podgląd na żywo, Shift = kąty co 45°)
 * - Prostokąt (podgląd na żywo, obrys/wypełnienie/oba, Shift = kwadrat)
 * - Elipsa/Okrąg (podgląd na żywo, obrys/wypełnienie/oba, Shift = okrąg)
 * - Wiadro (wypełnienie obszaru przez PaintFloodFill)
 *
 * ZAKRES: powyższe sześć narzędzi. Pipeta, tekst i lasso NIE są zaimplementowane.
 */

window.PaintTools = {
  isDrawing: false,
  startX: 0,
  startY: 0,

  /**
   * Pomocnicza konfiguracja stylu linii na wskazanym kontekście 2D.
   */
  applyStrokeStyle(ctx, color, width, dash = 'solid') {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (dash === 'dashed') {
      ctx.setLineDash([width * 3, width * 2]);
    } else if (dash === 'dotted') {
      ctx.setLineDash([width * 0.5, width * 1.5]);
    } else {
      ctx.setLineDash([]);
    }
  },

  currentButton: 0,

  /**
   * Zdarzenie naciśnięcia przycisku myszy / wskaźnika.
   */
  onPointerDown(e, coords) {
    if (e.button !== 0 && e.button !== 2) return; // Obsługa lewego (0) i prawego (2) przycisku myszy
    this.currentButton = e.button;
    this.isDrawing = true;
    this.startX = coords.x;
    this.startY = coords.y;

    const tool = window.PaintState.currentTool;
    const { mainCtx } = window.PaintCanvas;

    // LPM = kolor obrysu, PPM = kolor wypełnienia
    const activeColor = (e.button === 2)
      ? window.PaintState.fillColor
      : window.PaintState.strokeColor;

    if (tool === 'pencil') {
      mainCtx.beginPath();
      this.applyStrokeStyle(
        mainCtx,
        activeColor,
        window.PaintState.lineWidth,
        'solid'
      );
      mainCtx.moveTo(coords.x, coords.y);
      mainCtx.lineTo(coords.x, coords.y); // Kropka w miejscu kliknięcia
      mainCtx.stroke();
    } else if (tool === 'eraser') {
      mainCtx.beginPath();
      this.applyStrokeStyle(
        mainCtx,
        '#ffffff', // Gumka maże kolorem białego tła
        window.PaintState.eraserSize,
        'solid'
      );
      mainCtx.moveTo(coords.x, coords.y);
      mainCtx.lineTo(coords.x, coords.y);
      mainCtx.stroke();
    } else if (tool === 'bucket') {
      // Wiadro: LPM = kolor wypełnienia, PPM = kolor obrysu
      const fillCol = (e.button === 2)
        ? window.PaintState.strokeColor
        : window.PaintState.fillColor;

      window.PaintFloodFill.fill(
        mainCtx,
        coords.x,
        coords.y,
        fillCol,
        window.PaintState.tolerance
      );
      window.PaintCanvas.history.pushState(mainCtx);
      this.isDrawing = false;
    }
  },

  /**
   * Zdarzenie ruchu myszy ze wciśniętym przyciskiem.
   */
  onPointerMove(e, coords) {
    if (!this.isDrawing) return;

    const tool = window.PaintState.currentTool;
    const { mainCtx, overlayCtx } = window.PaintCanvas;

    if (tool === 'pencil') {
      mainCtx.lineTo(coords.x, coords.y);
      mainCtx.stroke();
    } else if (tool === 'eraser') {
      mainCtx.lineTo(coords.x, coords.y);
      mainCtx.stroke();
    } else if (tool === 'line') {
      // Podgląd linii na overlay canvas
      window.PaintCanvas.clearOverlay();
      this.drawLine(overlayCtx, this.startX, this.startY, coords.x, coords.y, e.shiftKey, this.currentButton === 2);
    } else if (tool === 'rect') {
      // Podgląd prostokąta na overlay canvas
      window.PaintCanvas.clearOverlay();
      this.drawRect(overlayCtx, this.startX, this.startY, coords.x, coords.y, e.shiftKey, this.currentButton === 2);
    } else if (tool === 'ellipse') {
      // Podgląd elipsy na overlay canvas
      window.PaintCanvas.clearOverlay();
      this.drawEllipse(overlayCtx, this.startX, this.startY, coords.x, coords.y, e.shiftKey, this.currentButton === 2);
    }
  },

  /**
   * Zdarzenie puszczenia przycisku myszy – utrwalenie kształtu na głównym płótnie.
   */
  onPointerUp(e, coords) {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    const tool = window.PaintState.currentTool;
    const { mainCtx } = window.PaintCanvas;
    const isAlt = this.currentButton === 2;

    if (tool === 'pencil' || tool === 'eraser') {
      window.PaintCanvas.history.pushState(mainCtx);
    } else if (tool === 'line') {
      window.PaintCanvas.clearOverlay();
      this.drawLine(mainCtx, this.startX, this.startY, coords.x, coords.y, e.shiftKey, isAlt);
      window.PaintCanvas.history.pushState(mainCtx);
    } else if (tool === 'rect') {
      window.PaintCanvas.clearOverlay();
      const hasSize = Math.abs(coords.x - this.startX) > 0 || Math.abs(coords.y - this.startY) > 0;
      if (hasSize) {
        this.drawRect(mainCtx, this.startX, this.startY, coords.x, coords.y, e.shiftKey, isAlt);
        window.PaintCanvas.history.pushState(mainCtx);
      }
    } else if (tool === 'ellipse') {
      window.PaintCanvas.clearOverlay();
      const hasSize = Math.abs(coords.x - this.startX) > 0 || Math.abs(coords.y - this.startY) > 0;
      if (hasSize) {
        this.drawEllipse(mainCtx, this.startX, this.startY, coords.x, coords.y, e.shiftKey, isAlt);
        window.PaintCanvas.history.pushState(mainCtx);
      }
    }
  },

  // ────────────────── GEOMETRIA KSZTAŁTÓW ──────────────────

  /**
   * Rysuje linię z opcją przyciągania do kątów 0, 45, 90 stopni (Shift).
   */
  drawLine(ctx, x1, y1, x2, y2, shift, isAlt = false) {
    let targetX = x2;
    let targetY = y2;

    if (shift) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const angle = Math.atan2(dy, dx);
      const step = Math.PI / 4; // Kąty co 45 stopni
      const snappedAngle = Math.round(angle / step) * step;
      const length = Math.hypot(dx, dy);

      targetX = x1 + Math.cos(snappedAngle) * length;
      targetY = y1 + Math.sin(snappedAngle) * length;
    }

    const strokeCol = isAlt ? window.PaintState.fillColor : window.PaintState.strokeColor;

    ctx.save();
    this.applyStrokeStyle(
      ctx,
      strokeCol,
      window.PaintState.lineWidth,
      window.PaintState.lineDash
    );

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();
    ctx.restore();
  },

  /**
   * Rysuje prostokąt (lub kwadrat, gdy Shift).
   */
  drawRect(ctx, x1, y1, x2, y2, shift, isAlt = false) {
    let w = x2 - x1;
    let h = y2 - y1;

    if (shift) {
      const side = Math.max(Math.abs(w), Math.abs(h));
      w = w < 0 ? -side : side;
      h = h < 0 ? -side : side;
    }

    const rx = w < 0 ? x1 + w : x1;
    const ry = h < 0 ? y1 + h : y1;
    const rw = Math.abs(w);
    const rh = Math.abs(h);

    if (rw === 0 && rh === 0) return;

    const fillCol = isAlt ? window.PaintState.strokeColor : window.PaintState.fillColor;
    const strokeCol = isAlt ? window.PaintState.fillColor : window.PaintState.strokeColor;

    ctx.save();
    const mode = window.PaintState.fillMode;

    if (mode === 'fill' || mode === 'both') {
      ctx.fillStyle = fillCol;
      ctx.fillRect(rx, ry, rw, rh);
    }

    if (mode === 'stroke' || mode === 'both') {
      this.applyStrokeStyle(
        ctx,
        strokeCol,
        window.PaintState.lineWidth,
        window.PaintState.lineDash
      );
      ctx.strokeRect(rx, ry, rw, rh);
    }

    ctx.restore();
  },

  /**
   * Rysuje elipsę (lub okrąg, gdy Shift).
   */
  drawEllipse(ctx, x1, y1, x2, y2, shift, isAlt = false) {
    let rx = Math.abs(x2 - x1) / 2;
    let ry = Math.abs(y2 - y1) / 2;

    if (shift) {
      const r = Math.max(rx, ry);
      rx = r;
      ry = r;
    }

    if (rx <= 0 || ry <= 0) return;

    const cx = Math.min(x1, x2) + rx;
    const cy = Math.min(y1, y2) + ry;

    const fillCol = isAlt ? window.PaintState.strokeColor : window.PaintState.fillColor;
    const strokeCol = isAlt ? window.PaintState.fillColor : window.PaintState.strokeColor;

    ctx.save();
    const mode = window.PaintState.fillMode;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);

    if (mode === 'fill' || mode === 'both') {
      ctx.fillStyle = fillCol;
      ctx.fill();
    }

    if (mode === 'stroke' || mode === 'both') {
      this.applyStrokeStyle(
        ctx,
        strokeCol,
        window.PaintState.lineWidth,
        window.PaintState.lineDash
      );
      ctx.stroke();
    }

    ctx.restore();
  }
};

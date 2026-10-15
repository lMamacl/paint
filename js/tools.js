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
 *
 * Wszystkie gesty narzędzi są opakowane w transakcje historii przyrostowej (begin / commit / abort),
 * a ich obszary brudne (Dirty Rect) są precyzyjnie śledzone za pomocą modułu PaintRect.
 */

window.PaintTools = {
  isDrawing: false,
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  currentButton: 0,
  tracker: null,

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

  /**
   * Zwraca bezpieczny margines (padding) na antyaliasing i zaokrąglenia linii.
   */
  _getBrushPad(tool) {
    const baseWidth = (tool === 'eraser')
      ? (window.PaintState.eraserSize || 20)
      : (window.PaintState.lineWidth || 4);
    return Math.ceil(baseWidth / 2) + 4;
  },

  /**
   * Zdarzenie naciśnięcia przycisku myszy / wskaźnika.
   */
  onPointerDown(e, coords) {
    if (e.button !== 0 && e.button !== 2) return; // LPM (0) lub PPM (2)
    this.currentButton = e.button;
    this.isDrawing = true;
    this.startX = coords.x;
    this.startY = coords.y;
    this.lastX = coords.x;
    this.lastY = coords.y;

    const tool = window.PaintState.currentTool;
    const { mainCtx, history } = window.PaintCanvas;

    // LPM = kolor obrysu, PPM = kolor wypełnienia
    const activeColor = (e.button === 2)
      ? window.PaintState.fillColor
      : window.PaintState.strokeColor;

    if (tool === 'pencil') {
      this.tracker = window.PaintRect.track.create();
      const pad = this._getBrushPad('pencil');
      window.PaintRect.track.addPoint(this.tracker, coords.x, coords.y, pad);

      history.beginLazy(mainCtx);

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
      this.tracker = window.PaintRect.track.create();
      const pad = this._getBrushPad('eraser');
      window.PaintRect.track.addPoint(this.tracker, coords.x, coords.y, pad);

      history.beginLazy(mainCtx);

      mainCtx.beginPath();
      this.applyStrokeStyle(
        mainCtx,
        '#ffffff', // Gumka maże kolorem białego tła dokumentu
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

      const res = window.PaintFloodFill.compute(
        mainCtx,
        coords.x,
        coords.y,
        fillCol,
        window.PaintState.tolerance
      );

      if (res) {
        history.begin(mainCtx, res.bounds, res.before);
        mainCtx.putImageData(res.after, res.bounds.x, res.bounds.y);
        history.commit(mainCtx);
      }

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

    if (tool === 'pencil' || tool === 'eraser') {
      const pad = this._getBrushPad(tool);
      window.PaintRect.track.addSegment(this.tracker, this.lastX, this.lastY, coords.x, coords.y, pad);
      this.lastX = coords.x;
      this.lastY = coords.y;

      mainCtx.lineTo(coords.x, coords.y);
      mainCtx.stroke();
    } else if (tool === 'line') {
      window.PaintCanvas.clearOverlay();
      this.drawLine(overlayCtx, this.startX, this.startY, coords.x, coords.y, e.shiftKey, this.currentButton === 2);
    } else if (tool === 'rect') {
      window.PaintCanvas.clearOverlay();
      this.drawRect(overlayCtx, this.startX, this.startY, coords.x, coords.y, e.shiftKey, this.currentButton === 2);
    } else if (tool === 'ellipse') {
      window.PaintCanvas.clearOverlay();
      this.drawEllipse(overlayCtx, this.startX, this.startY, coords.x, coords.y, e.shiftKey, this.currentButton === 2);
    }
  },

  /**
   * Zdarzenie puszczenia przycisku myszy – utrwalenie kształtu na głównym płótnie
   * oraz zatwierdzenie transakcji historii przyrostowej.
   */
  onPointerUp(e, coords) {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    const tool = window.PaintState.currentTool;
    const { mainCtx, history } = window.PaintCanvas;
    const isAlt = this.currentButton === 2;

    if (tool === 'pencil' || tool === 'eraser') {
      const pad = this._getBrushPad(tool);
      if (this.tracker) {
        window.PaintRect.track.addPoint(this.tracker, coords.x, coords.y, pad);
        const bounds = window.PaintRect.track.bounds(this.tracker);
        history.commit(mainCtx, bounds);
        this.tracker = null;
      }
    } else if (tool === 'line') {
      window.PaintCanvas.clearOverlay();
      const end = this.getLineEndpoints(this.startX, this.startY, coords.x, coords.y, e.shiftKey);
      const pad = Math.ceil((window.PaintState.lineWidth || 4) / 2) + 4;
      const bounds = window.PaintRect.fromPoints(this.startX, this.startY, end.x, end.y, pad);

      history.begin(mainCtx, bounds);
      this.drawLine(mainCtx, this.startX, this.startY, coords.x, coords.y, e.shiftKey, isAlt);
      history.commit(mainCtx);
    } else if (tool === 'rect') {
      window.PaintCanvas.clearOverlay();
      const r = this.getRectBounds(this.startX, this.startY, coords.x, coords.y, e.shiftKey);
      if (r.w > 0 || r.h > 0) {
        const pad = Math.ceil((window.PaintState.lineWidth || 4) / 2) + 4;
        const bounds = window.PaintRect.pad(r, pad);

        history.begin(mainCtx, bounds);
        this.drawRect(mainCtx, this.startX, this.startY, coords.x, coords.y, e.shiftKey, isAlt);
        history.commit(mainCtx);
      }
    } else if (tool === 'ellipse') {
      window.PaintCanvas.clearOverlay();
      const el = this.getEllipseBounds(this.startX, this.startY, coords.x, coords.y, e.shiftKey);
      if (el.rx > 0 && el.ry > 0) {
        const pad = Math.ceil((window.PaintState.lineWidth || 4) / 2) + 4;
        const bounds = {
          x: el.cx - el.rx - pad,
          y: el.cy - el.ry - pad,
          w: (el.rx + pad) * 2,
          h: (el.ry + pad) * 2
        };

        history.begin(mainCtx, bounds);
        this.drawEllipse(mainCtx, this.startX, this.startY, coords.x, coords.y, e.shiftKey, isAlt);
        history.commit(mainCtx);
      }
    }
  },

  /**
   * Przerywa bieżący gest (klawisz Escape).
   * Wycofuje rozpoczęty ślad ołówka/gumki i czyści nakładkę podglądu.
   */
  cancelGesture() {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    window.PaintCanvas.clearOverlay();

    if (this.tracker) {
      window.PaintCanvas.history.abort();
      this.tracker = null;
    }
  },

  // ────────────────── GEOMETRIA KSZTAŁTÓW ──────────────────

  getLineEndpoints(x1, y1, x2, y2, shift) {
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

    return { x: targetX, y: targetY };
  },

  /**
   * Rysuje linię z opcją przyciągania do kątów 0, 45, 90 stopni (Shift).
   */
  drawLine(ctx, x1, y1, x2, y2, shift, isAlt = false) {
    const end = this.getLineEndpoints(x1, y1, x2, y2, shift);
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
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  },

  getRectBounds(x1, y1, x2, y2, shift) {
    let w = x2 - x1;
    let h = y2 - y1;

    if (shift) {
      const side = Math.max(Math.abs(w), Math.abs(h));
      w = w < 0 ? -side : side;
      h = h < 0 ? -side : side;
    }

    const rx = w < 0 ? x1 + w : x1;
    const ry = h < 0 ? y1 + h : y1;
    return { x: rx, y: ry, w: Math.abs(w), h: Math.abs(h) };
  },

  /**
   * Rysuje prostokąt (lub kwadrat, gdy Shift).
   */
  drawRect(ctx, x1, y1, x2, y2, shift, isAlt = false) {
    const r = this.getRectBounds(x1, y1, x2, y2, shift);
    if (r.w === 0 && r.h === 0) return;

    const fillCol = isAlt ? window.PaintState.strokeColor : window.PaintState.fillColor;
    const strokeCol = isAlt ? window.PaintState.fillColor : window.PaintState.strokeColor;

    ctx.save();
    const mode = window.PaintState.fillMode;

    if (mode === 'fill' || mode === 'both') {
      ctx.fillStyle = fillCol;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }

    if (mode === 'stroke' || mode === 'both') {
      this.applyStrokeStyle(
        ctx,
        strokeCol,
        window.PaintState.lineWidth,
        window.PaintState.lineDash
      );
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }

    ctx.restore();
  },

  getEllipseBounds(x1, y1, x2, y2, shift) {
    let rx = Math.abs(x2 - x1) / 2;
    let ry = Math.abs(y2 - y1) / 2;

    if (shift) {
      const r = Math.max(rx, ry);
      rx = r;
      ry = r;
    }

    const cx = Math.min(x1, x2) + rx;
    const cy = Math.min(y1, y2) + ry;
    return { cx, cy, rx, ry };
  },

  /**
   * Rysuje elipsę (lub okrąg, gdy Shift).
   */
  drawEllipse(ctx, x1, y1, x2, y2, shift, isAlt = false) {
    const el = this.getEllipseBounds(x1, y1, x2, y2, shift);
    if (el.rx <= 0 || el.ry <= 0) return;

    const fillCol = isAlt ? window.PaintState.strokeColor : window.PaintState.fillColor;
    const strokeCol = isAlt ? window.PaintState.fillColor : window.PaintState.strokeColor;

    ctx.save();
    const mode = window.PaintState.fillMode;

    ctx.beginPath();
    ctx.ellipse(el.cx, el.cy, el.rx, el.ry, 0, 0, Math.PI * 2);

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

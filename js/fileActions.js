/**
 * js/fileActions.js
 * Obsługa operacji wejścia/wyjścia (I/O):
 * - Nowy dokument
 * - Wczytywanie pliku obrazu z dysku (z dopasowaniem wymiarów i zoomu)
 * - Ujednolicony modal zapisu obrazu (PNG / JPG)
 * - Wybór przezroczystego tła dla PNG oraz regulacja jakości kompresji dla JPG
 */

window.PaintFiles = {
  /**
   * Tworzy nowy, czysty dokument (1024 × 640 px z białym tłem).
   */
  newDocument() {
    if (window.PaintCanvas.history && window.PaintCanvas.history.canUndo) {
      if (!confirm('Utworzenie nowego dokumentu spowoduje utratę niezapisanego rysunku. Kontynuować?')) {
        return;
      }
    }
    window.PaintCanvas.setDimensions(1024, 640);
    window.PaintCanvas.clearToWhite(false);
    window.PaintCanvas.history.reset(window.PaintCanvas.mainCtx);
    window.PaintCanvas.fitToScreen();
  },

  /**
   * Otwiera okno dialogowe wyboru pliku i wczytuje obraz na kanwę.
   */
  openImageFile() {
    if (window.PaintCanvas.history && window.PaintCanvas.history.canUndo) {
      if (!confirm('Wczytanie nowego obrazu zastąpi obecny rysunek. Kontynuować?')) {
        return;
      }
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png, image/jpeg, image/webp, image/bmp';

    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      this.loadImageFromFile(file);
    };

    input.click();
  },

  /**
   * Wczytuje obiekt File lub Blob na płótno.
   */
  loadImageFromFile(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Dopasuj fizyczne wymiary kanwy do otwartego obrazu
        window.PaintCanvas.setDimensions(img.naturalWidth, img.naturalHeight);

        // Narysuj wczytany obraz na głównym płótnie
        const { mainCtx } = window.PaintCanvas;
        mainCtx.fillStyle = '#ffffff';
        mainCtx.fillRect(0, 0, img.naturalWidth, img.naturalHeight);
        mainCtx.drawImage(img, 0, 0);

        // Zresetuj historię, ustawiając wczytany obraz jako stan bazowy
        window.PaintCanvas.history.reset(mainCtx);

        // Dopasuj zoom do ekranu
        window.PaintCanvas.fitToScreen();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  },

  /**
   * Otwiera zintegrowany modal zapisu obrazu.
   */
  openSaveModal() {
    const modal = document.getElementById('save-modal');
    if (modal) {
      modal.classList.add('open');
      const filenameInput = document.getElementById('save-filename');
      if (filenameInput) {
        filenameInput.focus();
        filenameInput.select();
      }
    }
  },

  /**
   * Zamyka modal zapisu obrazu.
   */
  closeSaveModal() {
    const modal = document.getElementById('save-modal');
    if (modal) {
      modal.classList.remove('open');
    }
  },

  /**
   * Zapisuje obraz z ustawieniami wybranymi w modalu.
   */
  saveFromModal() {
    const format = document.querySelector('.btn-save-format.active')?.dataset.format || 'png';
    const rawName = document.getElementById('save-filename')?.value.trim() || 'rysunek';
    const cleanName = rawName.replace(/[\/\?<>\\:\*\|":]/g, '');

    const transparent = document.getElementById('save-opt-transparent')?.checked ?? false;
    const qualityPercent = parseInt(document.getElementById('save-quality-slider')?.value || '90', 10);
    const quality = Math.max(0.1, Math.min(1.0, qualityPercent / 100));

    if (format === 'png') {
      this.exportPNG(cleanName, transparent);
    } else {
      this.exportJPG(cleanName, quality);
    }

    this.closeSaveModal();
  },

  /**
   * Eksportuje rysunek do formatu PNG.
   * Jeśli transparent === true, czysto białe piksele tła (RGB 255, 255, 255) stają się przezroczyste (Alfa 0).
   */
  exportPNG(filename = 'rysunek', transparent = false) {
    const mainCanvas = window.PaintCanvas.mainCanvas;
    let exportCanvas = mainCanvas;

    if (transparent) {
      // Kopia płótna do operacji na kanale alfa
      exportCanvas = document.createElement('canvas');
      exportCanvas.width = mainCanvas.width;
      exportCanvas.height = mainCanvas.height;
      const ctx = exportCanvas.getContext('2d');
      ctx.drawImage(mainCanvas, 0, 0);

      const imgData = ctx.getImageData(0, 0, exportCanvas.width, exportCanvas.height);
      const data = imgData.data;

      // Zastąp czysto białe piksele (#ffffff) pełną przezroczystością
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255) {
          data[i + 3] = 0; // Kanał Alfa = 0 (przezroczysty)
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    exportCanvas.toBlob((blob) => {
      if (blob) this.downloadBlob(blob, `${filename}.png`);
    }, 'image/png');
  },

  /**
   * Eksportuje rysunek do formatu JPG z regulacją jakości (stratna kompresja).
   */
  exportJPG(filename = 'rysunek', quality = 0.90) {
    const mainCanvas = window.PaintCanvas.mainCanvas;
    // Gwarancja czysto białego podkładu dla formatu JPG (brak kanału alfa)
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = mainCanvas.width;
    exportCanvas.height = mainCanvas.height;
    const ctx = exportCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    ctx.drawImage(mainCanvas, 0, 0);

    exportCanvas.toBlob((blob) => {
      if (blob) this.downloadBlob(blob, `${filename}.jpg`);
    }, 'image/jpeg', quality);
  },

  /**
   * Pomocnicze pobieranie bloba przez przeglądarkę.
   */
  downloadBlob(blob, fullName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fullName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
};

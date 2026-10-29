/**
 * tests/ppm.test.js
 * Zautomatyzowany zestaw testów modułu window.PaintPPM (Node.js test runner).
 * Uruchamianie: node --test tests/ppm.test.js
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Polyfill minimalnego środowiska przeglądarki dla Node.js
if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  };
}

// Załadowanie modułu PPM
const PaintPPM = require('../js/ppm.js');

function createBuffer(str) {
  return new TextEncoder().encode(str).buffer;
}

test('P3: Poprawne parsowanie obrazu ASCII 2x2 z komentarzami i CRLF', () => {
  const ppmText = 
    "P3\r\n" +
    "# Komentarz w naglowku\r\n" +
    "2 2\r\n" +
    "# Kolejny komentarz\r\n" +
    "255\r\n" +
    "255 0 0    0 255 0\r\n" +
    "0 0 255    255 255 255\r\n";

  const result = PaintPPM.parse(createBuffer(ppmText));
  assert.strictEqual(result.type, 'P3');
  assert.strictEqual(result.width, 2);
  assert.strictEqual(result.height, 2);
  assert.strictEqual(result.maxVal, 255);
  assert.strictEqual(result.comments.length, 2);
  assert.strictEqual(result.comments[0], 'Komentarz w naglowku');

  // Piksel (0,0): Czerwony
  assert.strictEqual(result.imageData.data[0], 255);
  assert.strictEqual(result.imageData.data[1], 0);
  assert.strictEqual(result.imageData.data[2], 0);
  assert.strictEqual(result.imageData.data[3], 255);

  // Piksel (1,0): Zielony
  assert.strictEqual(result.imageData.data[4], 0);
  assert.strictEqual(result.imageData.data[5], 255);
  assert.strictEqual(result.imageData.data[6], 0);

  // Piksel (0,1): Niebieski
  assert.strictEqual(result.imageData.data[8], 0);
  assert.strictEqual(result.imageData.data[9], 0);
  assert.strictEqual(result.imageData.data[10], 255);

  // Piksel (1,1): Biały
  assert.strictEqual(result.imageData.data[12], 255);
  assert.strictEqual(result.imageData.data[13], 255);
  assert.strictEqual(result.imageData.data[14], 255);
});

test('P6: Poprawne parsowanie obrazu binarnego 2x1', () => {
  const header = "P6\n2 1\n255\n";
  const headerBytes = new TextEncoder().encode(header);
  const rasterBytes = new Uint8Array([
    255, 128, 0,   // Piksel 1
    0, 64, 128     // Piksel 2
  ]);
  const combined = new Uint8Array(headerBytes.length + rasterBytes.length);
  combined.set(headerBytes, 0);
  combined.set(rasterBytes, headerBytes.length);

  const result = PaintPPM.parse(combined.buffer);
  assert.strictEqual(result.type, 'P6');
  assert.strictEqual(result.width, 2);
  assert.strictEqual(result.height, 1);
  assert.strictEqual(result.maxVal, 255);

  assert.strictEqual(result.imageData.data[0], 255);
  assert.strictEqual(result.imageData.data[1], 128);
  assert.strictEqual(result.imageData.data[2], 0);

  assert.strictEqual(result.imageData.data[4], 0);
  assert.strictEqual(result.imageData.data[5], 64);
  assert.strictEqual(result.imageData.data[6], 128);
});

test('P6 [Uwaga 2]: Separator spacja oraz dane rastrowe zaczynające się od spacji (32), tab (9) lub # (35)', () => {
  // Test kluczowy: separatorem po 255 jest spacja (32), a pierwszy bajt piksela to także spacja (32)!
  // Stary parser połykał dane rastrowe, traktując je jako ciąg spacji po maxVal.
  const header = "P6 1 1 255 "; // separator: pojedyncza spacja
  const headerBytes = new TextEncoder().encode(header);
  const rasterBytes = new Uint8Array([32, 9, 35]); // R=32, G=9, B=35
  const combined = new Uint8Array(headerBytes.length + rasterBytes.length);
  combined.set(headerBytes, 0);
  combined.set(rasterBytes, headerBytes.length);

  const result = PaintPPM.parse(combined.buffer);
  assert.strictEqual(result.width, 1);
  assert.strictEqual(result.height, 1);
  assert.strictEqual(result.imageData.data[0], 32, 'R channel nie powinien zostać zjedzony!');
  assert.strictEqual(result.imageData.data[1], 9, 'G channel nie powinien zostać zjedzony!');
  assert.strictEqual(result.imageData.data[2], 35, 'B channel nie powinien zostać pominięty jako komentarz!');
});

test('P6 [Uwaga 2]: Komentarz inline w linii maxVal kończący się separatorem', () => {
  const header = "P6\n1 1\n255 # komentarz inline po maxVal\n";
  const headerBytes = new TextEncoder().encode(header);
  const rasterBytes = new Uint8Array([100, 150, 200]);
  const combined = new Uint8Array(headerBytes.length + rasterBytes.length);
  combined.set(headerBytes, 0);
  combined.set(rasterBytes, headerBytes.length);

  const result = PaintPPM.parse(combined.buffer);
  assert.strictEqual(result.comments.length, 1);
  assert.strictEqual(result.comments[0], 'komentarz inline po maxVal');
  assert.strictEqual(result.imageData.data[0], 100);
  assert.strictEqual(result.imageData.data[1], 150);
  assert.strictEqual(result.imageData.data[2], 200);
});

test('Małe obrazy [Uwaga 1]: Poprawne wymiary 3x2 i 1x1', () => {
  const ppm3x2 = 
    "P3\n3 2\n255\n" +
    "10 20 30  40 50 60  70 80 90\n" +
    "15 25 35  45 55 65  75 85 95\n";

  const result = PaintPPM.parse(createBuffer(ppm3x2));
  assert.strictEqual(result.width, 3);
  assert.strictEqual(result.height, 2);
  assert.strictEqual(result.imageData.width, 3);
  assert.strictEqual(result.imageData.height, 2);
});

test('Skalowanie maxVal: maxVal = 15 skalowane proporcjonalnie do 255', () => {
  const ppm = "P3 1 1 15 15 0 7";
  const result = PaintPPM.parse(createBuffer(ppm));
  assert.strictEqual(result.imageData.data[0], 255); // 15 -> 255
  assert.strictEqual(result.imageData.data[1], 0);   // 0 -> 0
  assert.strictEqual(result.imageData.data[2], 119); // 7/15 * 255 = 119
});

test('16-bit P6: próbki Big-Endian skalowane do 8-bit', () => {
  const header = "P6\n1 1\n1000\n";
  const headerBytes = new TextEncoder().encode(header);
  // Big-Endian: 1000 to (3 << 8) | 232 = 0x03E8
  const r16 = 1000;
  const g16 = 500;
  const b16 = 0;
  const rasterBytes = new Uint8Array([
    (r16 >> 8) & 0xff, r16 & 0xff,
    (g16 >> 8) & 0xff, g16 & 0xff,
    (b16 >> 8) & 0xff, b16 & 0xff
  ]);
  const combined = new Uint8Array(headerBytes.length + rasterBytes.length);
  combined.set(headerBytes, 0);
  combined.set(rasterBytes, headerBytes.length);

  const result = PaintPPM.parse(combined.buffer);
  assert.strictEqual(result.imageData.data[0], 255); // 1000/1000 * 255 = 255
  assert.strictEqual(result.imageData.data[1], 128); // 500/1000 * 255 = 127.5 -> 128
  assert.strictEqual(result.imageData.data[2], 0);
});

test('Walidacja [Uwaga 7]: Wartości próbek większe niż maxVal rzucają błąd PPMError', () => {
  // P3: próbka 260 przy maxVal = 255
  const invalidP3 = "P3 1 1 255 260 0 0";
  assert.throws(() => {
    PaintPPM.parse(createBuffer(invalidP3));
  }, /przekracza zadeklarowane maxVal/);

  // P6: próbka 20 przy maxVal = 10
  const header = "P6\n1 1\n10\n";
  const headerBytes = new TextEncoder().encode(header);
  const rasterBytes = new Uint8Array([20, 5, 0]);
  const combined = new Uint8Array(headerBytes.length + rasterBytes.length);
  combined.set(headerBytes, 0);
  combined.set(rasterBytes, headerBytes.length);

  assert.throws(() => {
    PaintPPM.parse(combined.buffer);
  }, /przekracza zadeklarowane maxVal/);
});

test('Walidacja [Uwaga 11]: Plik P7\\n (3 bajty) zgłasza niepoprawną sygnaturę zamiast pustego pliku', () => {
  assert.throws(() => {
    PaintPPM.parse(createBuffer("P7\n"));
  }, /Nieprawidłowa sygnatura formatu: "P7"/);
});

test('Walidacja: Nieobsługiwane formaty P1 (PBM) i P2 (PGM) zgłaszają dedykowany komunikat', () => {
  assert.throws(() => {
    PaintPPM.parse(createBuffer("P1 1 1 1"));
  }, /Nieobsługiwany format: P1/);

  assert.throws(() => {
    PaintPPM.parse(createBuffer("P2 1 1 255 100"));
  }, /Nieobsługiwany format: P2/);
});

test('Walidacja: Ucięty plik P6 zgłasza błąd ucięcia danych', () => {
  const header = "P6\n10 10\n255\n"; // oczekiwano 300 bajtów
  const headerBytes = new TextEncoder().encode(header);
  const rasterBytes = new Uint8Array([1, 2, 3]); // tylko 3 bajty
  const combined = new Uint8Array(headerBytes.length + rasterBytes.length);
  combined.set(headerBytes, 0);
  combined.set(rasterBytes, headerBytes.length);

  assert.throws(() => {
    PaintPPM.parse(combined.buffer);
  }, /Plik P6 jest uszkodzony lub ucięty/);
});

test('Zapis i odczyt (Roundtrip) [Uwaga 13]: encodeP6 i encodeP3 z własnym komentarzem', async () => {
  const imgData = new ImageData(2, 2);
  imgData.data.set([
    255, 0, 0, 255,    0, 255, 0, 255,
    0, 0, 255, 255,    128, 128, 128, 255
  ]);

  const customComment = "Testowy komentarz projektu";

  // Test P6 roundtrip
  const blobP6 = PaintPPM.encodeP6(imgData, { comment: customComment });
  const bufP6 = await blobP6.arrayBuffer();
  const parsedP6 = PaintPPM.parse(bufP6);

  assert.strictEqual(parsedP6.width, 2);
  assert.strictEqual(parsedP6.height, 2);
  assert.strictEqual(parsedP6.comments.length, 1);
  assert.strictEqual(parsedP6.comments[0], customComment);
  assert.strictEqual(parsedP6.imageData.data[0], 255);
  assert.strictEqual(parsedP6.imageData.data[4 + 1], 255);
  assert.strictEqual(parsedP6.imageData.data[8 + 2], 255);

  // Test P3 roundtrip
  const blobP3 = PaintPPM.encodeP3(imgData, { comment: customComment });
  const bufP3 = await blobP3.arrayBuffer();
  const parsedP3 = PaintPPM.parse(bufP3);

  assert.strictEqual(parsedP3.width, 2);
  assert.strictEqual(parsedP3.height, 2);
  assert.strictEqual(parsedP3.comments.length, 1);
  assert.strictEqual(parsedP3.comments[0], customComment);
  assert.strictEqual(parsedP3.imageData.data[0], 255);
  assert.strictEqual(parsedP3.imageData.data[4 + 1], 255);
  assert.strictEqual(parsedP3.imageData.data[8 + 2], 255);
});

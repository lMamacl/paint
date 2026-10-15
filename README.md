# Grafika Komputerowa — Paint

Modularny edytor grafiki rastrowej 2D zrealizowany w czystym języku JavaScript (Vanilla JS) z wykorzystaniem technologii HTML5 Canvas, bez zewnętrznych zależności i bibliotek.

## Architektura i uruchamianie

Projekt działa natywnie w dowolnej nowoczesnej przeglądarce internetowej. Nie wymaga serwera deweloperskiego ani bundlera — uruchamia się bezpośrednio z dysku (`file://`).

- **Podwójny bufor (Dual Canvas):**
  - Warstwa główna (`mainCanvas`): trwały stan pikseli dokumentu.
  - Warstwa pomocnicza (`overlayCanvas`): podgląd kształtów na żywo w trakcie przeciągania myszą (bez zanieczyszczania płótna głównego).
- **Zarządzanie stanem i modułami:**
  - Podział na wyspecjalizowane, bezstanowe lub hermetyczne moduły rejestrowane w przestrzeni `window.Paint*`.
  - Kolejność skryptów w `index.html` odzwierciedla graf zależności.

## Zakres funkcjonalny (stan obecny)

- **Narzędzia rysunkowe:**
  - Ołówek (rysowanie odręczne ze śledzeniem gestu, grubość 1–50 px).
  - Gumka (przywracanie do koloru tła, rozmiar 4–100 px).
  - Linia (podgląd na żywo, przytrzymanie Shift wymusza kąty co 45°).
  - Prostokąt (podgląd na żywo, tryby: tylko obrys, tylko wypełnienie, obrys + wypełnienie; Shift wymusza kwadrat).
  - Elipsa / Okrąg (podgląd na żywo, tryby wypełnienia; Shift wymusza koło).
  - Wiadro z farbą (algorytm Flood Fill na tablicy `ImageData` z konfigurowalną tolerancją 0–255).
- **Zarządzanie historią i pamięcią:**
  - Transakcyjna historia przyrostowa (patch-based) operująca na obszarach modyfikowanych (dirty rectangles).
  - Prawidłowe śledzenie stanu niezapisanych zmian (`isDirty`) i bezpieczne monity przed utratą danych.
  - Pomijanie operacji no-op (brak pustych kroków w historii).
- **Interfejs i widok:**
  - Dynamiczny zoom (25% – 500%), siatka pomocnicza, dopasowanie do ekranu.
  - Próbnik kolorów podstawowego i wypełnienia, szybka zamiana kolorów (skrót `X`).
  - Skróty klawiszowe dla narzędzi i operacji (`Ctrl+Z`, `Ctrl+Y`, `Ctrl+S`, `Escape`, `P`, `E`, `L`, `R`, `O`, `B`).
- **Pliki i eksport:**
  - Otwieranie plików graficznych (PNG, JPG, WebP, BMP) z automatycznym dopasowaniem rozmiaru płótna.
  - Eksport do formatu PNG (z opcją przezroczystości) oraz JPG (z suwakiem jakości kompresji).

## Świadomie NIE zaimplementowane (kierunki dalszego rozwoju)

- **Warstwy:** Projekt operuje na pojedynczej płaszczyźnie pikseli (dokument jednoarkuszowy). Warstwy stanowią planowany kierunek rozbudowy.
- **Pipeta, narzędzie tekstowe, lasso:** Świadomie odłożone w bieżącej wersji.
- **Własny format projektu:** Bieżąca wersja operuje na standardowych formatach rastrowych (PNG/JPG).

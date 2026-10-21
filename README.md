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
- **Pliki, format PPM i eksport (Ćwiczenie 2):**
  - **Samodzielny moduł Netpbm PPM (`js/ppm.js`):** Odczyt i zapis formatów PPM P3 (tekstowy / ASCII) oraz P6 (binarny / Raw) bez zewnętrznych bibliotek (czysty JavaScript, TypedArrays, Blob).
  - **Odporny parser nagłówków:** Pełna obsługa komentarzy (`#`) w dowolnym miejscu nagłówka i strumienia danych, wieloplatformowe końce linii (CRLF / LF), wielokrotne spacje i tabulatory.
  - **Dynamiczne skalowanie kolorów:** Obsługa dowolnej wartości `maxVal` (1–65535), w tym próbek 16-bitowych Big-Endian w P6 oraz próbek o małej głębi (np. `maxVal = 15`), automatycznie skalowanych do 8-bitowego kanału Canvas (0–255).
  - **Inspekcja i prezentacja metadanych:** Wyświetlanie typu pliku, wymiarów i `maxVal` w pasku stanu (interaktywna plakietka PPM) oraz w dedykowanym oknie dialogowym informacji o pliku wraz z pełną listą komentarzy nagłówka.
  - **Odporność na błędy:** Dedykowany modal błędu informujący o uszkodzonych plikach (ucięty raster), niepoprawnych parametrach czy nieobsługiwanych formatach (np. P1 PBM, P2 PGM) zamiast zawieszenia programu.
  - **Wielokanałowy import:** Wczytywanie plików z dysku przez okno dialogowe oraz metodą przeciągnij i upuść (Drag and Drop).
  - **Eksport wieloformatowy:** Zintegrowany modal zapisu z wyborem PPM P6 (binarny), PPM P3 (tekstowy, wiersze <= 70 znaków zgodnie ze specyfikacją Netpbm), PNG (z przezroczystością) oraz JPG (z jakością kompresji).

## Weryfikacja działania formatu PPM i testy zautomatyzowane (Wymóg 6)

### 1. Zautomatyzowane testy jednostkowe:
Projekt zawiera kompletny zestaw testów jednostkowych weryfikujących dekodowanie P3/P6, obsługę separatorów, 16-bitowe próbki, komentarze, skalowanie wartości i obsługę błędów:
- **W konsoli (Node.js):**
  ```bash
  node --test tests/ppm.test.js
  ```
- **W przeglądarce internetowej:**
  Otwórz plik `tests/index.html` bezpośrednio w przeglądarce (np. przez podwójne kliknięcie lub `file://`).

### 2. Weryfikacja w aplikacji graficznej:
1. **Zapis do PPM:** Narysuj dowolny kształt na płótnie, kliknij przycisk **Zapisz** (lub wciśnij `Ctrl+S`), wybierz format **PPM P6** (binarny) lub **PPM P3** (tekstowy ASCII) i pobierz plik `.ppm`.
2. **Odczyt z PPM:** Kliknij przycisk **Otwórz** (lub `Ctrl+O`) albo po prostu **przeciągnij i upuść (Drag and Drop)** plik `.ppm` (własny lub dostarczony przez prowadzącego) bezpośrednio na obszar roboczy.
3. **Inspekcja nagłówka:** Po wczytaniu w pasku stanu u dołu ekranu pojawi się plakietka `PPM P3/P6 · W×H · max: N`. Kliknięcie na nią lub w przycisk **Informacje o pliku** w górnym menu otworzy szczegółowe okno z parametrami oraz komentarzami `#` z nagłówka.
4. **Obsługa błędów:** W przypadku próby otwarcia uszkodzonego pliku, uciętych danych lub innego formatu (np. PBM P1) aplikacja wyświetli przyjazne okno dialogowe z opisem problemu zamiast zawieszenia programu.

## Świadomie NIE zaimplementowane (kierunki dalszego rozwoju)

- **Warstwy:** Projekt operuje na pojedynczej płaszczyźnie pikseli (dokument jednoarkuszowy). Warstwy stanowią planowany kierunek rozbudowy.
- **Pipeta, narzędzie tekstowe, lasso:** Świadomie odłożone w bieżącej wersji.
- **Własny format projektu:** Bieżąca wersja operuje na formatach PPM (P3, P6), PNG oraz JPG.

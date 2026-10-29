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
  - Skróty klawiszowe dla narzędzi i operacji (`Ctrl+Z`, `Ctrl+Y`, `Ctrl+S`, `Escape`, `P`, `E`, `L`, `R`, `O`, `B`, `I`).
- **Pliki, format PPM i eksport (Ćwiczenie 2):**
  - **Samodzielny moduł Netpbm PPM (`js/ppm.js`):** Odczyt i zapis formatów PPM P3 (tekstowy / ASCII) oraz P6 (binarny / Raw) bez zewnętrznych bibliotek (czysty JavaScript, TypedArrays, Blob).
  - **Odporny parser nagłówków:** Pełna obsługa komentarzy (`#`) w dowolnym miejscu nagłówka i strumienia danych, wieloplatformowe końce linii (CRLF / LF), wielokrotne spacje i tabulatory.
  - **Dynamiczne skalowanie kolorów:** Obsługa dowolnej wartości `maxVal` (1–65535), w tym próbek 16-bitowych Big-Endian w P6 oraz próbek o małej głębi (np. `maxVal = 15`), automatycznie skalowanych do 8-bitowego kanału Canvas (0–255).
  - **Inspekcja i prezentacja metadanych:** Wyświetlanie typu pliku, wymiarów i `maxVal` w dedykowanym oknie informacji o pliku wraz z pełną listą komentarzy nagłówka; okno otwiera przycisk „Informacje o pliku” w górnym pasku.
  - **Odporność na błędy:** Dedykowany modal błędu informujący o uszkodzonych plikach (ucięty raster), niepoprawnych parametrach czy nieobsługiwanych formatach (np. P1 PBM, P2 PGM) zamiast zawieszenia programu.
  - **Wielokanałowy import:** Wczytywanie plików z dysku przez okno dialogowe oraz metodą przeciągnij i upuść (Drag and Drop).
  - **Eksport wieloformatowy:** Zintegrowany modal zapisu z wyborem PPM P6 (binarny), PPM P3 (tekstowy, wiersze <= 70 znaków zgodnie ze specyfikacją Netpbm), PNG (z przezroczystością) oraz JPG (z jakością kompresji).

- **Przestrzenie barw (Ćwiczenie 3):**
  - **Własne konwersje (`js/colorModels.js`):** RGB ↔ HSV i RGB ↔ CMYK oraz zapis HEX, napisane ręcznie wzorami (bez bibliotek). Moduł nie zna DOM-u, więc jest testowany w Node. Zakresy: RGB 0–255, H w stopniach `[0, 360)`, S/V/C/M/Y/K jako ułamki 0–1 (interfejs pokazuje procenty). Przypadki brzegowe bez dzielenia przez zero: czarny (V = 0 → S = 0; K = 1 → C = M = Y = 0), szarości i biały (Δ = 0 → H = 0°).
  - **Picker modeli barw (`js/colorPanel.js`):** kliknięcie próbki obrysu, wypełnienia albo koloru wiadra otwiera wspólny edytor z suwakami i polami RGB, CMYK i HSV oraz polem HEX. Zmiana w jednym modelu przelicza pozostałe na bieżąco. Tło toru suwaka pokazuje zakres kolorów danego kanału. Edytowany model nie jest przeliczany z powrotem z RGB (wartości nie „skaczą”), a barwa H i nasycenie S są zapamiętywane przy przejściu przez szarość i czerń.
  - **Pipeta (narzędzie `I`):** kliknięcie piksela ustawia jego kolor (LPM: aktywny kolor, PPM: drugi) i pokazuje go we wszystkich modelach: w panelu oraz w pasku opcji (HEX, RGB, HSV, CMYK i współrzędne piksela). Przeciągnięcie odczytuje kolor na bieżąco. Pipeta nie zmienia pikseli ani historii.
  - **Operacje na całym obrazie (`js/imageOps.js`, `js/compareView.js`):** przełącznik Kolor / Szarość pokazuje obraz oryginalny, kanały R/G/B albo skalę szarości z wagami `0,299 R + 0,587 G + 0,114 B` i średnią `(R + G + B) / 3`. Podgląd jest rysowany bezpośrednio nad obrazem na przezroczystej warstwie roboczej; „Zastosuj” zapisuje wynik jako jeden krok historii, a „Anuluj podgląd” przywraca obraz. Podczas podglądu narzędzia rysujące są zablokowane; aplikacja podpowiada zastosowanie albo anulowanie zmian.
  - Wskaźnik nad obrazem pokazuje wartości wskazanego piksela w wybranym formacie RGB, HSV lub CMYK oraz kod HEX. Podgląd pokazuje wartości przetworzonego obrazu, a poza podglądem — dokumentu.

## Weryfikacja działania formatu PPM i testy zautomatyzowane (Wymóg 6)

### 1. Zautomatyzowane testy jednostkowe:
Projekt zawiera kompletny zestaw testów jednostkowych weryfikujących dekodowanie P3/P6, obsługę separatorów, 16-bitowe próbki, komentarze, skalowanie wartości i obsługę błędów:
- **W konsoli (Node.js):**
  ```bash
  node --test tests/ppm.test.js
  ```
- **W przeglądarce internetowej:**
  Otwórz plik `tests/index.html` bezpośrednio w przeglądarce (np. przez podwójne kliknięcie lub `file://`).

### 1a. Testy Ćwiczenia 3 (konwersje barw i operacje na obrazie):
```bash
node --test tests/colorModels.test.js tests/imageOps.test.js
```
Pokrywają kolory wzorcowe (czerwony, zielony, niebieski, żółty, cyjan, magenta, biały, czarny, szary), brak dzielenia przez zero, dokładność przejść RGB → HSV → RGB i RGB → CMYK → RGB, zakres H `[0, 360)`, HEX, skalę szarości (wagi i średnia), kanały, statystyki porównania i pomniejszanie podglądu.

### 2. Weryfikacja w aplikacji graficznej:
1. **Zapis do PPM:** Narysuj dowolny kształt na płótnie, kliknij przycisk **Zapisz** (lub wciśnij `Ctrl+S`), wybierz format **PPM P6** (binarny) lub **PPM P3** (tekstowy ASCII) i pobierz plik `.ppm`.
2. **Odczyt z PPM:** Kliknij przycisk **Otwórz** (lub `Ctrl+O`) albo po prostu **przeciągnij i upuść (Drag and Drop)** plik `.ppm` (własny lub dostarczony przez prowadzącego) bezpośrednio na obszar roboczy.
3. **Inspekcja nagłówka:** Kliknij przycisk **Informacje o pliku** w górnym pasku, aby otworzyć szczegółowe okno z parametrami oraz komentarzami `#` z nagłówka.
4. **Obsługa błędów:** W przypadku próby otwarcia uszkodzonego pliku, uciętych danych lub innego formatu (np. PBM P1) aplikacja wyświetli przyjazne okno dialogowe z opisem problemu zamiast zawieszenia programu.

## Świadomie NIE zaimplementowane (kierunki dalszego rozwoju)

- **Warstwy:** Projekt operuje na pojedynczej płaszczyźnie pikseli (dokument jednoarkuszowy). Warstwy stanowią planowany kierunek rozbudowy.
- **Narzędzie tekstowe, lasso:** Świadomie odłożone w bieżącej wersji.
- **Profile kolorów (ICC) i HSL:** Konwersja RGB ↔ CMYK jest „naiwna” (czysta matematyka, bez profili ICC), a obok HSV nie ma osobnego panelu HSL (wymóg dopuszcza HSV albo HSL).
- **Własny format projektu:** Bieżąca wersja operuje na formatach PPM (P3, P6), PNG oraz JPG.

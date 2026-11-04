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
  - **Własne konwersje (`js/colorModels.js`):** RGB ↔ HSV i RGB ↔ CMYK oraz zapis HEX, napisane ręcznie wzorami (bez bibliotek). Moduł nie zna DOM-u, więc jest w całości testowany w Node. Zakresy: RGB 0–255, H w stopniach `[0, 360)`, S/V/C/M/Y/K jako ułamki 0–1 (interfejs pokazuje procenty). Przypadki brzegowe bez dzielenia przez zero: czarny (V = 0 → S = 0; K = 1 → C = M = Y = 0), szarości i biały (Δ = 0 → H = 0°). Kolory wzorcowe są automatycznie sprawdzane pod kątem zgodności z matematyczną definicją.
  - **Picker modeli barw (`js/colorPanel.js`):** kliknięcie próbki obrysu, wypełnienia albo koloru wiadra otwiera edytor z suwakami i polami RGB, CMYK i HSV oraz polem HEX. Zmiana w jednym modelu przelicza pozostałe na bieżąco. Tło toru suwaka pokazuje zakres barw danego kanału. Edytowany model nie jest przeliczany z powrotem z RGB (wartości nie „skaczą”), a wpisanie czerni, bieli czy szarości poprawnie aktualizuje H i S bez zachowywania starych barw.
  - **Pipeta (narzędzie `I`):** kliknięcie piksela ustawia jego kolor (LPM: aktywny kolor, PPM: drugi) i prezentuje go we wszystkich modelach w panelu bocznym obok palety (HEX, RGB, HSV, CMYK oraz współrzędne piksela). Pipeta działa również podczas podglądu operacji na obrazie (próbkując przetworzone piksele bez tworzenia historii), podczas gdy narzędzia rysujące są zablokowane.
  - **Operacje na całym obrazie (`js/imageOps.js`, `js/compareView.js`):** przełącznik Kolor / Szarość pozwala na nieniszczący podgląd kanałów R/G/B w kolorze oraz skali szarości: z wagami luminancji `0,299 R + 0,587 G + 0,114 B`, średnią arytmetyczną `(R + G + B) / 3` oraz mapą różnicy «Różnica» (`differenceMap`) z podsumowaniem statystyk (`compareGrayscales`: średnia różnica bezwzględna, maksymalna różnica i odsetek pikseli różniących się). Podgląd jest renderowany na nakładce `overlayCanvas`; „Zastosuj” zapisuje wynik jako jeden krok historii, a „Anuluj podgląd” przywraca obraz.
  - **Porównanie pikseli na żywo:** Wskaźnik w pasku stanu pokazuje pozycję i wartości wskazanego piksela w formacie RGB, HSV lub CMYK. Przy aktywnym podglądzie szarości wskaźnik automatycznie porównuje wyniki obu wariantów w czasie rzeczywistym (`wagi · średnia · Δ`).

- **Przekształcenia punktowe (Ćwiczenie 4):**
  - **Matematyka (`js/pointOps.js`):** jasność `v′ = v + b` (b od −255 do +255), kontrast `v′ = (v − 128)·k + 128` (k od 0 do 3, k = 1 bez zmiany), negatyw `v′ = 255 − v`, gamma `v′ = 255·(v/255)^(1/γ)` (γ od 0,1 do 5; γ > 1 rozjaśnia, γ = 1 bez zmiany) oraz progowanie (najpierw skala szarości funkcją `grayscaleLuma` z Ćwiczenia 3, potem `Y ≥ T` → biały, inaczej czarny; T od 0 do 255). Każdy wynik jest zaokrąglany i jawnie obcinany do 0–255 (`clamp255`) w kanałach R, G i B, a kanał alfa jest kopiowany. Jasność, kontrast, negatyw i gamma zależą od jednej wartości kanału, więc wynik dla 256 możliwych wartości liczony jest raz w pętli (tablica przekodowań), a pętla po pikselach tylko ją podstawia. Moduł nie zna DOM-u, więc jest testowany w Node.
  - **Sekcja „Korekcje” (`js/adjustments.js`):** wybór operacji, suwak z polem liczbowym (zakres, krok i wartość domyślna zależą od operacji), przycisk „Reset” oraz wzór aktualnie liczonej operacji. Negatyw nie ma parametru. Ponowne kliknięcie aktywnej operacji wyłącza ją.
  - **Podgląd na żywo:** kopia dokumentu jest pobierana raz przy wyborze operacji; każde przesunięcie suwaka przelicza tę kopię i rysuje wynik na nakładce (przeliczenia są łączone przez `requestAnimationFrame`, najwyżej jedno na klatkę). Dokument nie jest zmieniany, dopóki nie klikniesz „Zastosuj” (jeden krok historii, cofanie `Ctrl+Z`); „Anuluj” usuwa podgląd. Korekcje korzystają ze wspólnej sesji podglądu `PaintCompareView.showImage()`, więc podgląd jest unieważniany w tych samych sytuacjach co podgląd kanałów i szarości (Esc, Cofnij/Ponów, zmiana rozmiaru, Nowy, Otwórz), a rysowanie jest wtedy zablokowane. Pasek stanu pokazuje wartość wskazanego piksela przed i po korekcji.

## Weryfikacja działania formatu PPM i testy zautomatyzowane (Wymóg 6)

### 1. Zautomatyzowane testy jednostkowe:
Projekt zawiera kompletny zestaw testów jednostkowych weryfikujących dekodowanie P3/P6, obsługę separatorów, 16-bitowe próbki, komentarze, skalowanie wartości i obsługę błędów:
- **W konsoli (Node.js):**
  ```bash
  node --test tests/ppm.test.js
  ```
- **W przeglądarce internetowej:**
  Otwórz plik `tests/index.html` bezpośrednio w przeglądarce (np. przez podwójne kliknięcie lub `file://`).

### 1a. Testy Ćwiczeń 3 i 4 (konwersje barw, operacje na obrazie, przekształcenia punktowe):
```bash
node --test tests/colorModels.test.js tests/imageOps.test.js tests/pointOps.test.js
```
Pokrywają kolory wzorcowe (czerwony, zielony, niebieski, żółty, cyjan, magenta, biały, czarny, szary), brak dzielenia przez zero, dokładność przejść RGB → HSV → RGB i RGB → CMYK → RGB, zakres H `[0, 360)`, HEX, skalę szarości (wagi i średnia), kanały, statystyki porównania i pomniejszanie podglądu. Testy `tests/pointOps.test.js` sprawdzają jasność, kontrast, negatyw, gamma i próg: wartości kontrolne, punkty stałe, granice progu, zgodność progu z funkcją skali szarości z Ćwiczenia 3, brak „zawijania” wartości poza zakresem (np. 200 + 100 daje 255, a nie 44), zachowanie kanału alfa oraz niezależność pikseli.

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

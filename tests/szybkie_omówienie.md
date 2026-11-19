Oto kompletne, logiczne rozpisanie wszystkich wzorów z **Ćwiczenia 4 (Przekształcenia punktowe)**.

Każdy wzór jest wytłumaczony w schemacie:

1. **Sens fizyczny i intuicja** (co się dzieje z obrazem i histogramem),
2. **Wzór matematyczny krok po kroku** (skąd biorą się konkretne liczby),
3. **Punkty kontrolne na obronę** (konkretne liczby, o które może spytać prowadząca),
4. **Odnośnik do linijki w kodzie**.

---

### Wstęp: Czym jest przekształcenie punktowe?

Wzór ogólny każdego przekształcenia punktowego:
$$v' = f(v)$$
Nowa wartość składowej koloru $v'$ zależy **wyłącznie od dotychczasowej wartości $v$ tego samego piksela**. Przekształcenie nie zna i nie potrzebuje sąsiadów piksela (w przeciwieństwie do filtrów splotowych, np. rozmycia).

---

### 0. Fundament: Funkcja obcinania (`clamp255`)

```
clamp255(x):
  jeśli x < 0   -> 0
  jeśli x > 255 -> 255
  w p.p.        -> x
```

- **Dlaczego to jest kluczowe?**  
  W standardzie 8-bitowym składowa koloru mieści się w przedziale $0 \dots 255$. Gdybyśmy dodali jasność $200 + 100 = 300$ w zwykłej arytmetyce reszt modulo 256 (bajt bez znaku), nastąpiłoby **przepełnienie (overflow)**:
  $$300 \equiv 44 \pmod{256}$$
  W efekcie bardzo jasny piksel stałby się ciemnozielony lub czarny.
- **W kodzie:** [`js/pointOps.js`, linie 30–34](file:///c:/Users/cyunc/Documents/Projects/PAINT/js/pointOps.js#L30-L34)
  ```javascript
  function clamp255(v) {
    if (v < 0) return 0;
    if (v > 255) return 255;
    return v;
  }
  ```

---

### 1. Jasność (Przesunięcie liniowe)

#### Wzór:

$$v' = \text{clamp255}(v + b), \quad b \in [-255, 255]$$

#### Logika i wyprowadzenie:

- Jest to zwykła **translacja (przesunięcie liniowe)** wartości składowej o stałą $b$.
- **Co dzieje się z histogramem?** Cały wykres rozkładu jasności przesuwa się sztywno w prawo ($b > 0$, rozjaśnienie) lub w lewo ($b < 0$, przyciemnienie). Kształt histogramu się nie zmienia, dopóki słupki nie zaczną uderzać w krawędzie $0$ lub $255$.
- Piksele, które przekroczą $255$, spłaszczają się do $255$ (efekt przepalenia bieli). Piksele poniżej $0$ zlewają się w czerń $0$.

#### Przykłady liczbowe:

- $b = 0$: $v' = v + 0 = v$ (brak zmiany).
- $b = +100$: piksel $v = 50 \to 150$, a piksel $v = 200 \to 300 \xrightarrow{\text{clamp}} 255$.
- $b = -100$: piksel $v = 50 \to -50 \xrightarrow{\text{clamp}} 0$.
- $b = +255$: każdy piksel staje się maksymalnie biały ($255$).

#### W kodzie:

[`js/pointOps.js`, linia 90](file:///c:/Users/cyunc/Documents/Projects/PAINT/js/pointOps.js#L90):

```javascript
applyLut(
  src,
  buildLut((v) => v + b),
);
```

---

### 2. Kontrast (Skalowanie wokół punktu 128)

#### Wzór:

$$v' = \text{clamp255}\Big(\text{round}\big((v - 128) \cdot k + 128\big)\Big), \quad k \in [0, 3]$$

#### Logika i wyprowadzenie (3 kroki matematyczne):

Gdybyśmy użyli naiwnego wzoru $v' = v \cdot k$:

- Dla $v = 0$ (czerń) mielibyśmy $0 \cdot k = 0$.
- Oznacza to, że punktem stałym byłaby czerń, a każde zwiększenie kontrastu drastycznie rozjaśniałoby cały obraz.

Aby kontrast działał naturalnie, punktem odniesienia musi być **idealny środek dynamiki tonalnej, czyli $128$**. Wzór realizuje trzy logiczne kroki:

1. $(v - 128)$ — **translacja do środka**: odejmujemy 128, aby sprawdzić odchyłkę piksela od średniej szarości. Piksele jaśniejsze mają odchyłkę dodatnią, a ciemniejsze ujemną.
2. $\cdot k$ — **skalowanie odchyłki**: mnożymy odchyłkę przez współczynnik kontrastu $k$.
   - Jeśli piksel był jaśniejszy ($(v - 128) > 0$), po pomnożeniu przez $k > 1$ staje się **jeszcze jaśniejszy**.
   - Jeśli był ciemniejszy ($(v - 128) < 0$), po pomnożeniu staje się **jeszcze ciemniejszy**.
3. $+ 128$ — **powrót do oryginalnej skali**: dodajemy 128 z powrotem.

#### Dlaczego 128 jest punktem stałym?

Podstawmy $v = 128$ do wzoru dla dowolnego $k$:
$$v' = (128 - 128) \cdot k + 128 = 0 \cdot k + 128 = 128$$
Średnia szarość nigdy nie zmienia swojej wartości, niezależnie od tego, jak mocno podkręcimy kontrast!

#### Wpływ współczynnika $k$:

- $k = 1$: **brak zmiany** (tożsamość, $(v-128)\cdot 1 + 128 = v$).
- $k = 0$: **całkowite wygaszenie kontrastu** — $(v-128)\cdot 0 + 128 = 128$. Cały obraz staje się jednolitą, szarą plamą o jasności 128.
- $k = 3$ (duży kontrast):
  - $v = 100 \implies (100 - 128)\cdot 3 + 128 = -84 + 128 = 44$ (ściemnienie),
  - $v = 200 \implies (200 - 128)\cdot 3 + 128 = 216 + 128 = 344 \xrightarrow{\text{clamp}} 255$ (rozjaśnienie z nasyceniem).

#### W kodzie:

[`js/pointOps.js`, linia 96](file:///c:/Users/cyunc/Documents/Projects/PAINT/js/pointOps.js#L96):

```javascript
applyLut(
  src,
  buildLut((v) => (v - 128) * k + 128),
);
```

---

### 3. Negatyw (Inwersja barw)

#### Wzór:

$$v' = 255 - v$$

#### Logika i wyprowadzenie:

- Jest to odbicie lustrzane skali jasności względem środka przedziału ($127.5$).
- Czerń staje się bielą: $0 \to 255 - 0 = 255$.
- Biel staje się czernią: $255 \to 255 - 255 = 0$.
- Średnia szarość prawie się nie zmienia: $128 \to 255 - 128 = 127$.
- **Matematyczna inwolucja ($f(f(v)) = v$):** Dwukrotne nałożenie negatywu przywraca oryginał:
  $$v'' = 255 - (255 - v) = 255 - 255 + v = v$$

#### W kodzie:

[`js/pointOps.js`, linia 101](file:///c:/Users/cyunc/Documents/Projects/PAINT/js/pointOps.js#L101):

```javascript
applyLut(
  src,
  buildLut((v) => 255 - v),
);
```

---

### 4. Korekcja Gamma (Przekształcenie potęgowe)

#### Wzór:

$$v' = \text{clamp255}\left(\text{round}\left(255 \cdot \left(\frac{v}{255}\right)^{\frac{1}{\gamma}}\right)\right), \quad \gamma \in [0.1, 5.0]$$

#### Logika i wyprowadzenie (3 etapy):

Korekcja gamma opiera się na prawie Stevensa i nieliniowej percepcji ludzkiego oka (wzrok jest znacznie czulszy na subtelne różnice w cieniach niż w światłach).

1. $\left(\frac{v}{255}\right)$ — **normalizacja do ułamka $[0, 1]$**: potęgowanie bezpośrednio na liczbach $0 \dots 255$ dałoby gigantyczne liczby (np. $200^{2.2} \approx 115\ 000$). Dlatego najpierw sprowadzamy wartość do przedziału $0.0 \dots 1.0$.
2. $(\dots)^{\frac{1}{\gamma}}$ — **nieliniowe wygięcie krzywej tonalnej**:
   - Podnosimy ułamek z zakresu $(0, 1)$ do potęgi.
   - **Dlaczego wykładnik to $\frac{1}{\gamma}$, a nie samo $\gamma$?**  
     Dla ułamka $x \in (0, 1)$, jeśli podniesiemy go do potęgi mniejszej od 1, wynik **rośnie** (np. $0.5^{0.5} \approx 0.707$). Chcemy, aby suwak o wartości $\gamma > 1$ **rozjaśniał obraz**. Ponieważ dla $\gamma > 1$ wykładnik $\frac{1}{\gamma} < 1$, krzywa wygina się w górę i podnosi cienie.
3. $255 \cdot (\dots)$ — **denormalizacja**: przeskalowanie ułamka z powrotem do zakresu $0 \dots 255$.

#### Punkty stałe i zachowanie:

- **Punkty stałe**: czerń i biel nigdy się nie przesuwają:
  - $v = 0 \implies 255 \cdot (0)^{1/\gamma} = 0$,
  - $v = 255 \implies 255 \cdot (1)^{1/\gamma} = 255$.
- $\gamma = 1.0$: $\left(\frac{v}{255}\right)^1 \implies v' = v$ (tożsamość, brak zmiany).
- $\gamma = 2.2$ (rozjaśnienie cieni):
  $$v = 128 \implies 255 \cdot \left(\frac{128}{255}\right)^{\frac{1}{2.2}} \approx 255 \cdot (0.5019)^{0.4545} \approx 255 \cdot 0.7303 \approx \mathbf{186}$$
- $\gamma = 0.45$ (przyciemnienie świateł):
  $$v = 128 \implies 255 \cdot \left(\frac{128}{255}\right)^{\frac{1}{0.45}} \approx 255 \cdot (0.5019)^{2.222} \approx 255 \cdot 0.2163 \approx \mathbf{55}$$

#### Zabezpieczenie przed błędem ($\gamma \le 0$):

Gdyby użytkownik podał $\gamma \le 0$, wykładnik $1/\gamma$ byłby ujemny, co dałoby $0^{-p} = \frac{1}{0} \to \infty$ (dzielenie przez zero).  
W kodzie: `const exponent = 1 / (gg > 0 ? gg : 1);`.

#### W kodzie:

[`js/pointOps.js`, linie 108–112](file:///c:/Users/cyunc/Documents/Projects/PAINT/js/pointOps.js#L108-L112):

```javascript
function gamma(src, g) {
  const gg = finiteOr(g, 1);
  const exponent = 1 / (gg > 0 ? gg : 1);
  return applyLut(
    src,
    buildLut((v) => 255 * Math.pow(v / 255, exponent)),
  );
}
```

---

### 5. Progowanie (Binaryzacja po luminancji ITU-R BT.601)

Wymóg 5 mówi: _„Przed progowaniem obraz należy zamienić na skalę szarości (funkcja z ćwiczenia 3)”_.

#### Krok 1: Wzór na luminancję (skala szarości z wagami)

Dla każdego piksela wyznaczamy jego jasność postrzeganą przez ludzkie oko:
$$Y = \text{round}(0.299 \cdot R + 0.587 \cdot G + 0.114 \cdot B)$$

- **Dlaczego takie wagi?** Siatkówka ludzkiego oka ma najwięcej czopków wrażliwych na pasmo zielone ($58.7\%$), mniej na czerwone ($29.9\%$), a najmniej na niebieskie ($11.4\%$). Suma wag: $0.299 + 0.587 + 0.114 = 1.0$.

#### Krok 2: Binaryzacja względem progu $T \in [0, 255]$

$$
R' = G' = B' = \begin{cases}
255 & \text{gdy } Y \ge T \quad \text{(biel)} \\
0 & \text{gdy } Y < T \quad \text{(czerń)}
\end{cases}
$$

#### Jak udowodnić prowadzącej, że użyliśmy wag z Ćw. 3, a nie zwykłej średniej $(R+G+B)/3$?

Podajemy przykład **czystego zielonego** $R=0, G=255, B=0$ przy progu $T = 128$:

1. Gdybyśmy użyli **zwykłej średniej**:  
   $$Y = \frac{0 + 255 + 0}{3} = 85 < 128 \implies \textbf{czarny piksel (0)}$$
2. Gdy używamy **wag luminancji BT.601** (nasz kod):  
    $$Y = 0.587 \cdot 255 \approx 150 \ge 128 \implies \textbf{biały piksel (255)}$$
   Nasz test jednostkowy [`tests/pointOps.test.js`, linia 123](file:///c:/Users/cyunc/Documents/Projects/PAINT/tests/pointOps.test.js#L123) dokładnie to sprawdza!

#### W kodzie:

[`js/pointOps.js`, linie 118–129](file:///c:/Users/cyunc/Documents/Projects/PAINT/js/pointOps.js#L118-L129):

```javascript
function threshold(src, level) {
  const t = finiteOr(level, 128);
  const out = imageOps().grayscaleLuma(src); // Krok 1: wagi BT.601 z Ćwiczenia 3
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    // Krok 2: binaryzacja
    const v = d[i] >= t ? 255 : 0;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  return out;
}
```

---

### 6. Wzór na optymalizację: Tablica LUT (Look-Up Table)

```
       [ Wartość wejściowa bajtu v: 0..255 ]
                        |
                        v
               +-----------------+
               |   lut[v]        |  <-- Obliczone TYLKO 256 razy!
               +-----------------+
                        |
                        v
       [ Podstawienie: d[i] = lut[s[i]] w O(1) ]
```

#### Dlaczego to działa i jak to wyjaśnić?

- W jasności, kontraście, negatywie i gammie wynik piksela zależy **tylko od wartości jednego bajtu $0 \dots 255$**.
- Niezależnie od tego, czy obraz ma 10 tysięcy, czy 10 milionów pikseli, istnieje **dokładnie 256 unikalnych liczb**, jakie mogą wejść do funkcji!
- **Złożoność obliczeniowa**:
  - Bez LUT: $O(N \cdot T_{\text{operacji}})$ — dla obrazu 4K i gammy to $\approx 25\ 000\ 000$ powolnych wywołań `Math.pow()` przy każdym drgnięciu myszą.
  - Z LUT: $O(256 + N)$ — wykonujemy **dokładnie 256 obliczeń `Math.pow()`**, a w pętli po milionach pikseli robimy tylko natychmiastowe pobranie z tablicy `lut[s[i]]` w czasie $O(1)$.

---

### Zestawienie w pigułce do obrony

| Operacja       | Wzór matematyczny                                               | Punkty stałe / kluczowe                                                          | W kodzie                                  |
| :------------- | :-------------------------------------------------------------- | :------------------------------------------------------------------------------- | :---------------------------------------- |
| **Jasność**    | $v' = \text{clamp}(v + b)$                                      | $b=0 \implies v'=v$                                                              | `v + b`                                   |
| **Kontrast**   | $v' = \text{clamp}((v - 128)\cdot k + 128)$                     | $v=128 \implies 128$ dla każdego $k$<br>$k=0 \implies 128$                       | `(v - 128) * k + 128`                     |
| **Negatyw**    | $v' = 255 - v$                                                  | Inwolucja: $f(f(v)) = v$                                                         | `255 - v`                                 |
| **Gamma**      | $v' = \text{clamp}\big(255 \cdot (v/255)^{1/\gamma}\big)$       | $0 \to 0, \quad 255 \to 255$<br>$\gamma > 1$ rozjaśnia, $\gamma < 1$ przyciemnia | `255 * Math.pow(v/255, 1/g)`              |
| **Progowanie** | $Y = 0.299R + 0.587G + 0.114B$<br>$v' = (Y \ge T \ ?\ 255 : 0)$ | $T=0 \implies \text{biały}$<br>$T=255 \implies \text{czarny (poza Y=255)}$       | `grayscaleLuma()` + `d[i] >= t ? 255 : 0` |

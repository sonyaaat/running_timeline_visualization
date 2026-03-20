# Phase Detection — Improvement Plan

> Research question: *"How can automatic temporal segmentation of multivariate Strava running data support meaningful self-reflection through linked visualization of training phases?"*

---

## 1. Поточні проблеми — повний діагноз

### 🔴 Баги що руйнують коректність даних

| # | Файл | Проблема | Наслідок |
|---|------|----------|----------|
| B1 | `pipeline.py:113` | `iloc[week_start:week_end]` — `week_end` виключений | Останній тиждень кожної фази завжди `phase_id=null` → дірки в timeline |
| B2 | `gaps.py:44` + `segments.py:19` | Тиждень де відновилися тренування включається в Inactive | У вихідних даних тиждень із 36 km позначений як Inactive (фаза 3) |
| B3 | `pipeline.py:91` | `"weeks": week_end - week_start` — потрібно `+1` | Inactive фази показують на 1 тиждень менше ніж є насправді |

---

### 🟡 Проблеми з якістю алгоритму

#### P1 — `fill_calendar` нульові тижні забруднюють PELT (features.py:47–61)

`fill_calendar` вставляє тижні з `km=0`, `run_count=0` і **forward-fill** для `avg_pace`, `long_run_ratio`, `efficiency`. Ці "штучні" тижні передаються в PELT як реальні дані.

**Що відбувається:**
- PELT бачить різкі переходи на межах нульових тижнів як breakpoints
- Всередині довгих активних відрізків нульові тижні (хвороба, відпустка < 10 днів) маскують реальний сигнал
- Forward-fill pace означає що PELT вважає "відпочинковий тиждень" продовженням попереднього темпу

**Приклад:** Phase 13 (тижні 38–71, 34 тижні!) — зовні однакова, бо нульові тижні всередині гасять справжні зміни.

---

#### P2 — `long_run_ratio` є ненадійною фічею (features.py:22)

```python
weekly["long_run_ratio"] = weekly["max_run_km"] / weekly["avg_run_km"]
```

- Тиждень з 1 пробіжкою → завжди `ratio = 1.0` (max == avg)
- Тиждень з 2+ пробіжками → може бути 1.8+
- Метрика вимірює не "скільки довгих пробіжок" а "дисперсію дистанцій за тиждень"

PELT бачить різкі стрибки між тижнями з 1 vs 3 пробіжками як changepoint — але це не зміна тренувального патерну, а просто випадковість.

---

#### P3 — `efficiency` не варіює — слабкий сигнал для PELT (features.py:34)

З вихідних даних: `efficiency` завжди близько `0.019–0.021` для всіх фаз. Після robust scaling (normalization.py:20) ця колонка майже повністю занулюється (IQR → ~0). Тобто фіча яка призначена для виявлення прогресу реально не впливає на PELT.

Причина: `avg_speed_ms / avg_heartrate` має надто малу варіацію на тижневому рівні коли HR записаний не для всіх пробіжок.

---

#### P4 — PELT_JUMP=5 неточний (config.py:7)

```python
PELT_JUMP = 5   # must be 1 for weekly data — do not change
```

Коментар каже "must be 1", але значення 5. З `jump=5` PELT перевіряє breakpoints лише на позиціях кратних 5 (тиждень 5, 10, 15...). Справжній перелом на тижні 8 зміститься до 10. Для 89 тижнів `jump=1` не має жодного впливу на продуктивність.

---

#### P5 — compute_stats і label_phase включають нульові тижні (labels.py:30–37)

```python
km = phase_data["km_total"].mean()   # включає km=0 тижні!
```

Фаза з 10 активними тижнями (середнє 25 km) і 3 нульовими отримає `km_per_week = 19.2`. Лейбл "Moderate Volume" замість "Steady Volume". Breakpoint cards показують неправильні % змін.

---

#### P6 — Відсутність тренду як фічі

Зараз PELT виявляє зміни в **середніх** значеннях метрик. Але з точки зору self-reflection важливо не тільки "ця фаза має km=25/тиж" а й "об'єм зростав протягом фази" vs "об'єм стабілізувався".

Два сегменти з однаковим середнім km але різним трендом (↑ побудова vs ↓ відновлення) отримають однаковий лейбл.

---

#### P7 — Відсутність метрики регулярності

Кількість пробіжок на тиждень не відображає регулярність. Можна бігти 2 рази/тиж але нерегулярно (Пн і Пн). Std відхилення днів між пробіжками — це ключовий сигнал для виявлення "Consistent" vs "Sporadic" фаз, якого зараз немає в жодній фічі.

---

#### P8 — Одна широка фаза (38–71 тижні = 34 тижні) через PELT_PENALTY=10

Phase 13 "Steady Volume" 34 тижні — це понад 8 місяців без жодного виявленого перелому. Всередині цього відрізку швидше за все є реальні зміни (темп, об'єм, ефективність), але `PELT_PENALTY=10` надто консервативний для довгих сегментів.

---

## 2. Архітектурні зміни — що переробити

### 2.1 Вхід для PELT — прибрати нульові тижні

**Зараз:**
```
raw activities → weekly features → fill_calendar (додає 0-тижні) → PELT
```

**Після:**
```
raw activities → weekly features (тільки активні тижні) → PELT
                                                          → fill_calendar (тільки для відображення)
```

`fill_calendar` залишається — але тільки для final JSON output і UI. PELT отримує лише тижні де `run_count > 0`.

Після виявлення breakpoints на "стисненому" timeline — маппінг назад на calendar тижні через збережений індекс.

---

### 2.2 Нові фічі для PELT

**Прибрати:**
- `long_run_ratio` — ненадійна (P2)

**Залишити:**
- `km_total` ✓
- `run_count` ✓
- `avg_pace` ✓

**Додати:**

| Фіча | Формула | Що виявляє |
|------|---------|-----------|
| `avg_run_km` | `km_total / run_count` | Середня дистанція одного бігу — стабільніша ніж long_run_ratio |
| `km_4w_slope` | Нахил лінійної регресії `km_total` за останні 4 активних тижні | Чи будується об'єм, стабільний, чи знижується |
| `run_spacing_cv` | CV (std/mean) інтервалів між пробіжками у 4-тижневому вікні | Регулярність: низький = дуже регулярно, високий = хаотично |
| `pace_4w_slope` | Нахил темпу за 4 тижні | Покращення fitness (зниження темпу = прогрес) |

Всі нові фічі рахуються на рівні пробіжок (`raw_activities`), а не на рівні weeks.

---

### 2.3 Нова схема лейблів — додати тренд

**Зараз:** `volume + character` (статичний опис середнього)
```
"Steady Volume / Consistent"
```

**Після:** `volume + character + trend` (направлення всередині фази)
```
"Steady Volume / Consistent"  +  trend: "building" | "stable" | "tapering" | "recovering"
```

Тренд рахується окремо після виявлення фаз — через `linregress(week_index, km_total)` по активних тижнях фази. Slope > +1.5 km/тиж² = "building", < -1.5 = "tapering", інше = "stable".

Тренд не змінює основний лейбл — він додається як окреме поле `"trend"` в JSON і використовується у UI як стрілочка.

---

### 2.4 Виправити inactive boundary (B2)

В `gaps_to_week_indices`: `week_end` має вказувати на останній тиждень БЕЗ пробіжок, а не на перший тиждень з пробіжками.

```python
# Знайти останній тиждень де run_count == 0 перед відновленням
# Перший тиждень де runner повернувся — це активний тиждень
```

---

### 2.5 Config — оновлені параметри

| Параметр | Зараз | Після | Причина |
|----------|-------|-------|---------|
| `PELT_JUMP` | 5 | **1** | Точне виявлення breakpoints |
| `PELT_PENALTY` | 10 | **6** | Знайде більше переломних моментів у довгих фазах |
| `MIN_PHASE_WEEKS` | 7 | **4** | Дозволить коротші але реальні фази |
| `MIN_MERGE_WEEKS` | 3 | **3** | Залишити (вже є) |
| `INACTIVE_GAP_DAYS` | 10 | **10** | Залишити |

---

## 3. Нова структура JSON output

### phases — додати нові поля

```json
{
  "id": 3,
  "type": "Active",
  "name": "Steady Volume / Consistent",
  "trend": "building",
  "trend_slope": 1.8,
  "color": "#85B7EB",
  "week_start": 17,
  "week_end": 26,
  "date_start": "2024-11-04",
  "date_end": "2025-01-05",
  "duration_weeks": 10,
  "stats": {
    "km_per_week": 23.4,
    "runs_per_week": 2.1,
    "avg_pace": 5.54,
    "avg_run_km": 11.1,
    "run_spacing_cv": 0.32,
    "efficiency": 0.019
  }
}
```

**Нові поля:**
- `trend` — "building" | "stable" | "tapering" | "recovering"
- `trend_slope` — числовий нахил km/тиж (для UI стрілочки)
- `date_start` / `date_end` — реальні дати (не лише week index)
- `duration_weeks` — правильна кількість тижнів
- `stats.avg_run_km` — замінює long_run_ratio
- `stats.run_spacing_cv` — новий показник регулярності

### breakpoints — додати narrative

```json
{
  "from_id": 3,
  "to_id": 5,
  "week_index": 27,
  "date": "2025-01-13",
  "narrative": "volume_drop",
  "changes": {
    "km_per_week": -40.4,
    "runs_per_week": -37.9,
    "avg_pace": -0.7,
    "avg_run_km": -15.0,
    "run_spacing_cv": 22.0
  }
}
```

`narrative` — автоматично визначається за правилами:
- `km_per_week` < -30% → `"volume_drop"`
- `km_per_week` > +30% → `"volume_surge"`
- `avg_pace` < -5% (покращення) і km стабільний → `"fitness_gain"`
- `runs_per_week` < -40% → `"frequency_drop"`
- `run_spacing_cv` > +30% → `"consistency_lost"`
- `run_spacing_cv` < -30% → `"consistency_gained"`

---

## 4. Зміни в UI

### 4.1 Phase strip / Overview (overview.js)

**Проблема зараз:** через `phase_id=null` на останньому тижні кожної фази timeline має невидимі дірки. Після фіксу B1 це зникне.

**Додати:**
- Маленька стрілочка (↑↓→) всередині кожного кольорового блоку фази — показує `trend`
- Hover на фазі → tooltip показує `duration_weeks`, `km_per_week`, `trend`

---

### 4.2 Breakpoint cards (breakpoints.js)

**Зараз:** тільки `% зміни` по метриках. Не зрозуміло "що це значить".

**Додати:**
- Заголовок картки: людський опис через `narrative`:
  - `"volume_drop"` → **"Різке зниження об'єму"**
  - `"fitness_gain"` → **"Покращення ефективності"**
  - `"consistency_lost"` → **"Втрата регулярності"**
- Дату переломного моменту (реальна дата, не week index)
- Підсвітити яка зміна є найбільшою

---

### 4.3 Zoom Timeline (zoomTimeline.js)

**Зараз:** `weekly` — рядки без `phase_id` показуються без кольору.

**Після фіксу B1:** всі тижні матимуть phase_id — continuous color band.

**Додати:**
- Trend overlay — тонка лінія `km_4w_slope` поверх area chart (чи об'єм зростав/падав)
- Фаза що виділена кліком — показати тривалість і trend в заголовку

---

### 4.4 Heatmap (heatmap.js)

Не потребує змін в алгоритмі — але після виправлення `phase_id` правильно прив'яже тижні до фаз.

---

### 4.5 Stats panel для фази

Замінити `long_run_ratio` на `avg_run_km` — більш зрозуміла метрика для користувача.
Додати `run_spacing_cv` як "regularity" індикатор (низький = регулярно, високий = непередбачувано).

---

## 5. Порядок реалізації (покроково)

### Sprint 1 — Виправити баги (без зміни логіки)
1. **B1**: `pipeline.py:113` — `week_end` → `week_end + 1`
2. **B3**: `pipeline.py:91` — `weeks` → `+1`
3. **P4**: `config.py` — `PELT_JUMP = 1`
4. **P5**: `labels.py` — `compute_stats` і `label_phase` фільтрувати нульові тижні

### Sprint 2 — Покращити PELT input
5. Відокремити `fill_calendar` від PELT pipeline — передавати в `detect_on_segment` тільки активні тижні сегменту, зберігати mapping `compressed_idx → calendar_idx`
6. Виправити **B2** — `gaps.py` boundary logic
7. Замінити `long_run_ratio` на `avg_run_km` у feature matrix
8. Додати `avg_run_km` в `compute_stats`

### Sprint 3 — Нові фічі та тренд
9. `features.py` — додати `km_4w_slope`, `run_spacing_cv`, `pace_4w_slope`
10. `normalization.py` — оновити feature list
11. `pipeline.py` — після виявлення фаз рахувати `trend` і `trend_slope` для кожної
12. `config.py` — оновити `PELT_PENALTY=6`, `MIN_PHASE_WEEKS=4`

### Sprint 4 — Нові JSON поля
13. `pipeline.py` — додати `date_start/date_end`, `duration_weeks`, `trend`, `trend_slope`
14. `pipeline.py` / нова функція — `narrative` для breakpoints
15. `labels.py` — замінити `long_run_ratio` на `avg_run_km` у logic

### Sprint 5 — UI
16. `overview.js` — trend стрілочки на фазах
17. `breakpoints.js` — narrative заголовки, дати
18. `zoomTimeline.js` — виправити rendering нульових phase_id тижнів

---

## 6. Що НЕ змінювати

- Загальна структура pipeline (segments → detect → label → assemble) — правильна
- Weekly granularity як основа (це правильний рівень для бігу)
- Ruptures PELT з `model="rbf"` — правильний вибір для multivariate
- Robust scaling — правильний вибір для різних масштабів метрик
- `MIN_MERGE_WEEKS` логіка (вже виправлена)
- Структура JSON output (phase/weekly/breakpoints) — залишити, лише розширити

---

## 7. Очікуваний результат після всіх змін

| До | Після |
|----|-------|
| Phase 13: 34 тижні без структури | 4–6 фаз в цьому ж відрізку |
| "Moderate Volume" для тижня з 36 km | Правильний лейбл з реальними stats |
| Дірки в timeline (null phase_id) | Continuous color band |
| Breakpoint: тільки цифри | Людський опис: "Різке зниження об'єму" |
| Всі фази "стабільні" | Тренд: ↑↓→ на кожній фазі |
| Inactive включає перший активний тиждень | Чіткий поділ active/inactive |

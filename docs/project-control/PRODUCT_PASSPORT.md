# PRODUCT PASSPORT — паспорт продукта Yarn AI

**Статус:** CURRENT — `GARMENT PHOTO YARN CHARACTERIZATION AND OPTIONS V1` имеет verdict `BLOCKED`
**Проверено:** 2026-09-02
**Источник текущей правды:** [PROJECT_STATE.md](./PROJECT_STATE.md)

## Обновление 2026-09-02 — yarn characterization/options

Yarn AI теперь имеет отдельную пользовательскую секцию и contract для трёх ориентировочных вариантов пряжи, не подменяющий выбор конкретного товара и контрольный образец. Однако exact real project не получил сохранённой рекомендации: единственный разрешённый provider response был отклонён локальной validation с `HTTP 422`, точная причина не сохранилась, повтор запрещён. Поэтому числовые диапазоны, preferred middle option и persistence/reopen не считаются доказанными; yarn/gauge inputs остаются пустыми.

## Прямой вывод

Yarn AI доказал один ограниченный пользовательский путь: существующая схема/PDF → подтверждённые данные → адаптация → понятное объяснение → исполнимый план → отдельная персональная инструкция для печати → virtual dry run (виртуальная проверка интерфейса) `127/127`. Для exact Flax также создана полная резервная копия с PDF и проверяемым exact restore, но живое восстановление через обычный Chrome пока не принято.

Это не означает, что весь продукт или первая продажа готовы. В exact real photo project владелец подтвердил «Вязание отдельными деталями с втачным рукавом», и ordinary UI открыл authoritative garment и yarn profiles с пустым manual intake. Фактическая пряжа и остальные пользовательские данные отсутствуют, поэтому validation остаётся `incomplete + ABSTAIN`, а расчёт изделия по фото, физическое вязание, диагностика ошибок и продаваемая схема не созданы.

## Коммерческое ядро первой версии

Первый целевой пользователь — самостоятельная вязальщица с существующей схемой, которой нужна проверяемая адаптация под размер, пряжу, спицы и плотность.

**Основной результат:** сохранённый проект, где исходная схема и пользовательская адаптация разделены, каждое критическое число имеет источник или формулу, изменения объяснены человеческим языком, а итог представлен как последовательный план вязания.

## Пять канонических функций

| Каноническая функция | Текущая доказанная граница | Статус |
|---|---|---|
| Фото или идея → план вязания | `GARMENT_MEASUREMENT_REQUIREMENTS_V1` и `GARMENT_YARN_REQUIREMENTS_V1` authoritative для exact confirmed manual route; factual intake и validation интегрированы. Exact real project хранит owner-confirmed `tech_02`, оба resolved profiles, empty intake и persisted `incomplete + ABSTAIN`; фактическая пряжа и расчёт отсутствуют | Оба requirements contracts + обязательный real Scenario A `PASS`; полный путь `PARTIAL` |
| Готовая схема → объяснение и адаптация | Exact Flax через обычный saved-project route возвращает подтверждённую адаптацию, Stage 22 revision `36`, 127 шагов, персональную print page и полный backup; download доказан, isolated exact restore доказан технически, browser restore/reopen заблокирован выбором файла | Основной путь `PROVEN E2E`; print export и backup live acceptance `PARTIAL` |
| Пошаговое сопровождение во время вязания | План, pre-start screen, session contract и virtual `127/127` доказаны; физический старт и шаги не выполнялись | `EXTERNAL BLOCKER` — `AWAITING KNITTER` |
| Ошибка или проблема → причина и исправление | Есть monitoring/intervention/action/evidence contracts и тесты, но нет принятого обычного человеческого маршрута от сообщения проблемы до понятного исправления | `CODE ONLY` |
| Готовое изделие → продаваемая схема | Персональная инструкция владельца исходника не является продаваемой схемой; sellable document, публикация и независимая приёмка отсутствуют | `NOT IMPLEMENTED` |

## Что доказано для manual intake validation

- Пользователь видит отдельные результаты «Пройдено», «Не хватает или неверно», «Конфликты», «Неразрешённые вопросы», «Рекомендации» и одно первое действие.
- `ready_to_confirm` возможен только при нуле blocking missing/invalid/conflict/stale/critical unresolved; до отдельного клика snapshot отсутствует.
- Production contracts не выдумывают профили: при exact confirmed manual decision они строят versioned garment и yarn profiles, а unknown/mismatched handoff fail closed. Yarn profile требует только конкретную identity и явное strand count; до выбора пряжи остаётся `YARN_NOT_SELECTED`, но не `YARN_REQUIREMENTS_UNRESOLVED`.
- Exact real project `01a05c3e-a029-7ca7-a949-b8cf5d27e5b0` по прямому owner-решению хранит confirmed `tech_02` / `seamed_set_in_sleeve`; обязательный real Scenario A имеет `PASS`, а synthetic proof остаётся отдельным.
- Изолированный synthetic fixture доказывает механику достаточного набора, explicit confirmation, immutable exact-provenance snapshot, reload и normal reopen, но не объявляет реальное фотоизделие готовым к расчёту.
- Этот блок не выполняет расчёт петель/рядов, не выбирает конструкцию за пользователя и не запускает последующие Stage.

## Что входит в доказанную границу Flax

- exact project `01a04c4a-769d-7cc8-9d3a-bc8fcbbda06b`;
- сохранённый исходный PDF и source evidence (доказательства из источника);
- отдельный adaptation profile — профиль пользовательской адаптации;
- confirmed Stage 21 revision `29`, snapshot `fnv1a32:976451ff`;
- Stage 22 revision `36`, plan fingerprint `fnv1a32:c065298e`, `127` последовательных шагов;
- current virtual run для revision `36`: `127/127`;
- historical virtual run для revision `33`: `127/127`, только как история;
- physical session waiting, `0/127`;
- обычный маршрут `/saved-projects` → exact Flax → принятая адаптация → текущий план → экран начала вязания;
- два повторных открытия без изменения Stage 21/22/session identities и физического прогресса.
- видимое действие Stage 22 «Сохранить инструкцию в PDF» и отдельная print page с назначением, блоком «Перед началом», доказанными изменениями, статусом проверки, всеми 127 шагами и юридическим предупреждением;
- Chromium QA PDF на 26 A4-страницах; это доказательство экспорта и вёрстки, но не физической пригодности изделия.
- обычная карточка exact Flax создаёт один full-backup envelope: `819` records, исходный PDF и текстовый файл, manifest и SHA-256;
- independent validation и technical isolated restore/reopen сохраняют exact project ID, revision `400`, Stage 21/22 bindings, virtual histories и physical `0/127`.

## Что не входит в доказанную границу

- расчёт изделия и исполнимый план по фотографии;
- поддержка всех конструкций, размеров и типов схем;
- физическая выполнимость всех 127 шагов, готовое изделие и посадка;
- диагностика реальной вязальной ошибки обычным пользователем;
- выпуск документа, который можно продавать как схему;
- живой browser restore/reload/reopen из full backup через обычный file chooser;
- восстановление после аварии непосредственно в canonical Chrome; эта отдельная функция не реализована;
- внешний HTTPS-доступ, правила данных/PDF, оплата, возвраты и support path — путь поддержки.

## Критерий первой продажи

`FIRST-SALE READINESS = FAIL` до тех пор, пока не закрыты одновременно:

1. controlled real-knitter acceptance — ограниченная проверка реальной вязальщицей;
2. полная пользовательская резервная копия и восстановление без потери PDF и bindings;
3. понятные правила обращения с PDF и личными данными;
4. доступ покупателя, оплата/возврат и поддержка;
5. один проход обычного пользователя без скрытой технической помощи.

## Персональная инструкция и продаваемая схема — разные продукты

`EXPORT ADAPTED INSTRUCTION V1` — производный рабочий документ для владельца законно загруженного исходника. Он содержит только подтверждённые пользовательские данные и план Yarn AI, не включает страницы, изображения, схемы, логотипы или вёрстку исходного Flax PDF, не даёт лицензию на распространение и не является функцией «готовое изделие → продаваемая схема».

## Решение владельца и следующая граница

Утверждённый блок `FULL PROJECT BACKUP + ISOLATED RESTORE VERIFICATION V1` реализован. Пользователь получает один полный файл и видит понятный отчёт о количестве records/files, размере и integrity. Restore отделён от download и разрешён только явным действием в пустой isolated origin; canonical disaster restore не маскируется под эту проверку.

Общий статус `PARTIAL`: обязательный normal-UI restore/reload/reopen не состоялся, потому что расширение Chrome запретило передать выбранный локальный файл. Кодовые и технические доказательства не заменяют этот шаг.

**Ровно одна следующая граница:** `LIVE ISOLATED RESTORE ACCEPTANCE CLOSURE` — включить расширению доступ к local file URLs и повторить уже реализованный ordinary route на `127.0.0.1:8001`. Другую функцию не начинать.

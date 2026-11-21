# Карта системы управления Yarn AI

## Источники истины и загрузка

| Элемент | Точный путь | Назначение | Когда читается | Кто изменяет | Источник данных | Проверка и связи |
|---|---|---|---|---|---|---|
| Настройки ChatGPT | `ChatGPT → Settings → Personalization` | Постоянный стиль общения, Custom instructions и память ChatGPT | Во всех подходящих чатах ChatGPT | Евгений или агент по прямому поручению | Личные правила Евгения | Повторно открыть; сравнить с резервной копией |
| Резерв персонализации | `C:\Users\User\YarnAI\docs\project-control\CHATGPT_PERSONALIZATION.md` | Точный проверяемый текст Custom instructions | При установке и аудите | Codex по поручению Евгения | Фактически сохранённое поле ChatGPT | Посимвольное сравнение; содержит правило одного блока кода |
| Активный CODEX_HOME | `C:\Users\User\.codex` | Корень глобальных правил, конфигурации и локальной памяти | При каждом локальном запуске Codex | Codex/Евгений; путь меняется только сознательно | Переменная `CODEX_HOME`, иначе стандартный путь | Проверить переменную среды и отсутствие конкурирующего дома |
| Глобальные правила Codex | `C:\Users\User\.codex\AGENTS.md` | Постоянное общение и общий способ работы с Евгением | Всегда, если нет глобального `AGENTS.override.md` | Codex по прямому поручению Евгения | Действующие личные правила | Новая сессия перечисляет загруженные инструкции |
| Конфигурация Codex | `C:\Users\User\.codex\config.toml` | Личные настройки, feature flags, плагины и MCP | При запуске Codex | Евгений/Codex в разрешённой границе | Существующая конфигурация | Сравнить с backup; память `true`, остальные поля сохранены |
| Локальная память Codex | `C:\Users\User\.codex\memories\` | Вспомогательный автоматически созданный контекст | Когда функция и чат разрешают её использование | Только Codex автоматически | Подходящие прошлые локальные чаты | Проверить флаг; не редактировать вручную; не считать источником истины |
| Основная папка YarnAI | `C:\Users\User\YarnAI` | CWD новых задач, Git и автоматическое обнаружение инструкций/skills/config | При открытии локального проекта YarnAI | Евгений или агент по прямому поручению | Настройка локального проекта | Проект приложения показывает этот путь и Git=true |
| Инструкция установки | `C:\Users\User\YarnAI\docs\project-control\INSTALLATION.md` | Пути, загрузка, безопасная повторная установка и проверки | При установке, аудите, восстановлении | Codex по поручению Евгения | Эта система и официальное поведение Codex | Проверить все перечисленные пути и ссылки |
| Правила Yarn AI | `C:\Users\User\YarnAI\AGENTS.md` | Краткие обязательные границы конкретного репозитория | Всегда при работе из YarnAI | Евгений/Codex после утверждения | Канон, state и workflow | Размер <32 KiB; читается после глобальных правил |
| Стандарт планов | `C:\Users\User\YarnAI\.agent\PLANS.md` | Формат ExecPlan и правило одного активного плана | Для сложной/многошаговой работы | Codex | Утверждённый рабочий процесс | Активный план содержит все обязательные разделы |
| Навык | `C:\Users\User\YarnAI\.agents\skills\yarn-ai-workflow\SKILL.md` | Маршрутизация режимов и обязательная процедура одного блока | При явном вызове или совпадении задачи | Codex по решению Евгения | Проектный workflow | `quick_validate.py`; ссылки на references существуют |
| Метаданные навыка | `C:\Users\User\YarnAI\.agents\skills\yarn-ai-workflow\agents\openai.yaml` | Имя в UI, default prompt, неявный вызов | При обнаружении навыка | Codex | Настройки навыка | Валидный YAML; `allow_implicit_invocation: true` |
| Канон | `...\references\project-canon.md` | Коммерческая цель, инварианты и запреты | При планировании границы и споре о scope | Евгений/Codex после решения | Действующие решения владельца | Не содержит временный Stage/status |
| Карта продукта | `...\references\product-map.md` | Пять функций и 13 блоков текущей функции | При декомпозиции и определении границы | Евгений/Codex после решения | Канон продукта | Сверить с PROJECT_STATE и приёмкой |
| Процесс блока | `...\references\block-workflow.md` | Контракт, реализуемость и последовательность работы | При планировании и реализации | Codex | Проектный workflow | Один результат, один блок, один следующий шаг |
| Приёмка | `...\references\acceptance.md` | Пять уровней доказательства готовности | При технической и пользовательской проверке | Евгений утверждает, Codex ведёт | Фактические проверки | Число тестов не подменяет принятие |
| Доказательства | `...\references\evidence-and-decisions.md` | Классификация FACT/DECISION/... | При чтении старых материалов и обновлении state/log | Codex | Наблюдения и решения Евгения | В active state только FACT и действующие DECISION |
| Текущее состояние | `C:\Users\User\YarnAI\docs\project-control\PROJECT_STATE.md` | Единственная текущая правда, ограничения, статусы и одна следующая задача | Перед любой работой | Codex после проверки; Евгений утверждает решения | Код, данные, тесты, интерфейс, решения | Дата, HEAD, доказательства; нет гипотез как фактов |
| Паспорт продукта | `C:\Users\User\YarnAI\docs\project-control\PRODUCT_PASSPORT.md` | Коммерческое ядро, scope и статусы пяти канонических функций | При product audit и выборе границы | Codex после доказательной сверки | `PROJECT_STATE`, код и live evidence | Не объявляет весь продукт готовым по одному Flax path |
| Паспорт реализации | `C:\Users\User\YarnAI\docs\project-control\IMPLEMENTATION_PASSPORT.md` | Routes, components, contracts, storage и фактические технические gaps | При архитектурном и product audit | Codex после проверки source/tests | Текущий worktree и contracts | Разделяет code/tests/live/external proof |
| Паспорт приёмки | `C:\Users\User\YarnAI\docs\project-control\ACCEPTANCE_PASSPORT.md` | Evidence matrix пяти функций и критерии следующего блока | При приёмке и выборе следующего результата | Codex; решения утверждает Евгений | Наблюдаемые проверки | Использует только статусы аудита и точный первый gap |
| Журнал решений | `C:\Users\User\YarnAI\docs\project-control\DECISION_LOG.md` | История только утверждённых ACTIVE/SUPERSEDED решений | При конфликте или обновлении решения | Codex по прямому решению Евгения | Подтверждения владельца | Новые записи сверху; не склад разговоров |
| Учёт времени | `C:\Users\User\YarnAI\docs\project-control\TIME_LEDGER.md` | Фактическое время, переделки и доказательства | После измеримой работы | Codex/участник работы | Измеренные интервалы | Неизвестное = `НЕ ИЗМЕРЕНО` |
| Активные планы | `C:\Users\User\YarnAI\docs\plans\ACTIVE_*.md` | Живой план одной сложной работы | Только для соответствующей активной задачи | Codex; решения утверждает Евгений | Контракт блока и текущий прогресс | Не более одного; завершённый теряет `ACTIVE_` |

Полные абсолютные пути reference-файлов начинаются с `C:\Users\User\YarnAI\.agents\skills\yarn-ai-workflow\references\`.

## Человеческие функции и программные блоки

| Человеческая функция | Текущая граница | Программные блоки/места подключения | Источник истины | Основная проверка |
|---|---|---|---|---|
| Создание по фотографии или замыслу | Manual intake `PROVEN E2E`; полный план `PARTIAL` | Garment photo имеет сохранённый русский analysis, explicit technology decision и отдельный `MANUAL_CALCULATION_INTAKE_V1` для двух ручных вариантов; промышленный вариант informational; расчёт и plan отсутствуют | `PROJECT_STATE.md`, `PRODUCT_PASSPORT.md`, `ACCEPTANCE_PASSPORT.md` | Intake current только для exact decision revision; нельзя объявлять готовность к расчёту или подключать Stage 21/22 без отдельного контракта |
| Адаптация существующей схемы | `PROVEN E2E` только для exact Flax boundary | Документ → extraction/provenance → confirmation → source/adaptation → solver → explanation → Stage 22 → virtual/reopen | `PROJECT_STATE.md`, затем passports/references | Exact identities, математика, IndexedDB, ordinary UI и persistence; physical отдельно |
| Сопровождение вязания | `EXTERNAL BLOCKER / AWAITING KNITTER` | Session/step/checkpoint/progress code, human-first pre-start и virtual `127/127`; physical `0/127` | `PROJECT_STATE.md`, `ACCEPTANCE_PASSPORT.md` | Только Наталья может доказать physical steps 1–5 и pause/reopen |
| Исправление ошибок | `CODE ONLY` | Monitoring → intervention → action → evidence → verification → decision → follow-up; human entry/E2E не принят | `IMPLEMENTATION_PASSPORT.md`, `ACCEPTANCE_PASSPORT.md` | Direct route и tests не заменяют ordinary user journey |
| Создание продаваемой схемы | `NOT IMPLEMENTED` | Pattern evolution — административный internal cycle; sellable document/export отсутствует | `PROJECT_STATE.md`, `ACCEPTANCE_PASSPORT.md` | Требуется отдельный product contract и независимый пользовательский проход |

## Общий поток работы

человеческая функция → минимальная схема → проверка реализуемости → утверждение → один программный блок → автоматические тесты → настоящий интерфейс → пользовательская проверка → подтверждение Евгения → обновление состояния → следующий блок

## Границы источников истины

- Постоянное общение: глобальный `AGENTS.md` и Custom instructions ChatGPT.
- Обязательные проектные правила: корневой `AGENTS.md`.
- Подробная процедура и канон: `SKILL.md` и references.
- Текущая правда: только `PROJECT_STATE.md`.
- История решений: `DECISION_LOG.md`.
- Фактическое время и переделки: `TIME_LEDGER.md`.
- Ход одной сложной работы: один `ACTIVE_*.md`.
- Production-код, тесты и реальные данные остаются первичными доказательствами поведения; управляющие документы не могут объявить их рабочими без проверки.

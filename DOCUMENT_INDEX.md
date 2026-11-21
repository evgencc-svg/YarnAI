# Индекс документации YarnAI

Дата проверки: 30 июля 2026 года.

Этот файл является только навигационным индексом. Он не вводит новых продуктовых, математических или архитектурных правил, не изменяет статусы исходных документов и не разрешает противоречия между ними.

## 1. Назначение каталога YarnAI

Каталог `C:\Users\User\YarnAI` является единственным активным источником документации проекта YarnAI. Документ считается действующим источником истины только в пределах роли, явно закреплённой в самом документе, утверждённом решении или каноническом комплекте первой функции.

Статус в этом индексе описывает роль документа для навигации и не заменяет его собственный статус. Черновики и предложения не повышаются до канона автоматически.

## 2. Карта документации

### 2.1. Канонические и нормативные документы

Ниже перечислены документы с явно установленной канонической, нормативной или утверждённой ролью.

| Документ и название | Назначение | Статус | Источник истины | Логически связанные документы |
|---|---|---|---|---|
| [CANON.md](./CANON.md) — CANON | Фиксирует фундаментальные принципы YarnAI и правило изменения канонической документации через `OWNER REVIEW`. | CANONICAL | Да — для фундаментальных принципов проекта | [DECISIONS.md](./DECISIONS.md), [PRODUCT_DNA.md](./PRODUCT_DNA.md), [USER_STATES.md](./USER_STATES.md) |
| [DECISIONS.md](./DECISIONS.md) — DECISIONS | Ведёт реестр продуктовых решений. Источником истины являются только записи со статусом `APPROVED`: `D-001` и `D-002`; записи `D-003`—`D-012` остаются открытыми. | DECISION | Да — только для `APPROVED`-решений | [CANON.md](./CANON.md), [PRODUCT_DNA.md](./PRODUCT_DNA.md), [MVP.md](./MVP.md), [USER_STATES.md](./USER_STATES.md), [GLOSSARY.md](./GLOSSARY.md) |
| [FIRST_FUNCTION_COMPARISON.md](./FIRST_FUNCTION_COMPARISON.md) — YarnAI: продуктовое сравнение трёх первых функций | Содержит продуктовое сравнение кандидатов и явное подтверждение владельцем перерасчёта простой детали по плотности и меркам как первой функции. | DECISION | Да — для выбора и продуктовой границы первой функции | [KNITTING_MATH_CANON.md](./KNITTING_MATH_CANON.md), [CALCULATION_ENGINE_SPEC.md](./CALCULATION_ENGINE_SPEC.md), [FIRST_FUNCTION_TEST_PLAN.md](./FIRST_FUNCTION_TEST_PLAN.md) |
| [KNITTING_MATH_CANON.md](./KNITTING_MATH_CANON.md) — Математический канон YarnAI | Задаёт нормативные математические определения, порядок расчётов, округление, контроль и границы автоматического расчёта. | CANONICAL | Да — единственный источник математической истины для расчётов YarnAI | [CALCULATION_ENGINE_SPEC.md](./CALCULATION_ENGINE_SPEC.md), [FIRST_FUNCTION_ARCHITECTURE.md](./FIRST_FUNCTION_ARCHITECTURE.md), [FIRST_FUNCTION_TEST_PLAN.md](./FIRST_FUNCTION_TEST_PLAN.md) |
| [CALCULATION_ENGINE_SPEC.md](./CALCULATION_ENGINE_SPEC.md) — Спецификация расчётного движка YarnAI | Определяет логический контракт первой расчётной функции: входы, проверки, порядок обработки, результаты, ошибки, предупреждения и сценарии. Подчинён математическому канону версии 1.0. | SPECIFICATION | Да — для поведения расчётного движка в установленной области | [KNITTING_MATH_CANON.md](./KNITTING_MATH_CANON.md), [FIRST_FUNCTION_ARCHITECTURE.md](./FIRST_FUNCTION_ARCHITECTURE.md), [FIRST_FUNCTION_TEST_PLAN.md](./FIRST_FUNCTION_TEST_PLAN.md) |
| [FIRST_FUNCTION_ARCHITECTURE.md](./FIRST_FUNCTION_ARCHITECTURE.md) — Архитектура первой функции YarnAI | Определяет минимальную архитектуру первой расчётной функции, ответственность модулей, структуры данных и прохождение данных. Не распространяется на архитектуру YarnAI целиком. | ARCHITECTURE | Да — для архитектурных границ первой функции | [CALCULATION_ENGINE_SPEC.md](./CALCULATION_ENGINE_SPEC.md), [FIRST_FUNCTION_IMPLEMENTATION_PLAN.md](./FIRST_FUNCTION_IMPLEMENTATION_PLAN.md), [FIRST_FUNCTION_TEST_PLAN.md](./FIRST_FUNCTION_TEST_PLAN.md) |
| [FIRST_FUNCTION_IMPLEMENTATION_PLAN.md](./FIRST_FUNCTION_IMPLEMENTATION_PLAN.md) — План реализации первой функции YarnAI | Задаёт последовательность и обязательный объём реализации утверждённой архитектуры первой функции. Не вводит собственных математических или архитектурных правил. | PLAN | Да — для порядка и обязательного объёма реализации первой функции | [FIRST_FUNCTION_ARCHITECTURE.md](./FIRST_FUNCTION_ARCHITECTURE.md), [FIRST_FUNCTION_TEST_PLAN.md](./FIRST_FUNCTION_TEST_PLAN.md), [FIRST_FUNCTION_ACCEPTANCE_SPEC.md](./FIRST_FUNCTION_ACCEPTANCE_SPEC.md) |
| [FIRST_FUNCTION_TEST_PLAN.md](./FIRST_FUNCTION_TEST_PLAN.md) — План тестирования первой функции YarnAI | Определяет единый порядок доказательства корректности, обязательные сценарии, инварианты и условия тестовой готовности первой функции. | TEST | Да — для обязательного тестирования первой функции | [FIRST_FUNCTION_COMPARISON.md](./FIRST_FUNCTION_COMPARISON.md), [CALCULATION_ENGINE_SPEC.md](./CALCULATION_ENGINE_SPEC.md), [FIRST_FUNCTION_ARCHITECTURE.md](./FIRST_FUNCTION_ARCHITECTURE.md), [FIRST_FUNCTION_IMPLEMENTATION_PLAN.md](./FIRST_FUNCTION_IMPLEMENTATION_PLAN.md), [FIRST_FUNCTION_ACCEPTANCE_SPEC.md](./FIRST_FUNCTION_ACCEPTANCE_SPEC.md) |
| [FIRST_FUNCTION_ACCEPTANCE_SPEC.md](./FIRST_FUNCTION_ACCEPTANCE_SPEC.md) — Спецификация приёмки первой функции YarnAI | Устанавливает объективные условия и процедуру итогового решения `GO` или `NO GO`. Содержательные нормы оставляет в шести документах своей обязательной нормативной основы. | SPECIFICATION | Да — единственное официальное процедурное основание выпуска первой функции | [FIRST_FUNCTION_COMPARISON.md](./FIRST_FUNCTION_COMPARISON.md), [KNITTING_MATH_CANON.md](./KNITTING_MATH_CANON.md), [CALCULATION_ENGINE_SPEC.md](./CALCULATION_ENGINE_SPEC.md), [FIRST_FUNCTION_ARCHITECTURE.md](./FIRST_FUNCTION_ARCHITECTURE.md), [FIRST_FUNCTION_IMPLEMENTATION_PLAN.md](./FIRST_FUNCTION_IMPLEMENTATION_PLAN.md), [FIRST_FUNCTION_TEST_PLAN.md](./FIRST_FUNCTION_TEST_PLAN.md) |

### 2.2. Действующие черновики с неоднозначным каноническим статусом

Эти документы содержательны и используются другими файлами как контекст, но сами имеют статус `Черновик`. До отдельного `OWNER REVIEW` они не считаются самостоятельными источниками истины; утверждённые фрагменты в них восходят к `D-001` или `D-002`.

| Документ | Где искать информацию | Статус | Источник истины | Логически связан |
|---|---|---|---|---|
| [PRODUCT_DNA.md](./PRODUCT_DNA.md) — PRODUCT DNA | Миссия, аудитория, ценность, продуктовые принципы и запреты версии 0.1. | SPECIFICATION | Нет; документ — черновик | [CANON.md](./CANON.md), [DECISIONS.md](./DECISIONS.md), исследовательские комплекты |
| [MVP.md](./MVP.md) — MVP | Сценарии и коммерческая граница MVP, включая применение `D-001` и `D-002`. | SPECIFICATION | Нет; `D-001` и `D-002` берутся из [DECISIONS.md](./DECISIONS.md) | [PRODUCT_DNA.md](./PRODUCT_DNA.md), [USER_STATES.md](./USER_STATES.md), [DECISION_ENGINE.md](./DECISION_ENGINE.md) |
| [USER_STATES.md](./USER_STATES.md) — USER STATES | Рабочая модель Intent, State и переходов между состояниями пользователя. | SPECIFICATION | Нет; утверждённые Intent восходят к `D-001` | [CANON.md](./CANON.md), [DECISIONS.md](./DECISIONS.md), [GLOSSARY.md](./GLOSSARY.md) |
| [GLOSSARY.md](./GLOSSARY.md) — GLOSSARY | Единый словарь терминов; отдельно помечает определения, закреплённые решениями, и `WORKING TERM`. | SPECIFICATION | Нет как документ в целом; статус отдельных терминов указан внутри | [DECISIONS.md](./DECISIONS.md), [DOMAIN_MODEL.md](./DOMAIN_MODEL.md), [USER_STATES.md](./USER_STATES.md) |
| [DOMAIN_MODEL.md](./DOMAIN_MODEL.md) — DOMAIN MODEL | Черновая предметная модель сущностей и смысловых связей, не являющаяся схемой БД или программной моделью. | ARCHITECTURE | Нет; документ — черновик | [GLOSSARY.md](./GLOSSARY.md), [DECISION_ENGINE.md](./DECISION_ENGINE.md), [MVP.md](./MVP.md) |
| [DECISION_ENGINE.md](./DECISION_ENGINE.md) — DECISION ENGINE | Рабочая последовательность принятия продуктовых решений во время сопровождения пользователя, без описания реализации. | SPECIFICATION | Нет; документ — черновик | [DECISIONS.md](./DECISIONS.md), [USER_STATES.md](./USER_STATES.md), [DOMAIN_MODEL.md](./DOMAIN_MODEL.md) |

### 2.3. Архитектурные и продуктовые предложения

Все документы в этом подразделе прямо обозначены как предложения, рабочие реестры или материалы для обсуждения. Они помогают найти проектные варианты, но не изменяют `CANON`, `DECISIONS` или канонический комплект первой функции.

| Документ | Назначение | Статус | Источник истины | Основные связи |
|---|---|---|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Предложение целевой предметной архитектуры и bounded contexts. | ARCHITECTURE | Нет | `CANON`, `DECISIONS`, архитектурные предложения |
| [ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md) | Рабочий реестр `ARD-001`—`ARD-030`; все карточки имеют статус `OPEN`. | DECISION | Нет | [ARCHITECTURE.md](./ARCHITECTURE.md), [ARCHITECTURE_REVIEW.md](./ARCHITECTURE_REVIEW.md), [ARCHITECTURE_RISKS.md](./ARCHITECTURE_RISKS.md) |
| [ARCHITECTURE_REVIEW.md](./ARCHITECTURE_REVIEW.md) | Самокритика и проверка предложенной целевой архитектуры. | ARCHITECTURE | Нет | [ARCHITECTURE.md](./ARCHITECTURE.md), [ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md) |
| [ARCHITECTURE_RISKS.md](./ARCHITECTURE_RISKS.md) | Реестр рисков исходной и предложенной архитектуры. | ARCHITECTURE | Нет | [ARCHITECTURE.md](./ARCHITECTURE.md), [ARCHITECTURE_REVIEW.md](./ARCHITECTURE_REVIEW.md) |
| [DATA_MODEL.md](./DATA_MODEL.md) | Предложение концептуальной модели данных и границ агрегатов. | ARCHITECTURE | Нет | [DOMAIN_MODEL.md](./DOMAIN_MODEL.md), [SYSTEM_COMPONENTS.md](./SYSTEM_COMPONENTS.md) |
| [SYSTEM_COMPONENTS.md](./SYSTEM_COMPONENTS.md) | Предложение границ и ответственности предметных подсистем. | ARCHITECTURE | Нет | [ARCHITECTURE.md](./ARCHITECTURE.md), [DATA_MODEL.md](./DATA_MODEL.md) |
| [PROJECT_LIFECYCLE.md](./PROJECT_LIFECYCLE.md) | Предлагаемый жизненный цикл Project. | ARCHITECTURE | Нет | [GARMENT_LIFECYCLE.md](./GARMENT_LIFECYCLE.md), [DATA_MODEL.md](./DATA_MODEL.md) |
| [GARMENT_LIFECYCLE.md](./GARMENT_LIFECYCLE.md) | Предлагаемое разделение определения изделия и физического экземпляра и их жизненных циклов. | ARCHITECTURE | Нет | [PROJECT_LIFECYCLE.md](./PROJECT_LIFECYCLE.md), [DATA_MODEL.md](./DATA_MODEL.md) |
| [MEMORY_ARCHITECTURE.md](./MEMORY_ARCHITECTURE.md) | Предложение архитектуры памяти, которая не владеет доменной истиной. | ARCHITECTURE | Нет | [ARCHITECTURE.md](./ARCHITECTURE.md), [SYSTEM_COMPONENTS.md](./SYSTEM_COMPONENTS.md) |
| [VISION_ARCHITECTURE.md](./VISION_ARCHITECTURE.md) | Предложение предметной архитектуры Computer Vision и цепочки проверки наблюдений. | ARCHITECTURE | Нет | [ARCHITECTURE.md](./ARCHITECTURE.md), [DATA_MODEL.md](./DATA_MODEL.md) |
| [FUTURE_ARCHITECTURE.md](./FUTURE_ARCHITECTURE.md) | Архитектурные горизонты эволюции без статуса roadmap или обязательства. | ARCHITECTURE | Нет | [ARCHITECTURE.md](./ARCHITECTURE.md), [SYSTEM_COMPONENTS.md](./SYSTEM_COMPONENTS.md) |
| [HOME_SCREEN_ARCHITECTURE_REVIEW.md](./HOME_SCREEN_ARCHITECTURE_REVIEW.md) | Ревизия гипотезы Home Screen вокруг текущего Intent и State. | ARCHITECTURE | Нет | [CANON.md](./CANON.md), [USER_STATES.md](./USER_STATES.md), [DECISIONS.md](./DECISIONS.md) |
| [LEARNING_ARCHITECTURE.md](./LEARNING_ARCHITECTURE.md) | Предложение архитектуры развития пользователя и доказательства навыков. | ARCHITECTURE | Нет | [LEARNING_PRINCIPLES.md](./LEARNING_PRINCIPLES.md), [LEARNING_PATHS.md](./LEARNING_PATHS.md), [SKILL_TREE.md](./SKILL_TREE.md) |
| [LEARNING_PRINCIPLES.md](./LEARNING_PRINCIPLES.md) | Предлагаемые принципы приобретения реальных навыков и их исследовательская база. | SPECIFICATION | Нет | [LEARNING_ARCHITECTURE.md](./LEARNING_ARCHITECTURE.md), [PROGRESSION.md](./PROGRESSION.md) |
| [LEARNING_PATHS.md](./LEARNING_PATHS.md) | Предлагаемая модель пересчитываемых путей развития. | ARCHITECTURE | Нет | [LEARNING_ARCHITECTURE.md](./LEARNING_ARCHITECTURE.md), [FIRST_PROJECTS.md](./FIRST_PROJECTS.md) |
| [PROGRESSION.md](./PROGRESSION.md) | Предложение прогрессии сложности, самостоятельности и поддержки. | SPECIFICATION | Нет | [LEARNING_PRINCIPLES.md](./LEARNING_PRINCIPLES.md), [SKILL_TREE.md](./SKILL_TREE.md) |
| [SKILL_TREE.md](./SKILL_TREE.md) | Предлагаемый граф навыков вязания спицами и зависимостей между ними. | ARCHITECTURE | Нет | [LEARNING_ARCHITECTURE.md](./LEARNING_ARCHITECTURE.md), [PROGRESSION.md](./PROGRESSION.md) |
| [FIRST_PROJECTS.md](./FIRST_PROJECTS.md) | Предлагаемые критерии выбора первых изделий как инструмента диагностики и мотивации. | PLAN | Нет | [LEARNING_PATHS.md](./LEARNING_PATHS.md), [MOTIVATION.md](./MOTIVATION.md) |
| [MOTIVATION.md](./MOTIVATION.md) | Предлагаемые мотивационные принципы и рискованные механики. | SPECIFICATION | Нет | [LEARNING_PRINCIPLES.md](./LEARNING_PRINCIPLES.md), [FIRST_PROJECTS.md](./FIRST_PROJECTS.md) |
| [LEARNING_REVIEW.md](./LEARNING_REVIEW.md) | Самокритика и последовательность проверки предложенной Learning System. | ARCHITECTURE | Нет | [LEARNING_ARCHITECTURE.md](./LEARNING_ARCHITECTURE.md), [LEARNING_RISKS.md](./LEARNING_RISKS.md) |
| [LEARNING_RISKS.md](./LEARNING_RISKS.md) | Реестр рисков Learning System и минимальных мер контроля. | ARCHITECTURE | Нет | [LEARNING_ARCHITECTURE.md](./LEARNING_ARCHITECTURE.md), [LEARNING_REVIEW.md](./LEARNING_REVIEW.md) |

### 2.4. Исследования и доказательная база

Исследовательские документы фиксируют источники, наблюдения, гипотезы и выводы. Они не являются нормативными источниками продуктовых или архитектурных решений.

#### Исследование готовых изделий и вопросов

| Документ | Где искать информацию | Статус | Источник истины | Связи |
|---|---|---|---|---|
| [01_sources.md](./01_sources.md) | Метод отбора и перечень источников корпуса. | RESEARCH | Нет | `02_posts`, `03_comments` |
| [02_posts.md](./02_posts.md) | Карточки исследованных публикаций. | RESEARCH | Нет | `01_sources`, `03_comments`, `06_missing_information` |
| [03_comments.md](./03_comments.md) | Корпус прямых предметных вопросов и доступных ответов. | RESEARCH | Нет | `02_posts`, `04_questions` |
| [04_questions.md](./04_questions.md) | Нормализованные вопросы и правило доказательности. | RESEARCH | Нет | `03_comments`, `05_intents` |
| [05_intents.md](./05_intents.md) | Классификация повторяющихся вопросов по Intent. | RESEARCH | Нет | `04_questions`, `USER_STATES` |
| [06_missing_information.md](./06_missing_information.md) | Анализ информации, которой не хватает в публикациях. | RESEARCH | Нет | `02_posts`, `03_comments` |
| [07_product_ideas.md](./07_product_ideas.md) | Продуктовые гипотезы, выведенные из повторяющихся вопросов; не список утверждённых функций. | RESEARCH | Нет | `05_intents`, `USER_STATES`, `MVP` |
| [08_summary.md](./08_summary.md) | Сводка корпуса, выводов, ограничений и предложений к дальнейшей проверке. | RESEARCH | Нет | `01_sources`—`07_product_ideas` |

#### Problem Validation: 15 июля 2026 года

| Документ | Где искать информацию | Статус | Источник истины | Связи |
|---|---|---|---|---|
| [01_EXECUTIVE_SUMMARY.md](./RESEARCH/PROBLEM_VALIDATION/2026-07-15_MARKET_PAINS/01_EXECUTIVE_SUMMARY.md) | Краткий итог метода, фактов, наблюдений, гипотез и рисков. | RESEARCH | Нет | Остальной комплект Problem Validation |
| [02_MARKET_EVIDENCE.md](./RESEARCH/PROBLEM_VALIDATION/2026-07-15_MARKET_PAINS/02_MARKET_EVIDENCE.md) | Рыночные свидетельства и ограничения их интерпретации. | RESEARCH | Нет | `01_EXECUTIVE_SUMMARY`, Product Concept |
| [03_REAL_USER_PROBLEMS.md](./RESEARCH/PROBLEM_VALIDATION/2026-07-15_MARKET_PAINS/03_REAL_USER_PROBLEMS.md) | Наблюдаемые пользовательские проблемы. | RESEARCH | Нет | `02_MARKET_EVIDENCE`, Product Concept |
| [04_PAYMENT_EVIDENCE.md](./RESEARCH/PROBLEM_VALIDATION/2026-07-15_MARKET_PAINS/04_PAYMENT_EVIDENCE.md) | Свидетельства готовности платить и ограничения выводов. | RESEARCH | Нет | `03_REAL_USER_PROBLEMS`, Product Concept |
| [05_EXISTING_SOLUTIONS.md](./RESEARCH/PROBLEM_VALIDATION/2026-07-15_MARKET_PAINS/05_EXISTING_SOLUTIONS.md) | Существующие решения и незакрытые области. | RESEARCH | Нет | `06_ARGUMENTS_AGAINST_YARNAI`, `07_WHAT_NOT_TO_BUILD` |
| [06_ARGUMENTS_AGAINST_YARNAI.md](./RESEARCH/PROBLEM_VALIDATION/2026-07-15_MARKET_PAINS/06_ARGUMENTS_AGAINST_YARNAI.md) | Контраргументы, риски и основания не принимать идею автоматически. | RESEARCH | Нет | `05_EXISTING_SOLUTIONS`, Product Concept |
| [07_OPEN_QUESTIONS.md](./RESEARCH/PROBLEM_VALIDATION/2026-07-15_MARKET_PAINS/07_OPEN_QUESTIONS.md) | Непроверенные вопросы исследования. | RESEARCH | Нет | Весь комплект Problem Validation |
| [FINAL_CONCLUSION.md](./RESEARCH/PROBLEM_VALIDATION/2026-07-15_MARKET_PAINS/FINAL_CONCLUSION.md) | Итоговые выводы о платёжной ценности и подтверждённых либо опровергнутых гипотезах. | RESEARCH | Нет | `01_EXECUTIVE_SUMMARY`—`07_OPEN_QUESTIONS` |

#### Product Concept from Market: 15 июля 2026 года

| Документ | Где искать информацию | Статус | Источник истины | Связи |
|---|---|---|---|---|
| [01_USERS.md](./RESEARCH/PRODUCT_CONCEPT/2026-07-15_PRODUCT_FROM_MARKET/01_USERS.md) | Исследовательская сегментация пользователей. | RESEARCH | Нет | Problem Validation, `02_PAINS` |
| [02_PAINS.md](./RESEARCH/PRODUCT_CONCEPT/2026-07-15_PRODUCT_FROM_MARKET/02_PAINS.md) | Карта дорогих и частых болей по жизненному циклу проекта. | RESEARCH | Нет | `01_USERS`, `03_PRODUCT` |
| [03_PRODUCT.md](./RESEARCH/PRODUCT_CONCEPT/2026-07-15_PRODUCT_FROM_MARKET/03_PRODUCT.md) | Продуктовая концепция, выведенная из исследованного спроса. | RESEARCH | Нет | Problem Validation, `04_FEATURES` |
| [04_FEATURES.md](./RESEARCH/PRODUCT_CONCEPT/2026-07-15_PRODUCT_FROM_MARKET/04_FEATURES.md) | Исследовательская приоритизация функций. | RESEARCH | Нет | `03_PRODUCT`, `06_MVP` |
| [05_COMPETITIVE_ADVANTAGE.md](./RESEARCH/PRODUCT_CONCEPT/2026-07-15_PRODUCT_FROM_MARKET/05_COMPETITIVE_ADVANTAGE.md) | Гипотезы конкурентных преимуществ. | RESEARCH | Нет | `03_PRODUCT`, `07_WHAT_NOT_TO_BUILD` |
| [06_MVP.md](./RESEARCH/PRODUCT_CONCEPT/2026-07-15_PRODUCT_FROM_MARKET/06_MVP.md) | Исследовательское предложение первой коммерческой версии; не заменяет корневой [MVP.md](./MVP.md) и `D-002`. | RESEARCH | Нет | `04_FEATURES`, [MVP.md](./MVP.md) |
| [07_WHAT_NOT_TO_BUILD.md](./RESEARCH/PRODUCT_CONCEPT/2026-07-15_PRODUCT_FROM_MARKET/07_WHAT_NOT_TO_BUILD.md) | Исследовательские анти-приоритеты. | RESEARCH | Нет | Problem Validation, `05_COMPETITIVE_ADVANTAGE` |
| [08_FUTURE.md](./RESEARCH/PRODUCT_CONCEPT/2026-07-15_PRODUCT_FROM_MARKET/08_FUTURE.md) | Долгосрочные возможности без статуса roadmap. | RESEARCH | Нет | `03_PRODUCT`, `06_MVP` |
| [FINAL_CONCLUSION.md](./RESEARCH/PRODUCT_CONCEPT/2026-07-15_PRODUCT_FROM_MARKET/FINAL_CONCLUSION.md) | Сводный продуктовый вывод из подтверждённого спроса. | RESEARCH | Нет | `01_USERS`—`08_FUTURE` |

#### Идеи

| Документ | Где искать информацию | Статус | Источник истины | Связи |
|---|---|---|---|---|
| [IDEAS/PLATFORM_VISION.md](./IDEAS/PLATFORM_VISION.md) | Долгосрочная концепция платформы для дизайнеров, преподавателей и других участников; не изменяет принятые решения. | RESEARCH | Нет | [PRODUCT_DNA.md](./PRODUCT_DNA.md), [FUTURE_ARCHITECTURE.md](./FUTURE_ARCHITECTURE.md) |

## 3. Иерархия и логические зависимости

Ниже показаны зависимости назначения, а не единый глобальный порядок приоритета. Общая жёсткая иерархия всех документов каноном не установлена.

```text
Проектный уровень

CANON ───────────────┐
                     ├──> продуктовые черновики и архитектурные предложения
APPROVED DECISIONS ──┘

Исследования ──> продуктовые гипотезы и предложения
               (исследования сами не утверждают решения)
```

Для первой функции зависимости определены точнее самими документами:

```text
FIRST_FUNCTION_COMPARISON (утверждённый выбор)
                         ┐
KNITTING_MATH_CANON ─────┴──> CALCULATION_ENGINE_SPEC
                                  ↓
                         FIRST_FUNCTION_ARCHITECTURE
                                  ↓
                      FIRST_FUNCTION_IMPLEMENTATION_PLAN
                                  ↓
                         FIRST_FUNCTION_TEST_PLAN
                                  ↓
                    FIRST_FUNCTION_ACCEPTANCE_SPEC
```

`FIRST_FUNCTION_ACCEPTANCE_SPEC.md` не стоит «выше» содержательных норм: он использует шесть документов нормативной основы и задаёт процедуру решения `GO` / `NO GO`.

## 4. Источники истины

Каноническими источниками информации в явно закреплённых областях являются:

1. [CANON.md](./CANON.md) — фундаментальные принципы YarnAI.
2. [DECISIONS.md](./DECISIONS.md) — только решения `D-001` и `D-002` со статусом `APPROVED`.
3. [FIRST_FUNCTION_COMPARISON.md](./FIRST_FUNCTION_COMPARISON.md) — утверждённый владельцем выбор первой функции и её продуктовая ценность.
4. [KNITTING_MATH_CANON.md](./KNITTING_MATH_CANON.md) — математическая истина для расчётов.
5. [CALCULATION_ENGINE_SPEC.md](./CALCULATION_ENGINE_SPEC.md) — нормативное поведение расчётного движка первой функции.
6. [FIRST_FUNCTION_ARCHITECTURE.md](./FIRST_FUNCTION_ARCHITECTURE.md) — архитектурные границы первой функции.
7. [FIRST_FUNCTION_IMPLEMENTATION_PLAN.md](./FIRST_FUNCTION_IMPLEMENTATION_PLAN.md) — обязательный объём и порядок реализации первой функции.
8. [FIRST_FUNCTION_TEST_PLAN.md](./FIRST_FUNCTION_TEST_PLAN.md) — обязательный порядок тестирования первой функции.
9. [FIRST_FUNCTION_ACCEPTANCE_SPEC.md](./FIRST_FUNCTION_ACCEPTANCE_SPEC.md) — официальная процедура решения о выпуске первой функции.

Не являются источниками истины: документы со статусами `Черновик`, `PROPOSAL FOR DISCUSSION`, `WORKING REGISTER`, `VISION / FUTURE CONCEPT`; записи решений со статусом `OPEN`; исследования; аудиты; исторические материалы; пустые служебные заготовки; настоящий индекс.

## 5. Архив и служебные документы

### 5.1. Документы исключительно исторической ценности

Файлы не перемещались и не удалялись.

| Документ | Историческая роль | Почему не является действующим источником истины |
|---|---|---|
| [ЭТАП_1/00_РАМКА_ЭТАПА.md](./ЭТАП_1/00_РАМКА_ЭТАПА.md) | Исходная рамка десятидневного выбора первой функции. | Фиксирует состояние до утверждения функции владельцем. |
| [ЭТАП_1/01_ОЦЕНКА_ФУНКЦИЙ.md](./ЭТАП_1/01_ОЦЕНКА_ФУНКЦИЙ.md) | Ранжирование первоначальных кандидатов. | Продуктовый выбор позднее зафиксирован в [FIRST_FUNCTION_COMPARISON.md](./FIRST_FUNCTION_COMPARISON.md). |
| [ЭТАП_1/02_ТРИ_ЛУЧШИХ_ВАРИАНТА.md](./ЭТАП_1/02_ТРИ_ЛУЧШИХ_ВАРИАНТА.md) | Три варианта до решения владельца. | Прямо утверждает, что выбор ещё не сделан; это состояние уже завершено. |
| [ЭТАП_1/03_ЛИСТ_РЕШЕНИЯ_ВЛАДЕЛЬЦА.md](./ЭТАП_1/03_ЛИСТ_РЕШЕНИЯ_ВЛАДЕЛЬЦА.md) | Незаполненный лист решения владельца. | Решение позднее явно зафиксировано в каноническом сравнении. |
| [FIRST_FUNCTION_DOCUMENT_AUDIT.md](./FIRST_FUNCTION_DOCUMENT_AUDIT.md) | Первичный аудит неполного на тот момент комплекта. | Его исходные замечания заменены результатом повторного аудита; документ не задаёт норм. |

### 5.2. Служебный аудит

[FIRST_FUNCTION_DOCUMENT_AUDIT_FINAL.md](./FIRST_FUNCTION_DOCUMENT_AUDIT_FINAL.md) фиксирует результат повторной проверки комплекта со статусом `PASS`. Это подтверждающий отчёт, а не нормативный документ и не источник новых правил.

### 5.3. Пустые служебные заготовки

Следующие существующие файлы имеют размер 0 байт и не включены в содержательную карту: [CHANGELOG.md](./CHANGELOG.md), [COMPETITORS.md](./COMPETITORS.md), [HYPOTHESES.md](./HYPOTHESES.md), [LEGAL.md](./LEGAL.md), [LESSONS.md](./LESSONS.md), [PROMPTS.md](./PROMPTS.md), [RESEARCH.md](./RESEARCH.md), [ROADMAP.md](./ROADMAP.md), [TODO.md](./TODO.md).

## 6. Неоднозначности, требующие OWNER REVIEW

Файлы `PRODUCT_DNA.md`, `MVP.md`, `USER_STATES.md`, `GLOSSARY.md`, `DOMAIN_MODEL.md` и `DECISION_ENGINE.md` используются как действующий контекст и содержат положения, связанные с `D-001` и `D-002`, но имеют собственный статус `Черновик`. Индекс не может без нового решения определить, являются ли они каноническими документами целиком.

До такого решения:

- источником утверждённых принципов остаются `CANON.md` и `APPROVED`-записи `DECISIONS.md`;
- черновики используются для навигации и контекста, но не для создания новых обязательных правил;
- предложения `PROPOSAL FOR DISCUSSION` и записи `OPEN` не считаются принятыми.

## 7. Проверка индекса

- Все явно канонические и нормативные документы проекта и все семь документов канонического комплекта первой функции присутствуют в индексе.
- Каждый физический файл представлен в одной основной категории; повторные упоминания являются только логическими связями.
- Ссылки индекса указывают только на существующие файлы каталога YarnAI.
- Архивные, служебные и пустые документы не включены в перечень источников истины.
- Индекс не меняет существующую архитектуру, `D-001`, `D-002` или другие решения и не создаёт новых правил проекта.

Итоговый статус: **MANUAL REVIEW REQUIRED** — требуется решение владельца о каноническом статусе шести действующих черновиков, перечисленных в разделе 6.

# Установка системы управления Yarn AI

## Цель

Эта система отделяет постоянные личные правила, правила репозитория, повторяемую процедуру, текущую правду, историю решений и учёт времени. Она не заменяет production-код и данные проектов.

## Семь основных документов

| № | Точный путь | Назначение |
|---:|---|---|
| 1 | `C:\Users\User\YarnAI\docs\project-control\INSTALLATION.md` | Полная схема установки, повторной установки и проверки. |
| 2 | `C:\Users\User\YarnAI\docs\project-control\SYSTEM_MAP.md` | Связи человеческих функций, программных блоков, источников истины и проверок. |
| 3 | `C:\Users\User\.codex\AGENTS.md` | Постоянные личные правила Евгения для Codex во всех проектах. |
| 4 | `C:\Users\User\YarnAI\docs\project-control\CHATGPT_PERSONALIZATION.md` | Проверяемая копия поля Custom instructions ChatGPT. |
| 5 | `C:\Users\User\YarnAI\AGENTS.md` | Короткие обязательные правила только для Yarn AI. |
| 6 | `C:\Users\User\YarnAI\.agents\skills\yarn-ai-workflow\SKILL.md` | Повторяемая процедура планирования, реализации, проверки и приёмки. |
| 7 | `C:\Users\User\YarnAI\docs\project-control\PROJECT_STATE.md` | Единственная текущая подтверждённая правда и ровно одна следующая задача. |

Ни один из семи документов не заменяется ссылкой, памятью модели или другим файлом.

## Обслуживающие файлы

- `C:\Users\User\YarnAI\.agent\PLANS.md` — стандарт живого ExecPlan.
- `C:\Users\User\YarnAI\.agents\skills\yarn-ai-workflow\agents\openai.yaml` — имя навыка в интерфейсе и разрешение неявного вызова.
- `C:\Users\User\YarnAI\.agents\skills\yarn-ai-workflow\references\project-canon.md` — канон и запреты продукта.
- `C:\Users\User\YarnAI\.agents\skills\yarn-ai-workflow\references\product-map.md` — человеческие функции и минимальные блоки.
- `C:\Users\User\YarnAI\.agents\skills\yarn-ai-workflow\references\block-workflow.md` — процедура одного блока.
- `C:\Users\User\YarnAI\.agents\skills\yarn-ai-workflow\references\acceptance.md` — пять уровней приёмки.
- `C:\Users\User\YarnAI\.agents\skills\yarn-ai-workflow\references\evidence-and-decisions.md` — классы фактов, решений и гипотез.
- `C:\Users\User\YarnAI\docs\project-control\DECISION_LOG.md` — история утверждённых решений.
- `C:\Users\User\YarnAI\docs\project-control\TIME_LEDGER.md` — время, переделки и доказательства результата.
- `C:\Users\User\YarnAI\docs\plans\` — один активный сложный план и завершённые планы.

## Активный CODEX_HOME

Переменная среды `CODEX_HOME` при установке не задана. Активен стандартный каталог:

`C:\Users\User\.codex`

В нём находятся глобальный `AGENTS.md`, существующий `config.toml` и локальная память Codex. До изменения конфигурации её SHA-256 был `5b9c734e0bf8c066a8b539a86f309e686b845cca3faee5c8ce8635dfca8139ec`; резервная копия создаётся как `C:\Users\User\.codex\config.toml.backup-20260829-project-control`.

## Порядок загрузки инструкций

1. При новом запуске Codex читает в активном `CODEX_HOME` первый непустой файл: сначала `AGENTS.override.md`, иначе `AGENTS.md`.
2. От Git-корня к текущему каталогу Codex читает по одному проектному файлу на каталог: `AGENTS.override.md`, затем `AGENTS.md`, затем настроенные fallback-имена. Ближайшая инструкция имеет приоритет.
3. Для Yarn AI корневой `AGENTS.md` требует сначала прочитать `PROJECT_STATE.md`.
4. Навыки из `.agents/skills` обнаруживаются автоматически по основной папке проекта. Полный `SKILL.md` загружается при явном `$yarn-ai-workflow` или подходящей задаче; reference-файлы читаются только по необходимости.
5. Активный `docs/plans/ACTIVE_*.md` читается только для связанной сложной работы.
6. Персонализация и память ChatGPT — отдельный слой веб-ChatGPT. Локальная память Codex также отдельна и не заменяет файлы проекта.

Codex собирает цепочку `AGENTS.md` один раз на запуск/сессию. После установки нужна новая задача Codex для окончательной проверки загрузки.

## Проверки

### Глобальный AGENTS.md

- Убедиться, что `C:\Users\User\.codex\AGENTS.override.md` отсутствует или сознательно заменяет базовый файл.
- Прочитать `C:\Users\User\.codex\AGENTS.md` и найти правило: «Любой готовый промпт для копирования выдаётся только одним цельным блоком кода».
- В новой задаче из `C:\Users\User\YarnAI` попросить Codex перечислить загруженные источники инструкций.

### Проектный AGENTS.md

- Проверить существование `C:\Users\User\YarnAI\AGENTS.md` и размер меньше 32 KiB.
- Убедиться, что он ссылается на `PROJECT_STATE.md`, навык и активный план, но не дублирует подробные references.

### Навык

- Проверить YAML frontmatter в `SKILL.md` штатным `quick_validate.py` из `skill-creator`.
- Проверить YAML `agents/openai.yaml`, значение `policy.allow_implicit_invocation: true` и наличие пяти reference-файлов.
- В новой задаче вызвать `$yarn-ai-workflow` явно; если изменение не появилось, перезапустить Codex.

### config.toml и память Codex

- Не перезаписывать `config.toml` целиком и не менять модель, reasoning, sandbox, approvals, MCP, плагины или секреты.
- В существующей секции `[features]` должно быть ровно одно `memories = true`.
- Сравнить остальные строки с резервной копией. Локальные файлы памяти не редактировать вручную.

### Персонализация и память ChatGPT

- Открыть `ChatGPT → Settings → Personalization`.
- Сравнить поле Custom instructions с блоком в `CHATGPT_PERSONALIZATION.md`.
- Закрыть настройки, открыть повторно и сравнить ещё раз.
- Убедиться, что Memory/«Включить память» включена; содержимое памяти не копировать в проектные правила.
- Computer History не включать. На установленной Windows-системе этот macOS-механизм не используется.

### Основная папка проекта

- В приложении проект `YarnAI` должен иметь путь `C:\Users\User\YarnAI` и определяться как Git-репозиторий.
- Если подключено несколько папок, открыть Edit project и убедиться, что именно этот путь помечен `Make primary` / основной.
- Из основной папки должны автоматически обнаруживаться корневой `AGENTS.md`, `.agents/skills`, проектный `.codex/config.toml` при его появлении и Git-корень.

## Безопасная повторная установка

1. Зафиксировать `git rev-parse HEAD`, `git status --short` и SHA-256 сырого `git status --porcelain=v1 -z`.
2. Определить активный `CODEX_HOME`; проверить `AGENTS.override.md` до изменения `AGENTS.md`.
3. Полностью прочитать все существующие файлы по путям этой системы.
4. Классифицировать утверждения как `FACT`, `DECISION`, `HYPOTHESIS`, `FANTASY` или `SUPERSEDED`.
5. Создать резервную копию изменяемого внешнего `config.toml`.
6. Содержательно объединять файлы; не удалять пользовательские данные и не переписывать исторические отчёты.
7. Не трогать production-код, IndexedDB, данные проектов и новые Stage.
8. Выполнить проверки YAML, ссылок, размеров, Git HEAD и различий рабочего дерева.
9. Проверить настройки ChatGPT после повторного открытия.
10. Начать новую задачу Codex для подтверждения фактической загрузки инструкций.

## Итоговые статусы

- `PASS`: все семь документов и обслуживающие файлы существуют; ChatGPT и основная папка фактически проверены; Codex в новой сессии видит инструкции и навык; production-код не изменён установкой.
- `PARTIAL`: файлы установлены правильно, но персонализация/основная папка или новая сессия Codex не проверены до конца.
- `FAIL`: обязательный документ отсутствует, документы противоречат друг другу, потеряны данные, изменён production-код установкой или постоянное правило промптов не записано.
- `BLOCKED`: внешняя система запрещает безопасное продолжение и после проверки нет безопасной альтернативы.

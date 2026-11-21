# Граница тестового хранилища Yarn AI

**Статус:** `PASS — ISOLATION ONLY`  
**Удаление production-данных:** не разрешено и не выполнялось.

## Каноническое production-хранилище

- Единственный основной пользовательский browser origin: `http://127.0.0.1:8000`.
- `http://localhost:8000`, другой hostname или другой порт — отдельный IndexedDB origin, а не alias пользовательского хранилища.
- IndexedDB: `yarnai-local`, schema version `4`.
- Реальные пользовательские проекты и платные pilot-запуски запрещено проводить на временных портах.
- Любая browser fixture Stage 70–91 обязана остановиться с `FIXTURE_PRODUCTION_STORAGE_FORBIDDEN` до создания `ProjectRepository` и до открытия IndexedDB.

## Разрешённые тестовые хранилища

- Node-тесты: только `fake-indexeddb`, отдельная память процесса; база удаляется до и после fixture-теста.
- Ручная browser fixture: только отдельный localhost origin, не равный canonical origin, в отдельном временном browser profile и только с явным query marker `testStorage=isolated`.
- Отдельный origin создаёт отдельное browser IndexedDB namespace даже при том же имени `yarnai-local`.
- Данные временного origin/profile не считаются пользовательским хранилищем и не становятся production-доказательством без отдельного exact переноса и обычной UI-приёмки на `127.0.0.1:8000`.

## Технический enforcement

- Общий guard определён в `stage70-happy-path-fixture.js` и вызывается до repository construction.
- Fixture-файлы Stage 71–91 вызывают тот же guard до собственного `new ProjectRepository()`.
- Структурный regression-test проверяет это для каждого Stage 71–91.
- `stage70-happy-path-fixture.test.cjs` включён в обычный `npm test`.

## Запрещено

- Запуск fixture на canonical origin.
- Browser fixture без `testStorage=isolated`.
- Использование production IndexedDB как тестовой базы.
- Создание реального пользовательского проекта или платного pilot-artifact на временном порту.
- Очистка fixture-проектов без отдельного утверждения cleanup manifest владельцем.

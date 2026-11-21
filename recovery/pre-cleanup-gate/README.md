# Pre-cleanup safety gate utility

Служебная recovery utility для read-only snapshot production IndexedDB,
targeted package ровно 17 fixture-проектов и restore rehearsal на отдельном
origin/database.

- В production database используются только `readonly` transactions.
- Delete и soft-delete production-проектов отсутствуют.
- Единственные `readwrite` transactions выполняются в уникальной rehearsal database.
- Package использует lossless codec из `../exact-project-handoff/core.mjs`.

Production origin:

```powershell
node .\server.mjs
```

Isolated origin задаётся через `PRE_CLEANUP_PORT`, а общий каталог результатов —
через `PRE_CLEANUP_OUTPUT`.

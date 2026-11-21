# Exact YarnAI project handoff utility

Служебная recovery utility для резервного копирования origin и переноса одного exact IndexedDB project aggregate через браузерный IndexedDB API.

- Не входит в production bundle Yarn AI.
- Не меняет IndexedDB schema и не запускает migration.
- Не читает и не редактирует LevelDB напрямую.
- Импорт выполняется через `add()` в одной `readwrite` transaction после read-only collision check.
- `backup` сохраняет все stores origin в lossless JSON envelope, включая Blob/File bytes.
- `verify-backup` повторно декодирует все records и сверяет schema/count/hash с текущим origin.
- `dry-run` не пишет в IndexedDB и фиксирует exact target baseline, collision result и добавляемые records.
- `import` разрешён только при совпадении текущего target с прошедшим dry-run и повторной collision check.

Запуск сервера:

```powershell
node .\server.mjs
```

Режимы страницы задаются query parameters: `inventory`, `backup`, `verify-backup`, `export`, `dry-run`, `import`, `verify`. Результаты сохраняются в `runs/<run>/` или в каталоге из `EXACT_HANDOFF_OUTPUT`.

# Pre-cleanup safety gate — 17 browser fixtures

**Проверено:** 2026-08-30 21:50 CEST  
**Verdict:** `PRE-CLEANUP SAFETY GATE: PASS`  
**Production records deleted:** `0`

## Четыре неучтённые записи

| Store | Primary key | Тип | Классификация | Почему вне Group A/B/C | Будущее действие |
|---|---|---|---|---|---|
| `meta` | `database_manifest` | object / `database_manifest` | global/system | описывает database, project ID отсутствует | сохранить |
| `meta` | `device_identity` | object / `device_identity` | global/system | идентичность локального устройства, project ID отсутствует | сохранить |
| `meta` | `device_sequence` | object / `device_sequence` | global/system | глобальная последовательность операций устройства, project ID отсутствует | сохранить |
| `settings` | `last-opened:guest:local` | object, revision `1` | global/system | настройка workspace, project ID отсутствует | сохранить |

Их точные encoded primary keys, timestamps и per-record hashes находятся в baseline snapshot. Orphan records среди этих четырёх нет.

## Production before / after

| Store | Before | After |
|---|---:|---:|
| calculations | 19 | 19 |
| checkpoints | 684 | 684 |
| meta | 3 | 3 |
| operations | 666 | 666 |
| pattern_file_blobs | 2 | 2 |
| pattern_files | 2 | 2 |
| progress | 223 | 223 |
| projects | 19 | 19 |
| settings | 1 | 1 |
| **Всего** | **1 619** | **1 619** |

- Baseline database logical hash: `e3716124f58121874f7fc3845f74d3ae0f1a4de35fd9560f008e5909e926702d`.
- Final database logical hash: `e3716124f58121874f7fc3845f74d3ae0f1a4de35fd9560f008e5909e926702d`.
- Дополнительный lossless hash до/после: `55bedf0be6cd3b1f75ac0a0c4345a26f49986b9280628fceb35bdc58e5ac9cfe`.
- Все 19 project ID/revision/stage/updated_at/aggregate hashes и полный per-record manifest совпали; новых fixture-проектов `0`.
- Live canonical `/saved-projects` показал ровно `19` карточек: `17` exact fixture headings, `1` Flax и `1` Stage 63. Повторный hash после этого UI-прохода снова совпал с baseline.

## Targeted recovery package

- Package: `recovery/pre-cleanup-gate/runs/pre-cleanup-20260830-package-v2/recovery-package.json`.
- Package file SHA-256: `fc8255c14afda082dbaace8cfabc4dd0eb654355a1ba3530c54821b4ad8574e9`.
- Package logical SHA-256: `31f5ab3da4f683c2918dd9841613631d820d81ac65d8b757571124d37bcc9414`.
- Manifest: `recovery/pre-cleanup-gate/runs/pre-cleanup-20260830-package-v2/recovery-manifest.json`.
- Manifest file SHA-256: `0aac444a742f848ff432b697389236ee1ea1bf84703dd807ae94cd7b10326d95`.
- Manifest logical SHA-256: `254199d8a241ada8b5b8056b9a7a2c3bb89b9f067cedf86210de0e30bcc72cfe`.
- Состав: exact `17 projects / 983 records`; `17 calculations / 381 checkpoints / 364 operations / 204 progress / 17 projects`.
- Targeted baseline-compatible hash: `8f7665cb1b87f0077ed4bef7e14dd9e32bc277d3becb46be62cd20207180f587`.
- Targeted lossless hash: `1467fa206d24bd6db17d737bea13695966dbd5325a9c42f4341c35a3ef128159`.
- Flax, Stage 63 и global/system records не входят в payload; они находятся только в read-only control manifest.

## Isolated restore rehearsal

- Origin: `http://127.0.0.1:8123`.
- Database: `yarnai-pre-cleanup-rehearsal-20260830-v2`.
- Initial result: `ISOLATED RESTORE PASS`.
- После закрытия страницы/database handle и нового открытия: `ISOLATED REOPEN VERIFY PASS`.
- В обоих проходах: exact `17 / 983`, те же IDs/store counts/revisions/stages/timestamps, все per-project manifests, per-record hashes и оба общих targeted hashes.
- Production origin/database после rehearsal полностью совпали с baseline.

## Protected controls

- Flax `01a04c4a-769d-7cc8-9d3a-bc8fcbbda06b`: revision `270`, stage `pattern_execution_plan_ready`, `559` records, aggregate `6099b4d0259a681cf4608a9a1d0bd4a67b5b9c0c2a7a745e52e643342b462546` — unchanged.
- Stage 63 `019fc3ba-4100-71c3-b7f9-bd06e3bff304`: revision `33`, stage `project_execution_next_step_clarification_completed`, `73` records, aggregate `23d52cdbbb484209f0568b1a459cb50e62ebe41f621dc66b0d62d6c2272aa972` — unchanged.

## Evidence paths

- Baseline: `recovery/pre-cleanup-gate/runs/pre-cleanup-20260830-baseline/production-snapshot.json`.
- Final after live UI: `recovery/pre-cleanup-gate/runs/pre-cleanup-20260830-final-after-ui/production-snapshot.json`.
- Restore: `recovery/pre-cleanup-gate/runs/pre-cleanup-20260830-rehearsal-v2/isolated-restore.json`.
- Reopen: `recovery/pre-cleanup-gate/runs/pre-cleanup-20260830-reopen-v2/isolated-reopen-verify.json`.

## Следующий допустимый шаг

Остановиться. Только после отдельного прямого разрешения Евгения можно ещё раз read-only сверить exact 17-ID manifest и production hash, затем выполнить только soft delete Group A. Permanent delete, cleanup других records и production import этим PASS не разрешены.

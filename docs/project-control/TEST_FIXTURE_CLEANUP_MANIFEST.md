# Манифест очистки fixture-проектов

**Статус:** `PRE-CLEANUP SAFETY GATE: PASS — AWAITING SEPARATE SOFT DELETE APPROVAL`  
**Составлен:** 2026-08-30 20:41 CEST  
**Production tuple:** Chrome `http://127.0.0.1:8000` → IndexedDB `yarnai-local` v4  
**Важно:** этот документ ничего не удаляет. Cleanup-код и destructive transaction не запускались.

## Read-only baseline и контроль после тестов

| Показатель | До исправления/тестов | После focused + full Node + full Python + build |
|---|---:|---:|
| Проекты | 19 | 19 |
| Все записи | 1 619 | 1 619 |
| calculations | 19 | 19 |
| checkpoints | 684 | 684 |
| meta | 3 | 3 |
| operations | 666 | 666 |
| pattern_file_blobs | 2 | 2 |
| pattern_files | 2 | 2 |
| progress | 223 | 223 |
| projects | 19 | 19 |
| settings | 1 | 1 |
| Schema hash | `f441b4f972c7a457c6e2c1dcf75813fdc59f0622d35d8f2a9abb78f1ae2c76a5` | тот же |
| Database logical hash | `e3716124f58121874f7fc3845f74d3ae0f1a4de35fd9560f008e5909e926702d` | тот же в исходном baseline/final audit; дополнительный финальный read-only проход подтвердил те же counts и все 19 identity/revision/stage/updated_at |

## Pre-cleanup safety gate — 2026-08-30 21:45 CEST

- Production baseline и final полностью совпали: live `/saved-projects` показал `19` карточек (`17` fixtures + Flax + Stage 63); `19` projects / `1 619` records, все store counts, все 19 identity/revision/stage/updated_at/aggregate hash и полный record manifest. Последний hash снят после UI-прохода.
- Арифметический остаток `4` объяснён: `meta/database_manifest`, `meta/device_identity`, `meta/device_sequence`, `settings/last-opened:guest:local`. Все четыре — global/system records без project affiliation; orphan records нет; они не входят в Group A/B/C и должны сохраниться.
- Targeted package содержит только 17 exact Group A IDs и `983` records (`17 calculations / 381 checkpoints / 364 operations / 204 progress / 17 projects`). Flax, Stage 63 и четыре global records находятся только в read-only control manifest.
- Package: `recovery/pre-cleanup-gate/runs/pre-cleanup-20260830-package-v2/recovery-package.json`; file SHA-256 `fc8255c14afda082dbaace8cfabc4dd0eb654355a1ba3530c54821b4ad8574e9`; package logical SHA-256 `31f5ab3da4f683c2918dd9841613631d820d81ac65d8b757571124d37bcc9414`.
- Отдельный manifest: `recovery/pre-cleanup-gate/runs/pre-cleanup-20260830-package-v2/recovery-manifest.json`; file SHA-256 `0aac444a742f848ff432b697389236ee1ea1bf84703dd807ae94cd7b10326d95`; logical SHA-256 `254199d8a241ada8b5b8056b9a7a2c3bb89b9f067cedf86210de0e30bcc72cfe`.
- Isolated restore/reopen: origin `http://127.0.0.1:8123`, database `yarnai-pre-cleanup-rehearsal-20260830-v2`; exact `17 / 983`; baseline-compatible targeted hash `8f7665cb1b87f0077ed4bef7e14dd9e32bc277d3becb46be62cd20207180f587`; lossless hash `1467fa206d24bd6db17d737bea13695966dbd5325a9c42f4341c35a3ef128159`.
- Production records deleted: `0`. Следующий допустимый шаг — только отдельное прямое разрешение Евгения на soft delete Group A после ещё одной exact revalidation.

## Группа A — PROVEN FIXTURE, кандидат на удаление только после утверждения

Классификация доказана совокупностью признаков: точное title из `seedStage70HappyPath`, UUID-v7, последовательная Stage 70+ lineage, соответствующие progress kinds и отсутствие пользовательских файлов. Обозначения counts: `calc/checkpoint/operation/progress/project`; все timestamps UTC.

| Project ID | Stage | Rev | Created → Updated | Counts / всего | Aggregate SHA-256 |
|---|---|---:|---|---:|---|
| `019fe040-4ff8-7533-b8e4-66f4e800d04a` | `foundation_section_preparation_completed` | 12 | `2026-08-08T07:22:19.000Z` → `07:31:27.930Z` | `1/13/12/8/1` / 35 | `1ea82829f6c2c3995be9ca90239f59e9fe1cddcaf978c0e9dcadcb48daf9fd7d` |
| `019fe074-0c15-764c-b8aa-5f8934d80395` | `foundation_section_execution_active` | 22 | `2026-08-08T08:18:49.493Z` → `08:44:50.016Z` | `1/23/22/9/1` / 56 | `8bbb690e278ceaa483682c78a2cbf7e3ce47e4c1a33695c98820a2d50a671b28` |
| `019fe0a2-aea6-7a8e-ad36-261c71de8239` | `foundation_section_measurement_target_reached` | 23 | `2026-08-08T09:09:45.765Z` → `09:17:12.802Z` | `1/24/23/11/1` / 60 | `29f7fc9e7d064eb79ca9e0bdaaee28179a96357229a6a9fb260d3dfc296cafcb` |
| `019fe0b5-4342-76b7-93d0-f247c6902d5b` | `foundation_section_measurement_target_reached` | 23 | `2026-08-08T09:30:03.458Z` → `09:30:53.332Z` | `1/24/23/11/1` / 60 | `2a1fad09dbf5436ae71887624a1b22b4436bb0ba12e3ad85968f81483d5cd744` |
| `019fe0be-0744-74cd-b233-61c59579d695` | `foundation_section_measurement_collecting` | 16 | `2026-08-08T09:39:37.924Z` → `09:39:38.749Z` | `1/17/16/10/1` / 45 | `5690d33b9d9f44ddfbb94c81873af402ce52af0fc39bcdbc962f808aa6a02dad` |
| `019fe0be-5e28-76cb-9394-c6b8a6156795` | `foundation_section_measurement_target_reached` | 21 | `2026-08-08T09:40:00.168Z` → `09:42:40.990Z` | `1/22/21/11/1` / 56 | `a0785329c0475d8f81ac98769fb113e4ef229e98305d61e2efccc7dc45a2cce0` |
| `019fe0df-fb7d-719e-a6f3-efe0ebc83789` | `foundation_section_measurement_target_reached` | 17 | `2026-08-08T10:16:43.132Z` → `10:17:45.098Z` | `1/18/17/10/1` / 47 | `ccc986e8179a203957b4a2cf4c23795cf529a7e438d8dcf13690c1b9b9bab2b0` |
| `019fe1ea-ecf8-7822-a625-99118a76036d` | `primary_fabric_preparation_completed` | 18 | `2026-08-08T15:08:17.528Z` → `15:10:56.745Z` | `1/19/18/11/1` / 50 | `e916099ef87b8e5ca45a6fd14194502cfbeb5bc4bdfa91c8ea64f200a9dec6cd` |
| `019fe1fe-849c-7b38-acac-536601506387` | `primary_fabric_preparation_completed` | 18 | `2026-08-08T15:29:41.532Z` → `15:30:51.491Z` | `1/19/18/11/1` / 50 | `438b1572d60bafe2ba2ec6ed2153a25ddbf56f24a00cca74c4e94d4afc6397b3` |
| `019fe20d-f70d-754a-b34c-030b5970317d` | `primary_fabric_execution_active` | 22 | `2026-08-08T15:46:33.869Z` → `15:48:24.180Z` | `1/23/22/12/1` / 59 | `8c3a41d8af9f11b8c5f8f0f21b8ed6c143b0ccadddbf16bb938d37670b99fdf8` |
| `019fe227-48b2-7815-8b72-a4757ffb269d` | `primary_fabric_execution_paused` | 21 | `2026-08-08T16:14:13.170Z` → `16:15:35.145Z` | `1/22/21/12/1` / 57 | `5c28e0b26962fa74ef15fa5948ead97755a56c364e1d6530d55328d378ed1c1f` |
| `019fe228-ee8c-766e-883e-26687b40f2c5` | `primary_fabric_measurement_target_reached` | 27 | `2026-08-08T16:16:01.164Z` → `16:17:31.623Z` | `1/28/27/14/1` / 71 | `cd629c2a24e0a3561cce83e2221668cce6ad6a14e2337930e5cf6b1abccacf3b` |
| `019fe22a-fc75-7ba4-8473-78beeda58631` | `primary_fabric_measurement_target_reached` | 23 | `2026-08-08T16:18:15.797Z` → `16:18:20.103Z` | `1/24/23/13/1` / 62 | `1d3a4362f6de1e910671bc4684ed2f8b43a5c14edb3147b6698192e189ec3b90` |
| `019fe24d-7e01-788b-a7ee-56ddc3d4343e` | `next_section_direction_confirmed` | 24 | `2026-08-08T16:55:57.185Z` → `16:57:31.080Z` | `1/25/24/14/1` / 65 | `806eb716639b2887e2f72f86eec4bd31056ecefc8f4c7070103529d5ccd43169` |
| `019fe252-3855-7d6e-a199-4816000210a5` | `construction_strategy_confirmed` | 25 | `2026-08-08T17:01:07.028Z` → `17:02:14.913Z` | `1/26/25/15/1` / 68 | `626b88d8225e50c073b824d3680c757fdfefce37f9a80f303c9476fb271ba944` |
| `019fe266-b954-7708-9bdf-17b79aa1b308` | `construction_strategy_confirmed` | 25 | `2026-08-08T17:23:30.772Z` → `17:25:06.720Z` | `1/26/25/15/1` / 68 | `0925384515a757ff43bcbe5fdee50b09da525539577feb9b32836f0f2e67f950` |
| `019fe268-86d7-77fe-be9a-b5db56254a4d` | `sleeve_target_geometry_ready_to_collect` | 27 | `2026-08-08T17:25:28.918Z` → `2026-08-30T01:50:25.486Z` | `1/28/27/17/1` / 74 | `3b4b0bc3a7d8e0b55f643ad8f824baa8c5ae417e4c2553c73a5d29d8ace9b6dd` |
| **Итого A** | 17 проектов |  |  | **`17/381/364/204/17` / 983** |  |

Все 17 имеют точное title `Stage 70 happy-path manual fixture`. Ни один не содержит `pattern_files`, `pattern_file_blobs`, `photos` или `photo_blobs`.

## Группа B — PROTECTED, не удалять

| Project ID | Title | Stage / rev | Records | Aggregate SHA-256 | Основание |
|---|---|---|---:|---|---|
| `01a04c4a-769d-7cc8-9d3a-bc8fcbbda06b` | Flax (exact control project) | `pattern_execution_plan_ready` / 270 | 559 | `6099b4d0259a681cf4608a9a1d0bd4a67b5b9c0c2a7a745e52e643342b462546` | Пользовательский exact project; включает 2 pattern files и 2 PDF-backed blobs; physical progress не изменён. |

## Группа C — AMBIGUOUS, не удалять

| Project ID | Title | Stage / rev | Created → Updated | Records | Aggregate SHA-256 | Почему не доказано |
|---|---|---|---|---:|---|---|
| `019fc3ba-4100-71c3-b7f9-bd06e3bff304` | `Stage 63 — контрольный образец` | `project_execution_next_step_clarification_completed` / 33 | `2026-08-03T08:06:00.000Z` → `2026-08-04T06:27:21.908Z` | 73 | `23d52cdbbb484209f0568b1a459cb50e62ebe41f621dc66b0d62d6c2272aa972` | Exact ID встречается в test source, но title и запись не связываются однозначно с browser fixture session. Совпадения недостаточно для удаления. |

## Что будет удалено при отдельном утверждённом cleanup

Только Group A: 17 project records и связанные 17 calculations, 381 checkpoints, 364 operations и 204 progress records — всего 983 текущие записи. Group B и Group C не входят в scope.

Production repository требует двух явных шагов на каждый ID: `softDeleteProject(projectId)`, затем `permanentlyDeleteProject(projectId, { confirmed: true })`. Permanent delete выполняет project-scoped transaction и добавляет/обновляет `meta` tombstone для удалённого project ID. Поэтому ожидаемый post-cleanup total должен учитывать 17 tombstones; это не «минус 983 без остатка».

## Revalidation и recovery перед cleanup

1. Повторно получить read-only inventory и потребовать точное совпадение всех 17 ID, revision, stage и aggregate hash с Group A.
2. Потребовать неизменность Group B и Group C и отсутствие новых ambiguous records.
3. До первой write transaction создать и проверить recoverable backup. Известный target-before rollback содержит те же 17 fixture IDs и их связанный inventory, но индивидуальный project-level restore после cleanup отдельно не испытан; значит restore нельзя объявлять доказанным без rehearsal.
4. При любом mismatch остановиться без удаления.
5. После утверждённого cleanup доказать: Group A отсутствует; Group B и C byte-semantic unchanged; schema/health/reload/list/reopen PASS.

## Риск и точка утверждения

Риск: `HIGH` из-за безвозвратного production delete и отсутствия уже испытанного индивидуального restore для каждого кандидата. Safe scope узкий и доказан, но выполнение запрещено до отдельного явного решения Евгения.

Следующее допустимое состояние: `APPROVED FOR CLEANUP` только после прямого утверждения этого манифеста. Текущее состояние остаётся `AWAITING USER APPROVAL FOR CLEANUP`.

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).parents[2]
STATIC = ROOT / "src" / "yarnai" / "static"


def test_saved_projects_exposes_human_first_full_backup_flow() -> None:
    html = (STATIC / "first-user-flow.html").read_text(encoding="utf-8")
    controller = (STATIC / "user-workspace-entry-assistant.js").read_text(
        encoding="utf-8"
    )

    assert "Скачать полную резервную копию" in controller
    assert "Включает проект, исходный PDF и связанные файлы" in controller
    assert "Проверить резервную копию" in html
    assert "Выберите файл резервной копии" in html
    assert "Восстановить и проверить в изолированной среде" in html
    assert "Технические данные" in html
    assert 'id="backup-file-input"' in html
    assert 'id="backup-isolated-restore"' in html
    assert 'id="backup-reload-open"' in html


def test_backup_assistant_validates_before_explicit_isolated_restore() -> None:
    assistant = (STATIC / "project-backup-assistant.js").read_text(
        encoding="utf-8"
    )

    validation = assistant.index("await backup.validateFullBackup(file)")
    explicit_action = assistant.index(
        'ui.restore.addEventListener("click", beginIsolatedRestore)'
    )
    restore = assistant.index("await backup.restoreFullBackup")
    assert explicit_action < validation < restore
    assert "backup.isolatedOriginFor(globalObject.location.origin)" in assistant
    assert "backup.assertIsolatedOrigin" in assistant
    assert 'type: "YARNAI_FULL_BACKUP_TRANSFER_V1"' in assistant
    assert "Основной Chrome" in assistant
    assert "importProject" not in assistant


def test_backup_core_keeps_exact_project_closure_and_forbids_canonical_target() -> None:
    core = (STATIC / "project-backup.js").read_text(encoding="utf-8")

    for store in (
        "projects",
        "calculations",
        "progress",
        "operations",
        "checkpoints",
        "photos",
        "photo_blobs",
        "pattern_files",
        "pattern_file_blobs",
    ):
        assert f'"{store}"' in core
    assert 'const FORMAT = "yarnai-full-project-backup"' in core
    assert 'const FORMAT_VERSION = 1' in core
    assert "BACKUP_CANONICAL_RESTORE_FORBIDDEN" in core
    assert "BACKUP_BINARY_CHECKSUM_MISMATCH" in core
    assert "BACKUP_FOREIGN_PROJECT_RECORD" in core
    assert "BACKUP_FORBIDDEN_KEY" in core
    assert "binary_omitted" in core
    assert 'database.transaction(RECORD_STORES, "readwrite")' in core
    assert "transaction.objectStore(store).add(record)" in core
    assert "importProject" not in core

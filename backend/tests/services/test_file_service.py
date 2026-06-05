"""
Tests for the File Service module.

Covers:
  - Project creation: directory layout, file contents, name validation
  - Project open: load, validation, format-version check, error handling
  - Project save: atomic write, roundtrip, failure handling
  - Auto-save: file creation, rotation (keep last 5), error on no project
  - Crash recovery: check_auto_save detection
  - Export .sysml2 text
  - Edge cases: illegal names, missing paths, bad JSON, missing fields
"""

from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path
from unittest import mock

import pytest

from app.services.file_service import (
    FORMAT_VERSION,
    AUTO_SAVE_DIR_NAME,
    AUTO_SAVE_MAX_COUNT,
    EXPORTS_DIR_NAME,
    FileService,
    FileServiceError,
    InvalidProjectNameError,
    InvalidProjectFileError,
    ProjectNotFoundError,
    SaveError,
    NoProjectLoadedError,
    ProjectData,
    ProjectMetadata,
)


# =============================================================================
#  Fixtures
# =============================================================================


@pytest.fixture
def service() -> FileService:
    """Return a fresh FileService instance."""
    return FileService()


@pytest.fixture
def tmp_dir() -> str:
    """Create a temporary directory for tests; cleaned up after each test."""
    with tempfile.TemporaryDirectory() as td:
        yield td


# =============================================================================
#  Helpers
# =============================================================================


def _make_project_data(name: str = "TestProject") -> ProjectData:
    """Build a minimal ProjectData for tests."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    meta = ProjectMetadata(
        name=name,
        created=now,
        modified=now,
        version=FORMAT_VERSION,
    )
    return ProjectData(
        metadata=meta,
        semantic_model={
            "id": "",
            "name": name,
            "elements": [
                {
                    "id": "elem-1",
                    "name": "Engine",
                    "type": "PartDefinition",
                    "ownerId": None,
                    "qualifiedName": "Engine",
                    "shortName": None,
                    "description": "A car engine",
                    "properties": {},
                },
            ],
            "relationships": [],
            "packages": [],
        },
        canvas_model={"diagrams": []},
    )


# =============================================================================
#  Test: ProjectMetadata
# =============================================================================


class TestProjectMetadata:
    """Tests for the ProjectMetadata dataclass."""

    def test_create_metadata(self) -> None:
        meta = ProjectMetadata(
            name="MyProject",
            created="2026-01-01T00:00:00Z",
            modified="2026-01-02T00:00:00Z",
            version="1.0",
        )
        assert meta.name == "MyProject"
        assert meta.created == "2026-01-01T00:00:00Z"
        assert meta.modified == "2026-01-02T00:00:00Z"
        assert meta.version == "1.0"

    def test_metadata_repr(self) -> None:
        meta = ProjectMetadata(
            name="P", created="c", modified="m", version="v"
        )
        assert "P" in repr(meta)


# =============================================================================
#  Test: ProjectData serialization
# =============================================================================


class TestProjectData:
    """Tests for ProjectData to_dict / from_dict roundtrip."""

    def test_roundtrip_to_from_dict(self) -> None:
        data = _make_project_data()
        d = data.to_dict()

        assert d["formatVersion"] == FORMAT_VERSION
        assert d["metadata"]["name"] == "TestProject"
        assert "semanticModel" in d
        assert "canvasModel" in d
        assert d["semanticModel"]["elements"][0]["name"] == "Engine"

        # Reconstruct
        restored = ProjectData.from_dict(d)
        assert restored.metadata.name == data.metadata.name
        assert restored.metadata.version == data.metadata.version
        assert restored.semantic_model == data.semantic_model
        assert restored.canvas_model == data.canvas_model

    def test_from_dict_missing_fields(self) -> None:
        """from_dict should handle missing optional sub-keys gracefully."""
        minimal = {
            "formatVersion": "1.0",
            "metadata": {"name": "X", "created": "", "modified": "", "version": "1.0"},
            "semanticModel": {},
            "canvasModel": {},
        }
        pd = ProjectData.from_dict(minimal)
        assert pd.metadata.name == "X"
        assert pd.semantic_model == {}
        assert pd.canvas_model == {}

    def test_from_dict_with_dir_path(self) -> None:
        data = _make_project_data()
        d = data.to_dict()
        pd = ProjectData.from_dict(d, dir_path="/some/dir")
        assert pd._dir_path == "/some/dir"


# =============================================================================
#  Test: create_project
# =============================================================================


class TestCreateProject:
    """Tests for FileService.create_project."""

    def test_create_directory_layout(self, service: FileService, tmp_dir: str) -> None:
        """create_project must create all expected files and directories."""
        result = service.create_project(tmp_dir, "MyModel")

        project_dir = Path(tmp_dir) / "MyModel"
        assert project_dir.is_dir()

        proj_file = project_dir / "MyModel.sysml2proj"
        assert proj_file.is_file()

        model_file = project_dir / "model.sysml2"
        assert model_file.is_file()

        auto_save_dir = project_dir / AUTO_SAVE_DIR_NAME
        assert auto_save_dir.is_dir()

        exports_dir = project_dir / EXPORTS_DIR_NAME
        assert exports_dir.is_dir()

        # Verify return type
        assert isinstance(result, ProjectData)
        assert result.metadata.name == "MyModel"

    def test_create_project_data_content(self, service: FileService, tmp_dir: str) -> None:
        """The .sysml2proj file must be valid JSON with the expected structure."""
        result = service.create_project(tmp_dir, "TestProj")

        proj_file = Path(tmp_dir) / "TestProj" / "TestProj.sysml2proj"
        with open(str(proj_file), "r", encoding="utf-8") as fh:
            raw = json.load(fh)

        assert raw["formatVersion"] == FORMAT_VERSION
        assert raw["metadata"]["name"] == "TestProj"
        assert "created" in raw["metadata"]
        assert "modified" in raw["metadata"]
        assert "semanticModel" in raw
        assert "canvasModel" in raw

    def test_create_empty_model_sysml2(self, service: FileService, tmp_dir: str) -> None:
        """model.sysml2 should be empty for a newly created project."""
        service.create_project(tmp_dir, "Empty")

        model_file = Path(tmp_dir) / "Empty" / "model.sysml2"
        content = model_file.read_text(encoding="utf-8")
        assert content == ""

    def test_create_project_sets_current_dir(self, service: FileService, tmp_dir: str) -> None:
        """After create, the service should remember the project directory."""
        service.create_project(tmp_dir, "Tracked")
        assert service._current_project_dir is not None
        assert "Tracked" in str(service._current_project_dir)

    # ---- name validation ----

    @pytest.mark.parametrize("bad_char", ["<", ">", ":", '"', "/", "\\", "|", "?", "*"])
    def test_illegal_characters(self, service: FileService, tmp_dir: str, bad_char: str) -> None:
        """Names with illegal characters must raise InvalidProjectNameError."""
        with pytest.raises(InvalidProjectNameError):
            service.create_project(tmp_dir, f"bad{bad_char}name")

    def test_empty_name(self, service: FileService, tmp_dir: str) -> None:
        with pytest.raises(InvalidProjectNameError):
            service.create_project(tmp_dir, "")

    def test_whitespace_only_name(self, service: FileService, tmp_dir: str) -> None:
        with pytest.raises(InvalidProjectNameError):
            service.create_project(tmp_dir, "   ")

    def test_control_character_name(self, service: FileService, tmp_dir: str) -> None:
        with pytest.raises(InvalidProjectNameError):
            service.create_project(tmp_dir, "bad\x00name")

    # ---- path validation ----

    def test_dir_path_not_exist(self, service: FileService) -> None:
        with pytest.raises(ProjectNotFoundError, match="does not exist"):
            service.create_project("/nonexistent/path/12345", "Test")

    def test_dir_path_is_file(self, service: FileService, tmp_dir: str) -> None:
        """dir_path must be a directory, not a file."""
        file_path = Path(tmp_dir) / "some_file.txt"
        file_path.write_text("hello")
        with pytest.raises(ProjectNotFoundError, match="not a directory"):
            service.create_project(str(file_path), "Test")


# =============================================================================
#  Test: open_project
# =============================================================================


class TestOpenProject:
    """Tests for FileService.open_project."""

    def test_open_after_create_roundtrip(self, service: FileService, tmp_dir: str) -> None:
        """Open should return data identical to what was created."""
        created = service.create_project(tmp_dir, "Roundtrip")

        proj_file = Path(tmp_dir) / "Roundtrip" / "Roundtrip.sysml2proj"
        opened = service.open_project(str(proj_file))

        assert opened.metadata.name == created.metadata.name
        assert opened.metadata.version == created.metadata.version
        assert opened.semantic_model == created.semantic_model
        assert opened.canvas_model == created.canvas_model

    def test_open_sets_current_dir(self, service: FileService, tmp_dir: str) -> None:
        """After open, the service should remember the project directory."""
        service.create_project(tmp_dir, "OpenTrack")

        proj_file = Path(tmp_dir) / "OpenTrack" / "OpenTrack.sysml2proj"
        # Use a fresh service to simulate "new session"
        svc2 = FileService()
        svc2.open_project(str(proj_file))

        assert svc2._current_project_dir is not None
        assert "OpenTrack" in str(svc2._current_project_dir)

    def test_open_nonexistent_file(self, service: FileService) -> None:
        with pytest.raises(ProjectNotFoundError, match="not found"):
            service.open_project("/nonexistent/project.sysml2proj")

    def test_open_path_is_dir(self, service: FileService, tmp_dir: str) -> None:
        """open_project on a directory should raise InvalidProjectFileError."""
        with pytest.raises(InvalidProjectFileError, match="not a file"):
            service.open_project(tmp_dir)

    def test_open_invalid_json(self, service: FileService, tmp_dir: str) -> None:
        """Malformed JSON must produce InvalidProjectFileError."""
        junk_path = Path(tmp_dir) / "junk.sysml2proj"
        junk_path.write_text("this is not json{{{", encoding="utf-8")

        with pytest.raises(InvalidProjectFileError, match="Invalid JSON"):
            service.open_project(str(junk_path))

    def test_open_missing_top_field(self, service: FileService, tmp_dir: str) -> None:
        """A JSON file missing a required top-level key must be rejected."""
        partial = {
            "formatVersion": "1.0",
            "metadata": {"name": "X", "created": "", "modified": "", "version": "1.0"},
            # missing "semanticModel"
            "canvasModel": {},
        }
        bad_path = Path(tmp_dir) / "partial.sysml2proj"
        bad_path.write_text(json.dumps(partial), encoding="utf-8")

        with pytest.raises(InvalidProjectFileError, match="Missing required field"):
            service.open_project(str(bad_path))

    def test_open_missing_metadata_field(self, service: FileService, tmp_dir: str) -> None:
        """A JSON file missing a metadata sub-key must be rejected."""
        partial = {
            "formatVersion": "1.0",
            "metadata": {"name": "X"},
            # missing created, modified, version
            "semanticModel": {},
            "canvasModel": {},
        }
        bad_path = Path(tmp_dir) / "badmeta.sysml2proj"
        bad_path.write_text(json.dumps(partial), encoding="utf-8")

        with pytest.raises(InvalidProjectFileError, match="Missing required metadata field"):
            service.open_project(str(bad_path))

    def test_open_different_format_version(self, service: FileService, tmp_dir: str) -> None:
        """Opening a file with a different format version should still
        succeed (version mismatch is non-fatal, caller should warn)."""
        svc = FileService()
        svc.create_project(tmp_dir, "OldVer")

        proj_file = Path(tmp_dir) / "OldVer" / "OldVer.sysml2proj"

        # Manually rewrite with a different formatVersion
        with open(str(proj_file), "r", encoding="utf-8") as fh:
            raw = json.load(fh)
        raw["formatVersion"] = "0.5"
        with open(str(proj_file), "w", encoding="utf-8") as fh:
            json.dump(raw, fh, indent=2)

        # Should NOT raise (non-fatal)
        result = svc.open_project(str(proj_file))
        assert result.metadata.version == "0.5"


# =============================================================================
#  Test: save_project
# =============================================================================


class TestSaveProject:
    """Tests for FileService.save_project (atomic save)."""

    def test_save_updates_modified_timestamp(self, service: FileService, tmp_dir: str) -> None:
        """saving must update metadata.modified."""
        proj = service.create_project(tmp_dir, "TimestampTest")
        original_modified = proj.metadata.modified

        proj_file = Path(tmp_dir) / "TimestampTest" / "TimestampTest.sysml2proj"

        import time
        time.sleep(0.01)  # ensure timestamp changes

        service.save_project(str(proj_file), proj)

        # Reload and check
        reopened = service.open_project(str(proj_file))
        assert reopened.metadata.modified != original_modified

    def test_save_open_roundtrip(self, service: FileService, tmp_dir: str) -> None:
        """Save with complex data → open → data must be identical."""
        proj = service.create_project(tmp_dir, "RoundtripSave")
        proj_file = Path(tmp_dir) / "RoundtripSave" / "RoundtripSave.sysml2proj"

        # Add complex data
        data = _make_project_data("RoundtripSave")
        data.semantic_model["elements"].append({
            "id": "elem-2",
            "name": "Wheel",
            "type": "PartUsage",
            "ownerId": None,
            "qualifiedName": "Wheel",
            "shortName": None,
            "description": "",
            "properties": {"definitionRef": "Engine"},
        })
        data.semantic_model["relationships"].append({
            "id": "rel-1",
            "type": "Connection",
            "name": "conn1",
            "sourceId": "elem-1",
            "targetId": "elem-2",
            "sourcePortId": None,
            "targetPortId": None,
            "properties": {},
        })

        service.save_project(str(proj_file), data)

        reopened = service.open_project(str(proj_file))
        assert reopened.semantic_model == data.semantic_model
        assert reopened.canvas_model == data.canvas_model
        assert reopened.metadata.name == data.metadata.name

    def test_save_syncs_model_sysml2(self, service: FileService, tmp_dir: str) -> None:
        """After save, model.sysml2 must reflect the semantic model."""
        service.create_project(tmp_dir, "SyncTest")
        proj_file = Path(tmp_dir) / "SyncTest" / "SyncTest.sysml2proj"

        data = _make_project_data("SyncTest")
        service.save_project(str(proj_file), data)

        model_file = Path(tmp_dir) / "SyncTest" / "model.sysml2"
        content = model_file.read_text(encoding="utf-8")
        # Should contain the part definition
        assert "part def Engine" in content

    def test_save_creates_parent_dirs(self, service: FileService, tmp_dir: str) -> None:
        """save should create parent directories if they don't exist."""
        new_dir = Path(tmp_dir) / "new_subdir"
        proj_file = new_dir / "SubProj.sysml2proj"

        data = _make_project_data("SubProj")
        service.save_project(str(proj_file), data)

        assert proj_file.is_file()

    def test_save_failure_keeps_backup(
        self, service: FileService, tmp_dir: str
    ) -> None:
        """When save fails, the original file must be undamaged and .bak
        must exist."""
        # Create a project with a file on disk
        proj = service.create_project(tmp_dir, "FailTest")
        proj_file = Path(tmp_dir) / "FailTest" / "FailTest.sysml2proj"

        # Modify data
        data = _make_project_data("FailTest")

        # Read original content before the failing save
        original_content = proj_file.read_text(encoding="utf-8")

        # Mock os.replace to simulate disk-full failure
        with mock.patch(
            "app.services.file_service.os.replace",
            side_effect=OSError(28, "No space left on device"),
        ):
            with pytest.raises(SaveError):
                service.save_project(str(proj_file), data)

        # Original file must still contain the original data (undamaged)
        assert proj_file.is_file()
        current_content = proj_file.read_text(encoding="utf-8")
        assert current_content == original_content

        # .bak must exist
        bak_path = Path(str(proj_file) + ".bak")
        assert bak_path.is_file()

        # .tmp must NOT exist (cleaned up)
        tmp_path = proj_file.with_suffix(".tmp")
        assert not tmp_path.exists()

    def test_save_no_parent_dir_created(self, service: FileService, tmp_dir: str) -> None:
        """Saving to a path whose parent doesn't exist should auto-create the
        parent directory (via _write_json)."""
        data = _make_project_data("AutoDir")
        deep_path = Path(tmp_dir) / "a" / "b" / "AutoDir.sysml2proj"

        service.save_project(str(deep_path), data)
        assert deep_path.is_file()

    def test_save_deletes_bak_on_success(self, service: FileService, tmp_dir: str) -> None:
        """After a successful save, the .bak file should be deleted."""
        proj = service.create_project(tmp_dir, "BakCleanup")
        proj_file = Path(tmp_dir) / "BakCleanup" / "BakCleanup.sysml2proj"

        data = _make_project_data("BakCleanup")
        service.save_project(str(proj_file), data)

        bak_path = Path(str(proj_file) + ".bak")
        assert not bak_path.exists()


# =============================================================================
#  Test: auto_save
# =============================================================================


class TestAutoSave:
    """Tests for FileService.auto_save."""

    def test_auto_save_creates_file(self, service: FileService, tmp_dir: str) -> None:
        """auto_save must create a timestamped file in auto-save/."""
        service.create_project(tmp_dir, "AutoTest")

        data = _make_project_data("AutoTest")
        service.auto_save(data)

        auto_save_dir = Path(tmp_dir) / "AutoTest" / AUTO_SAVE_DIR_NAME
        files = list(auto_save_dir.glob("*.sysml2proj"))
        assert len(files) == 1

        # Filename should be timestamp-based (YYYYMMDD_HHMMSS_ffffff.sysml2proj)
        filename = files[0].name
        assert re.match(r"\d{8}_\d{6}_\d{6}\.sysml2proj", filename)

    def test_auto_save_content_valid(self, service: FileService, tmp_dir: str) -> None:
        """The auto-saved file must contain valid project JSON."""
        service.create_project(tmp_dir, "ContentTest")

        data = _make_project_data("ContentTest")
        service.auto_save(data)

        auto_save_dir = Path(tmp_dir) / "ContentTest" / AUTO_SAVE_DIR_NAME
        files = list(auto_save_dir.glob("*.sysml2proj"))
        assert len(files) == 1

        with open(str(files[0]), "r", encoding="utf-8") as fh:
            raw = json.load(fh)

        assert raw["formatVersion"] == FORMAT_VERSION
        assert raw["semanticModel"]["elements"][0]["name"] == "Engine"

    def test_auto_save_rotation_keeps_last_n(self, service: FileService, tmp_dir: str) -> None:
        """auto_save must keep only the most recent AUTO_SAVE_MAX_COUNT files."""
        service.create_project(tmp_dir, "RotationTest")

        auto_save_dir = Path(tmp_dir) / "RotationTest" / AUTO_SAVE_DIR_NAME

        # Create more than AUTO_SAVE_MAX_COUNT auto-saves
        for i in range(AUTO_SAVE_MAX_COUNT + 3):
            data = _make_project_data("RotationTest")
            service.auto_save(data)

            # Small delay so timestamps differ
            import time
            time.sleep(0.11)

        files = list(auto_save_dir.glob("*.sysml2proj"))
        assert len(files) == AUTO_SAVE_MAX_COUNT

    def test_auto_save_without_project_raises(self, service: FileService) -> None:
        """Calling auto_save without a loaded project must raise."""
        data = _make_project_data("NoProj")
        with pytest.raises(NoProjectLoadedError):
            service.auto_save(data)

    def test_auto_save_updates_modified_timestamp(self, service: FileService, tmp_dir: str) -> None:
        """auto_save should bump the modified timestamp on the data."""
        service.create_project(tmp_dir, "ModTime")

        data = _make_project_data("ModTime")
        original_modified = data.metadata.modified

        import time
        time.sleep(0.01)

        service.auto_save(data)
        assert data.metadata.modified != original_modified

    def test_auto_save_after_save_uses_correct_dir(self, service: FileService, tmp_dir: str) -> None:
        """After save_project, auto_save should write to the correct
        project directory."""
        data = _make_project_data("SaveThenAuto")
        proj_file = Path(tmp_dir) / "SaveThenAuto" / "SaveThenAuto.sysml2proj"
        service.save_project(str(proj_file), data)

        service.auto_save(data)

        auto_save_dir = Path(tmp_dir) / "SaveThenAuto" / AUTO_SAVE_DIR_NAME
        files = list(auto_save_dir.glob("*.sysml2proj"))
        assert len(files) == 1


# =============================================================================
#  Test: crash recovery
# =============================================================================


class TestCrashRecovery:
    """Tests for FileService.check_auto_save."""

    def test_no_auto_save_dir_returns_empty(self, service: FileService, tmp_dir: str) -> None:
        """When auto-save/ doesn't exist, return empty list."""
        result = FileService.check_auto_save(tmp_dir)
        assert result == []

    def test_empty_auto_save_dir_returns_empty(self, service: FileService, tmp_dir: str) -> None:
        """When auto-save/ exists but is empty, return empty list."""
        auto_dir = Path(tmp_dir) / AUTO_SAVE_DIR_NAME
        auto_dir.mkdir()
        result = FileService.check_auto_save(tmp_dir)
        assert result == []

    def test_detects_auto_save_files(self, service: FileService, tmp_dir: str) -> None:
        """check_auto_save must return info about found auto-save files."""
        service.create_project(tmp_dir, "RecoveryTest")

        data = _make_project_data("RecoveryTest")
        service.auto_save(data)
        service.auto_save(data)  # create a second one

        project_dir = Path(tmp_dir) / "RecoveryTest"
        results = FileService.check_auto_save(str(project_dir))

        assert len(results) >= 1
        for r in results:
            assert "file_path" in r
            assert "timestamp" in r
            assert "size" in r
            assert Path(r["file_path"]).suffix == ".sysml2proj"
            assert r["size"] > 0

    def test_results_sorted_newest_first(self, service: FileService, tmp_dir: str) -> None:
        """Results must be sorted newest-first."""
        service.create_project(tmp_dir, "SortTest")

        import time
        for _ in range(3):
            data = _make_project_data("SortTest")
            service.auto_save(data)
            time.sleep(0.11)

        project_dir = Path(tmp_dir) / "SortTest"
        results = FileService.check_auto_save(str(project_dir))

        assert len(results) == 3
        # newest first
        for i in range(len(results) - 1):
            assert results[i]["timestamp"] >= results[i + 1]["timestamp"]


# =============================================================================
#  Test: export_sysml2_text
# =============================================================================


class TestExportSysml2Text:
    """Tests for FileService.export_sysml2_text."""

    def test_export_creates_file(self, service: FileService, tmp_dir: str) -> None:
        model = _make_project_data("ExportTest").semantic_model
        result_path = service.export_sysml2_text(tmp_dir, model)

        assert Path(result_path).is_file()
        assert Path(result_path).name == "model.sysml2"

    def test_export_content_contains_element(self, service: FileService, tmp_dir: str) -> None:
        model = _make_project_data("ExportContent").semantic_model
        result_path = service.export_sysml2_text(tmp_dir, model)

        content = Path(result_path).read_text(encoding="utf-8")
        assert "part def Engine" in content

    def test_export_with_empty_model(self, service: FileService, tmp_dir: str) -> None:
        empty_model: dict = {
            "id": "",
            "name": "Empty",
            "elements": [],
            "relationships": [],
            "packages": [],
        }
        result_path = service.export_sysml2_text(tmp_dir, empty_model)

        content = Path(result_path).read_text(encoding="utf-8")
        # Should produce valid (possibly empty) text
        assert isinstance(content, str)

    def test_export_creates_parent_dirs(self, service: FileService, tmp_dir: str) -> None:
        """export_sysml2_text must create the target directory if missing."""
        deep_dir = Path(tmp_dir) / "deep" / "nested"
        model = _make_project_data("DeepExport").semantic_model

        result_path = service.export_sysml2_text(str(deep_dir), model)
        assert Path(result_path).is_file()

    def test_export_returns_absolute_path(self, service: FileService, tmp_dir: str) -> None:
        model = _make_project_data("AbsPath").semantic_model
        result_path = service.export_sysml2_text(tmp_dir, model)
        assert os.path.isabs(result_path)


# =============================================================================
#  Test: edge cases
# =============================================================================


class TestEdgeCases:
    """Miscellaneous edge-case tests."""

    def test_create_project_with_unicode_name(self, service: FileService, tmp_dir: str) -> None:
        """Create project with Chinese characters in name."""
        result = service.create_project(tmp_dir, "测试项目")
        assert result.metadata.name == "测试项目"
        assert Path(tmp_dir).joinpath("测试项目").is_dir()

    def test_save_then_open_many_elements(self, service: FileService, tmp_dir: str) -> None:
        """Save and reopen a project with many elements."""
        proj = service.create_project(tmp_dir, "ManyElems")
        proj_file = Path(tmp_dir) / "ManyElems" / "ManyElems.sysml2proj"

        data = _make_project_data("ManyElems")
        for i in range(100):
            data.semantic_model["elements"].append({
                "id": f"elem-{i}",
                "name": f"Element{i}",
                "type": "PartDefinition",
                "ownerId": None,
                "qualifiedName": f"Element{i}",
                "shortName": None,
                "description": "",
                "properties": {},
            })

        service.save_project(str(proj_file), data)
        reopened = service.open_project(str(proj_file))
        assert len(reopened.semantic_model["elements"]) == 101  # 1 original + 100

    def test_auto_save_multiple_services(self, tmp_dir: str) -> None:
        """Two different service instances writing auto-saves must not
        interfere — each keeps its own count."""
        svc1 = FileService()
        svc2 = FileService()

        svc1.create_project(tmp_dir, "MultiSvc")
        data1 = _make_project_data("MultiSvc")
        data2 = _make_project_data("MultiSvc")

        # svc1 does 3 auto-saves
        svc1.auto_save(data1)
        svc1.auto_save(data1)
        svc1.auto_save(data1)

        # svc2 does 2 more (after reloading the dir)
        svc2.create_project(tmp_dir, "MultiSvc")
        svc2.auto_save(data2)
        svc2.auto_save(data2)

        auto_save_dir = Path(tmp_dir) / "MultiSvc" / AUTO_SAVE_DIR_NAME
        files = list(auto_save_dir.glob("*.sysml2proj"))
        # Should max out at AUTO_SAVE_MAX_COUNT
        assert len(files) <= AUTO_SAVE_MAX_COUNT
        assert len(files) >= 3  # at least some files survived

    def test_save_with_nonexistent_model_sysml2_sync(self, service: FileService, tmp_dir: str) -> None:
        """Saving with empty semantic model should NOT crash on sync."""
        proj = service.create_project(tmp_dir, "EmptySync")
        proj_file = Path(tmp_dir) / "EmptySync" / "EmptySync.sysml2proj"

        data = _make_project_data("EmptySync")
        data.semantic_model = {}  # empty dict, no keys
        service.save_project(str(proj_file), data)
        # Should not have crashed

    def test_project_data_dir_path_not_serialized(self) -> None:
        """_dir_path must not be included in to_dict output."""
        data = _make_project_data("Hidden")
        data._dir_path = "/secret/path"
        d = data.to_dict()
        assert "_dir_path" not in d

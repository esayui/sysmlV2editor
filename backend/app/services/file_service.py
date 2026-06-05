"""
File Service — Project file create, open, save, auto-save, backup recovery.

Section 4.4 of the detailed design.

Manages .sysml2proj project files (JSON format) with atomic saves,
auto-save with crash recovery, and .sysml2 text sync for Git diff.
"""

from __future__ import annotations

import json
import os
import re
import shutil
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.services.parser import TextGenerator


# =============================================================================
# Constants
# =============================================================================

FORMAT_VERSION = "1.0"
"""Current project file format version."""

ILLEGAL_NAME_CHARS_RE = re.compile(r'[<>:"/\\|?*]')
"""Regex matching illegal characters in project names."""

AUTO_SAVE_MAX_COUNT = 5
"""Maximum number of auto-save files to retain."""

AUTO_SAVE_DIR_NAME = "auto-save"
"""Directory name for auto-save files."""

EXPORTS_DIR_NAME = "exports"
"""Directory name for exported files."""


# =============================================================================
# Exceptions
# =============================================================================


class FileServiceError(Exception):
    """Base exception for file-service errors."""
    pass


class InvalidProjectNameError(FileServiceError):
    """Project name contains illegal characters or is empty."""
    pass


class ProjectNotFoundError(FileServiceError):
    """Project file or directory does not exist."""
    pass


class InvalidProjectFileError(FileServiceError):
    """Project file has invalid JSON or missing required fields."""
    pass


class SaveError(FileServiceError):
    """Project save operation failed (disk full, permission, …)."""
    pass


class NoProjectLoadedError(FileServiceError):
    """auto_save() called without a prior create / open / save."""
    pass


# =============================================================================
# Data classes
# =============================================================================


@dataclass
class ProjectMetadata:
    """Project metadata stored inside the .sysml2proj file.

    Attributes:
        name: Human-readable project name.
        created: ISO-8601 creation timestamp.
        modified: ISO-8601 last-modified timestamp.
        version: Format version string (e.g. ``"1.0"``).
    """
    name: str
    created: str
    modified: str
    version: str


@dataclass
class ProjectData:
    """In-memory representation of a complete project.

    Attributes:
        metadata: Project metadata.
        semantic_model: Semantic model dict (elements, relationships, packages).
        canvas_model: Canvas model dict (layout, styling).
        _dir_path: Transient — project directory path (not serialised).
    """
    metadata: ProjectMetadata
    semantic_model: dict[str, Any]
    canvas_model: dict[str, Any]

    _dir_path: str | None = field(default=None, repr=False)

    # ------------------------------------------------------------------
    #  Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        """Serialize to the JSON structure stored in a ``.sysml2proj`` file.

        Returns a dict with keys ``formatVersion``, ``metadata``,
        ``semanticModel``, and ``canvasModel``.
        """
        return {
            "formatVersion": self.metadata.version,
            "metadata": {
                "name": self.metadata.name,
                "created": self.metadata.created,
                "modified": self.metadata.modified,
                "version": self.metadata.version,
            },
            "semanticModel": self.semantic_model,
            "canvasModel": self.canvas_model,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any], dir_path: str | None = None) -> "ProjectData":
        """Deserialize from the on-disk JSON structure.

        Args:
            data: Dict with ``formatVersion``, ``metadata``,
                ``semanticModel``, ``canvasModel``.
            dir_path: Optional project directory path (not stored in the
                file itself, but useful for subsequent operations).
        """
        meta = data.get("metadata", {})
        metadata = ProjectMetadata(
            name=meta.get("name", ""),
            created=meta.get("created", ""),
            modified=meta.get("modified", ""),
            version=data.get("formatVersion", FORMAT_VERSION),
        )
        return cls(
            metadata=metadata,
            semantic_model=data.get("semanticModel", {}),
            canvas_model=data.get("canvasModel", {}),
            _dir_path=dir_path,
        )


# =============================================================================
#  FileService
# =============================================================================


class FileService:
    """Project file management service.

    Provides create, open, save, auto-save, crash recovery, and SysML v2
    text export for ``.sysml2proj`` project files.

    The service is *lightly* stateful — it remembers the current project
    path so that :meth:`auto_save` can write to the correct ``auto-save/``
    directory without requiring the path on every call.
    """

    def __init__(self) -> None:
        self._current_file_path: str | None = None
        self._current_project_dir: str | None = None

    # ==================================================================
    #  Create project
    # ==================================================================

    def create_project(self, dir_path: str, name: str) -> ProjectData:
        """Create a new project on disk.

        Directory layout created::

            <dir_path>/<name>/
            ├── <name>.sysml2proj
            ├── model.sysml2
            ├── auto-save/
            └── exports/

        Args:
            dir_path: Parent directory (must already exist).
            name: Project name — also used for the folder and
                ``.sysml2proj`` file name.

        Returns:
            The newly created :class:`ProjectData` (with empty models).

        Raises:
            InvalidProjectNameError: *name* is empty or contains illegal chars.
            ProjectNotFoundError: *dir_path* does not exist.
        """
        # ---- validation ----
        self._validate_project_name(name)

        dir_path_obj = Path(dir_path).resolve()
        if not dir_path_obj.exists():
            raise ProjectNotFoundError(f"Directory does not exist: {dir_path}")
        if not dir_path_obj.is_dir():
            raise ProjectNotFoundError(f"Path is not a directory: {dir_path}")

        # ---- create directory structure ----
        project_dir = dir_path_obj / name
        project_dir.mkdir(parents=True, exist_ok=True)

        auto_save_dir = project_dir / AUTO_SAVE_DIR_NAME
        exports_dir = project_dir / EXPORTS_DIR_NAME
        auto_save_dir.mkdir(exist_ok=True)
        exports_dir.mkdir(exist_ok=True)

        # ---- build initial project data ----
        now = datetime.now(timezone.utc).isoformat()

        metadata = ProjectMetadata(
            name=name,
            created=now,
            modified=now,
            version=FORMAT_VERSION,
        )

        empty_semantic: dict[str, Any] = {
            "id": "",
            "name": name,
            "elements": [],
            "relationships": [],
            "packages": [],
        }

        project_data = ProjectData(
            metadata=metadata,
            semantic_model=empty_semantic,
            canvas_model={},
            _dir_path=str(project_dir),
        )

        # ---- write files ----
        project_file = project_dir / f"{name}.sysml2proj"
        self._write_json(project_file, project_data.to_dict())

        model_file = project_dir / "model.sysml2"
        model_file.write_text("", encoding="utf-8")

        # ---- track current project ----
        self._current_file_path = str(project_file)
        self._current_project_dir = str(project_dir)

        return project_data

    # ==================================================================
    #  Open project
    # ==================================================================

    def open_project(self, file_path: str) -> ProjectData:
        """Open an existing ``.sysml2proj`` project file.

        Validates the JSON structure and required fields.  A format-version
        mismatch does **not** prevent loading (the caller may warn).

        Args:
            file_path: Path to the ``.sysml2proj`` file.

        Returns:
            :class:`ProjectData` loaded from disk.

        Raises:
            ProjectNotFoundError: *file_path* does not exist.
            InvalidProjectFileError: JSON is malformed or required fields
                are missing.
        """
        file_path_obj = Path(file_path).resolve()

        if not file_path_obj.exists():
            raise ProjectNotFoundError(f"Project file not found: {file_path}")
        if not file_path_obj.is_file():
            raise InvalidProjectFileError(f"Path is not a file: {file_path}")

        # ---- parse JSON ----
        try:
            data = self._read_json(file_path_obj)
        except json.JSONDecodeError as exc:
            raise InvalidProjectFileError(
                f"Invalid JSON in project file '{file_path}': {exc}"
            ) from exc

        # ---- validate structure ----
        self._validate_project_data(data)

        # ---- build ProjectData ----
        project_dir = str(file_path_obj.parent)
        project_data = ProjectData.from_dict(data, dir_path=project_dir)

        self._current_file_path = str(file_path_obj)
        self._current_project_dir = project_dir

        return project_data

    # ==================================================================
    #  Save project  (atomic)
    # ==================================================================

    def save_project(self, file_path: str, data: ProjectData) -> None:
        """Save project data to disk with an atomic write strategy.

        **Atomic-save protocol**::

            1. Serialize *data* → ``<name>.tmp``
            2. Copy current file → ``<name>.sysml2proj.bak``  (backup)
            3. ``os.replace(.tmp, .sysml2proj)``              (atomic)
            4. Delete ``.bak``                                 (success)
            5. Sync ``model.sysml2`` text file

        If any step fails, the backup ``.bak`` is preserved for recovery
        and the original file is left undamaged.

        Args:
            file_path: Path to the ``.sysml2proj`` file.
            data: The project data to persist.

        Raises:
            SaveError: Any I/O error during save — the original file is
                safe and ``.bak`` is available.
        """
        file_path_obj = Path(file_path).resolve()

        # Bump modified timestamp before serialising.
        data.metadata.modified = datetime.now(timezone.utc).isoformat()

        tmp_path = file_path_obj.with_suffix(".tmp")
        bak_path = Path(str(file_path_obj) + ".bak")

        bak_created = False

        # Step 1: write serialised data to .tmp
        self._write_json(tmp_path, data.to_dict())

        # Step 2: backup current file (copy, not move — original stays safe)
        if file_path_obj.exists():
            shutil.copy(str(file_path_obj), str(bak_path))
            bak_created = True

        # Step 3: atomic replace — swap .tmp in place of target
        try:
            os.replace(str(tmp_path), str(file_path_obj))
        except OSError as exc:
            # Clean up the temporary file; keep .bak for recovery.
            if tmp_path.exists():
                _try_unlink(tmp_path)
            raise SaveError(
                f"Failed to save project: {exc}. "
                f"Backup preserved at {bak_path}"
            ) from exc

        # Step 4: success — delete backup
        if bak_created and bak_path.exists():
            _try_unlink(bak_path)

        # Step 5: sync .sysml2 text
        if data.semantic_model:
            self._sync_sysml2_text(file_path_obj.parent, data.semantic_model)

        # Track current project
        self._current_file_path = str(file_path_obj)
        self._current_project_dir = str(file_path_obj.parent)

    # ==================================================================
    #  Auto-save
    # ==================================================================

    def auto_save(self, data: ProjectData) -> None:
        """Write a timestamped auto-save snapshot to ``auto-save/``.

        Keeps only the most recent :data:`AUTO_SAVE_MAX_COUNT` files;
        older ones are deleted.

        The save target is derived from the project directory remembered
        during the last :meth:`create_project`, :meth:`open_project`, or
        :meth:`save_project` call.

        Args:
            data: Current project data to auto-save.

        Raises:
            NoProjectLoadedError: No project directory is known yet.
        """
        if self._current_project_dir is None:
            raise NoProjectLoadedError(
                "No project is currently loaded. "
                "Call create_project() or open_project() first."
            )

        project_dir = Path(self._current_project_dir)
        auto_save_dir = project_dir / AUTO_SAVE_DIR_NAME
        auto_save_dir.mkdir(exist_ok=True)

        # Timestamp-based filename (microsecond precision to avoid
        # collisions when auto-save fires more than once per second).
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
        auto_save_file = auto_save_dir / f"{ts}.sysml2proj"

        # Bump modified timestamp
        data.metadata.modified = datetime.now(timezone.utc).isoformat()

        self._write_json(auto_save_file, data.to_dict())

        # Rotate — keep only the N newest files
        self._rotate_auto_saves(auto_save_dir)

    # ==================================================================
    #  Crash recovery
    # ==================================================================

    @staticmethod
    def check_auto_save(dir_path: str) -> list[dict[str, Any]]:
        """Scan the ``auto-save/`` directory for recovery candidates.

        Called on startup (or project open) so the frontend can ask the
        user whether to restore unsaved data.

        Args:
            dir_path: Project directory path.

        Returns:
            List of dicts, each describing one auto-save file::

                {
                    "file_path": "<absolute path>",
                    "timestamp": "<ISO-8601>",
                    "size": <bytes>,
                }

            Sorted newest-first.
        """
        auto_save_dir = Path(dir_path) / AUTO_SAVE_DIR_NAME
        if not auto_save_dir.is_dir():
            return []

        results: list[dict[str, Any]] = []
        for f in sorted(
            auto_save_dir.glob("*.sysml2proj"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        ):
            try:
                stat = f.stat()
                results.append({
                    "file_path": str(f),
                    "timestamp": datetime.fromtimestamp(
                        stat.st_mtime, tz=timezone.utc
                    ).isoformat(),
                    "size": stat.st_size,
                })
            except OSError:
                continue

        return results

    # ==================================================================
    #  Export .sysml2 text
    # ==================================================================

    def export_sysml2_text(self, dir_path: str, model: dict[str, Any]) -> str:
        """Serialize *model* to SysML v2 text and write ``model.sysml2``.

        Uses :class:`TextGenerator` from the parser module to produce
        formatted, multi-line SysML v2 source text.

        Args:
            dir_path: Target directory (created if missing).
            model: Semantic model dictionary.

        Returns:
            Absolute path to the written ``model.sysml2`` file.
        """
        dir_path_obj = Path(dir_path)
        dir_path_obj.mkdir(parents=True, exist_ok=True)

        generator = TextGenerator()
        text = generator.generate(model, format=True)

        output_path = dir_path_obj / "model.sysml2"
        output_path.write_text(text, encoding="utf-8")

        return str(output_path)

    # ==================================================================
    #  Internal helpers
    # ==================================================================

    @staticmethod
    def _validate_project_name(name: str) -> None:
        """Raise :class:`InvalidProjectNameError` if *name* is illegal.

        Illegal characters: ``< > : \" / \\ | ? *``  (Windows reserved).
        Empty / whitespace-only names are also rejected.
        """
        if not name or not name.strip():
            raise InvalidProjectNameError("Project name cannot be empty.")

        if ILLEGAL_NAME_CHARS_RE.search(name):
            raise InvalidProjectNameError(
                f"Project name '{name}' contains illegal characters. "
                f"Not allowed: < > : \" / \\ | ? *"
            )

        # Reject ASCII control characters (0x00–0x1F)
        if any(ord(c) < 32 for c in name):
            raise InvalidProjectNameError(
                "Project name cannot contain control characters."
            )

    @staticmethod
    def _validate_project_data(data: dict[str, Any]) -> None:
        """Validate the top-level structure of a parsed project JSON dict.

        Raises :class:`InvalidProjectFileError` when required keys are
        missing.
        """
        required_top = ["formatVersion", "metadata", "semanticModel", "canvasModel"]
        for field in required_top:
            if field not in data:
                raise InvalidProjectFileError(
                    f"Missing required field '{field}' in project file."
                )

        metadata = data.get("metadata", {})
        required_meta = ["name", "created", "modified", "version"]
        for field in required_meta:
            if field not in metadata:
                raise InvalidProjectFileError(
                    f"Missing required metadata field '{field}' in project file."
                )

    # ---- low-level file I/O ----

    @staticmethod
    def _write_json(path: Path, data: dict[str, Any]) -> None:
        """Write *data* as indented UTF-8 JSON to *path*.

        Parent directories are created if they do not exist.
        """
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(str(path), "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)

    @staticmethod
    def _read_json(path: Path) -> dict[str, Any]:
        """Read and parse JSON from *path*."""
        with open(str(path), "r", encoding="utf-8") as fh:
            return json.load(fh)

    # ---- .sysml2 sync ----

    @staticmethod
    def _sync_sysml2_text(project_dir: Path, model: dict[str, Any]) -> None:
        """Write ``model.sysml2`` from the semantic model dict.

        Called automatically after a successful save so the text file
        stays in sync with the project file (useful for Git diff).
        """
        generator = TextGenerator()
        text = generator.generate(model, format=True)

        model_file = project_dir / "model.sysml2"
        model_file.write_text(text, encoding="utf-8")

    # ---- auto-save rotation ----

    @staticmethod
    def _rotate_auto_saves(auto_save_dir: Path) -> None:
        """Delete the oldest auto-save files, keeping at most
        :data:`AUTO_SAVE_MAX_COUNT`."""
        files = sorted(
            auto_save_dir.glob("*.sysml2proj"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        for old_file in files[AUTO_SAVE_MAX_COUNT:]:
            _try_unlink(old_file)


# =============================================================================
#  Module-level helpers
# =============================================================================


def _try_unlink(path: Path) -> None:
    """Best-effort file deletion — swallows :class:`OSError`."""
    try:
        path.unlink()
    except OSError:
        pass

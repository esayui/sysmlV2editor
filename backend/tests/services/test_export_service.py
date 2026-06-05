"""Tests for the Export Service module.

Covers:
  - SVG export: write, optimisation, valid output
  - PNG export: Base64 decode, binary output
  - Batch export: independent tasks, partial failure
  - Path management: default paths, auto-create dirs, overwrite
"""

from __future__ import annotations

import base64
import io
import os
import re
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest import mock

import pytest

from app.services.export_service import (
    DEFAULT_EXPORT_DIR,
    ExportService,
    ExportTask,
    ExportTaskResult,
)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def svc() -> ExportService:
    """Fresh ExportService instance."""
    return ExportService()


@pytest.fixture
def tmp_dir() -> str:
    """Create a temporary directory, return its path, clean up after."""
    with tempfile.TemporaryDirectory() as d:
        yield d


# =============================================================================
# Data: sample SVG and PNG content
# =============================================================================

VALID_SVG = """\
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
  <rect x="0" y="0" width="200" height="100" fill="#ccc"/>
  <text x="100" y="50" text-anchor="middle" fill="black">Hello</text>
</svg>
"""

# A tiny 1x1 red PNG, Base64-encoded.
TINY_PNG_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/"
    "PchI7wAAAABJRU5ErkJggg=="
)


# =============================================================================
# 1. SVG Export
# =============================================================================


class TestSvgExport:
    """Section 1: SVG export."""

    def test_export_svg_writes_valid_xml(self, svc: ExportService, tmp_dir: str) -> None:
        """1.3 -- output is valid XML that a browser can render."""
        path = os.path.join(tmp_dir, "test_diagram.svg")
        svc.export_svg(VALID_SVG, path)

        assert os.path.isfile(path), "SVG file should exist"
        # Parse as XML -- raises ET.ParseError on invalid XML.
        tree = ET.parse(path)
        root = tree.getroot()
        assert root.tag == "{http://www.w3.org/2000/svg}svg"
        # Must contain the rect and text elements.
        children = list(root)
        assert len(children) == 2

    def test_export_svg_appends_extension(self, svc: ExportService, tmp_dir: str) -> None:
        """1.1 -- .svg extension is added automatically."""
        path = os.path.join(tmp_dir, "no_ext")
        svc.export_svg(VALID_SVG, path)
        assert os.path.isfile(path + ".svg")
        assert not os.path.isfile(path)

    def test_export_svg_does_not_double_extension(
        self, svc: ExportService, tmp_dir: str
    ) -> None:
        """Extension is not doubled when already present."""
        path = os.path.join(tmp_dir, "has_ext.svg")
        svc.export_svg(VALID_SVG, path)
        assert os.path.isfile(path)
        assert not os.path.isfile(path + ".svg")

    def test_export_svg_optimizes(self, svc: ExportService, tmp_dir: str) -> None:
        """1.2 -- Fabric.js redundant attributes are stripped."""
        svg_with_fabric = (
            '<svg xmlns="http://www.w3.org/2000/svg"'
            ' fabric:diagram-id="abc-123"'
            ' width="100" height="100">'
            "\n  <rect/>\n"
            "</svg>"
        )
        path = os.path.join(tmp_dir, "optimized.svg")
        svc.export_svg(svg_with_fabric, path)

        content = Path(path).read_text(encoding="utf-8")
        # Fabric attribute should be gone.
        assert "fabric:diagram-id" not in content
        # Should still be valid SVG XML.
        ET.parse(path)  # does not raise

    def test_export_svg_optimizes_whitespace(self, svc: ExportService, tmp_dir: str) -> None:
        """1.2 -- whitespace between tags is collapsed."""
        svg_verbose = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">'
            "\n    <rect/>\n    <rect/>\n"
            "</svg>"
        )
        path = os.path.join(tmp_dir, "ws.svg")
        svc.export_svg(svg_verbose, path)

        content = Path(path).read_text(encoding="utf-8")
        # Should not contain newlines between tags after optimisation.
        assert ">\n" not in content

    def test_export_svg_creates_parent_dirs(self, svc: ExportService, tmp_dir: str) -> None:
        """Parent directories are auto-created."""
        path = os.path.join(tmp_dir, "deep", "nested", "diagram")
        svc.export_svg(VALID_SVG, path)
        assert os.path.isfile(path + ".svg")


# =============================================================================
# 2. PNG Export
# =============================================================================


class TestPngExport:
    """Section 2: PNG export."""

    def test_export_png_writes_valid_data(self, svc: ExportService, tmp_dir: str) -> None:
        """2.3 -- output is valid PNG image data."""
        path = os.path.join(tmp_dir, "test.png")
        svc.export_png(TINY_PNG_BASE64, path)

        assert os.path.isfile(path)
        raw = Path(path).read_bytes()
        # PNG magic bytes.
        assert raw[:8] == b"\x89PNG\r\n\x1a\n"

    def test_export_png_strips_data_url_prefix(self, svc: ExportService, tmp_dir: str) -> None:
        """Base64 may include the data:image/png;base64, prefix."""
        path = os.path.join(tmp_dir, "prefixed.png")
        prefixed = "data:image/png;base64," + TINY_PNG_BASE64
        svc.export_png(prefixed, path)

        assert os.path.isfile(path)
        raw = Path(path).read_bytes()
        assert raw[:4] == b"\x89PNG"

    def test_export_png_appends_extension(self, svc: ExportService, tmp_dir: str) -> None:
        """2.1 -- .png extension added automatically."""
        path = os.path.join(tmp_dir, "no_ext")
        svc.export_png(TINY_PNG_BASE64, path)
        assert os.path.isfile(path + ".png")
        assert not os.path.isfile(path)

    def test_export_png_creates_parent_dirs(self, svc: ExportService, tmp_dir: str) -> None:
        """2.2 -- parent directories are auto-created."""
        path = os.path.join(tmp_dir, "deep", "nested", "output")
        svc.export_png(TINY_PNG_BASE64, path)
        assert os.path.isfile(path + ".png")

    def test_export_png_raises_on_invalid_base64(self, svc: ExportService) -> None:
        """Invalid Base64 should raise an error."""
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "bad.png")
            with pytest.raises(Exception):
                svc.export_png("!!!not-valid-base64!!!", path)


# =============================================================================
# 3. Batch Export
# =============================================================================


class TestBatchExport:
    """Section 3: batch export with ExportTask / ExportTaskResult."""

    def test_all_succeed(self, svc: ExportService, tmp_dir: str) -> None:
        """3 tasks, all valid -- all succeed."""
        tasks = [
            ExportTask(
                diagram_id="d1",
                format="svg",
                output_path=os.path.join(tmp_dir, "batch_d1.svg"),
                data=VALID_SVG,
            ),
            ExportTask(
                diagram_id="d2",
                format="png",
                output_path=os.path.join(tmp_dir, "batch_d2.png"),
                data=TINY_PNG_BASE64,
            ),
            ExportTask(
                diagram_id="d3",
                format="svg",
                output_path=os.path.join(tmp_dir, "batch_d3.svg"),
                data=VALID_SVG,
            ),
        ]

        results = svc.export_multiple(tasks)

        assert len(results) == 3
        assert all(r.success for r in results)
        assert results[0].file_size > 0
        assert results[1].file_size > 0
        assert results[2].file_size > 0

    def test_partial_failure_middle_task(self, svc: ExportService, tmp_dir: str) -> None:
        """3.3 -- second task has invalid path; returns [success, fail, success]."""
        # Create a regular file that will block directory creation.
        blocker = os.path.join(tmp_dir, "blocker")
        Path(blocker).write_text("block")
        bad_path = os.path.join(blocker, "sub", "file.png")

        tasks = [
            ExportTask(
                diagram_id="d1",
                format="svg",
                output_path=os.path.join(tmp_dir, "ok1.svg"),
                data=VALID_SVG,
            ),
            ExportTask(
                diagram_id="d2",
                format="png",
                # blocker is a file, not a directory → os.makedirs will fail.
                output_path=bad_path,
                data=TINY_PNG_BASE64,
            ),
            ExportTask(
                diagram_id="d3",
                format="svg",
                output_path=os.path.join(tmp_dir, "ok3.svg"),
                data=VALID_SVG,
            ),
        ]

        results = svc.export_multiple(tasks)

        assert len(results) == 3
        assert results[0].success is True
        assert results[1].success is False
        assert results[1].error_message is not None
        assert results[2].success is True

        # The two successful files should exist on disk.
        assert os.path.isfile(os.path.join(tmp_dir, "ok1.svg"))
        assert os.path.isfile(os.path.join(tmp_dir, "ok3.svg"))

    def test_partial_failure_unsupported_format(self, svc: ExportService, tmp_dir: str) -> None:
        """Unsupported format yields a failure result, not an unhandled exception."""
        tasks = [
            ExportTask(
                diagram_id="d1",
                format="svg",
                output_path=os.path.join(tmp_dir, "ok.svg"),
                data=VALID_SVG,
            ),
        ]
        # Create with a valid format, then override to bypass post_init validation.
        bad_task = ExportTask(
            diagram_id="dX",
            format="png",
            output_path=os.path.join(tmp_dir, "bad.gif"),
            data="",
        )
        object.__setattr__(bad_task, "format", "gif")
        tasks.append(bad_task)

        tasks.append(
            ExportTask(
                diagram_id="d3",
                format="png",
                output_path=os.path.join(tmp_dir, "ok3.png"),
                data=TINY_PNG_BASE64,
            ),
        )

        results = svc.export_multiple(tasks)

        assert len(results) == 3
        assert results[0].success is True
        assert results[1].success is False
        assert "gif" in (results[1].error_message or "").lower()
        assert results[2].success is True

    def test_result_dataclass_fields(self) -> None:
        """3.1 -- ExportTask and ExportTaskResult dataclasses have correct fields."""
        t = ExportTask(diagram_id="abc", format="svg", output_path="/tmp/x.svg")
        assert t.diagram_id == "abc"
        assert t.format == "svg"
        assert t.width is None
        assert t.height is None
        assert t.data == ""

        r = ExportTaskResult(task=t, success=True, file_size=42)
        assert r.success is True
        assert r.file_size == 42
        assert r.error_message is None

    def test_export_task_rejects_bad_format(self) -> None:
        """ExportTask constructor rejects unsupported formats."""
        with pytest.raises(ValueError, match="gif"):
            ExportTask(diagram_id="x", format="gif", output_path="/tmp/x")

    def test_empty_task_list(self, svc: ExportService) -> None:
        """Empty task list returns empty result list."""
        results = svc.export_multiple([])
        assert results == []


# =============================================================================
# 4. Path Management
# =============================================================================


class TestPathManagement:
    """Section 4: default export paths and file naming."""

    def test_default_export_path_uses_exports_dir(self, svc: ExportService) -> None:
        """4.1 -- defaults to exports/ sub-directory."""
        path = svc.default_export_path("my_diagram", "svg")
        assert path.startswith(DEFAULT_EXPORT_DIR)
        assert "my_diagram" in path
        assert path.endswith(".svg")

    def test_default_export_path_includes_timestamp(self, svc: ExportService) -> None:
        """4.2 -- filename includes timestamp."""
        from datetime import datetime, timezone

        dt = datetime(2026, 6, 5, 12, 30, 0, tzinfo=timezone.utc)
        path = svc.default_export_path("Diagram1", "png", timestamp=dt)
        assert "Diagram1_20260605_123000.png" in path

    def test_default_export_path_custom_base_dir(self, svc: ExportService) -> None:
        """Custom base_dir overrides the default."""
        path = svc.default_export_path("d", "svg", base_dir="/custom/exports")
        assert path.startswith("/custom/exports")

    def test_default_export_path_svg_format(self, svc: ExportService) -> None:
        """4.1 + 4.2 -- SVG format produces correct filename pattern."""
        path = svc.default_export_path("BlockDef", "svg")
        assert path.endswith(".svg")
        assert "BlockDef_" in path

    def test_default_export_path_png_format(self, svc: ExportService) -> None:
        """PNG format produces correct filename pattern."""
        path = svc.default_export_path("IBD", "png")
        assert path.endswith(".png")
        assert "IBD_" in path

    @mock.patch.dict(os.environ, {}, clear=True)
    def test_export_png_creates_deep_path(self, svc: ExportService) -> None:
        """2.2 -- deep nested parent directories are auto-created."""
        with tempfile.TemporaryDirectory() as d:
            deep = os.path.join(d, "a", "b", "c", "output")
            svc.export_png(TINY_PNG_BASE64, deep)
            assert os.path.isfile(deep + ".png")

    def test_ensure_extension_case_insensitive(self, svc: ExportService) -> None:
        """Extension check is case-insensitive."""
        # .SVG should not cause double extension.
        result = svc._ensure_extension("/tmp/file.SVG", ".svg")
        assert result == "/tmp/file.SVG"

    def test_ensure_extension_adds_missing(self, svc: ExportService) -> None:
        """Missing extension is added."""
        result = svc._ensure_extension("/tmp/file", ".svg")
        assert result == "/tmp/file.svg"


# =============================================================================
# Edge cases
# =============================================================================


class TestEdgeCases:
    """Additional edge-case coverage."""

    def test_export_svg_empty_string(self, svc: ExportService, tmp_dir: str) -> None:
        """Empty SVG string writes an empty file (not ideal, but should not crash)."""
        path = os.path.join(tmp_dir, "empty.svg")
        svc.export_svg("", path)
        assert os.path.isfile(path)

    def test_export_png_empty_base64_yields_empty_file(
        self, svc: ExportService, tmp_dir: str
    ) -> None:
        """Empty Base64 decodes to zero bytes."""
        path = os.path.join(tmp_dir, "empty.png")
        svc.export_png("", path)
        assert os.path.isfile(path)
        assert os.path.getsize(path) == 0

    def test_export_svg_with_extension_in_path_components(
        self, svc: ExportService, tmp_dir: str
    ) -> None:
        """Path components containing '.svg' should not confuse extension logic."""
        # Directory named "foo.svg" should still work.
        deep = os.path.join(tmp_dir, "dir.svg", "file")
        svc.export_svg(VALID_SVG, deep)
        expected = deep + ".svg"
        assert os.path.isfile(expected), f"Expected {expected}"

"""Export Service -- SVG / PNG chart export.

Section 4.5 of the detailed design.
"""

from __future__ import annotations

import base64
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


# =============================================================================
# Data classes
# =============================================================================


@dataclass
class ExportTask:
    """Describes a single export job.

    Attributes:
        diagram_id: Identifier of the diagram to export.
        format: ``'svg'`` or ``'png'``.
        output_path: Destination file path (extension added if missing).
        data: The actual content -- SVG markup string for SVG tasks,
              Base64-encoded image bytes for PNG tasks.
        width: Target width in pixels (``None`` = original size).
        height: Target height in pixels (``None`` = original size).
    """

    diagram_id: str
    format: str
    output_path: str
    data: str = ""
    width: int | None = None
    height: int | None = None

    def __post_init__(self) -> None:
        if self.format not in ("svg", "png"):
            raise ValueError(f"Unsupported format: {self.format!r}")


@dataclass
class ExportTaskResult:
    """Result of a single export task."""

    task: ExportTask
    success: bool
    error_message: str | None = None
    file_size: int = 0


# =============================================================================
# Constants
# =============================================================================

DEFAULT_EXPORT_DIR: str = "exports"
FILENAME_TIMESTAMP_FMT: str = "%Y%m%d_%H%M%S"


# =============================================================================
# Service
# =============================================================================


class ExportService:
    """Chart export service -- writes SVG / PNG files to disk."""

    # ------------------------------------------------------------------
    # SVG
    # ------------------------------------------------------------------

    def export_svg(self, svg_markup: str, output_path: str) -> None:
        """Write the SVG markup string to *output_path*.

        The SVG string is expected to come from Fabric.js
        ``canvas.toSVG()``.  The file extension ``.svg`` is appended
        automatically when missing, and parent directories are created.
        """
        output_path = self._ensure_extension(output_path, ".svg")
        self._ensure_parent(output_path)

        svg_markup = self._optimize_svg(svg_markup)

        with open(output_path, "w", encoding="utf-8") as fh:
            fh.write(svg_markup)

    # ------------------------------------------------------------------
    # PNG
    # ------------------------------------------------------------------

    def export_png(self, image_data: str, output_path: str) -> None:
        """Decode Base64-encoded PNG data and write it to *output_path*.

        *image_data* may optionally carry a ``data:image/png;base64,``
        prefix which is stripped before decoding.

        The file extension ``.png`` is appended automatically when
        missing, and parent directories are created.
        """
        output_path = self._ensure_extension(output_path, ".png")
        self._ensure_parent(output_path)

        # Strip data-URL prefix when present.
        if image_data.startswith("data:"):
            image_data = image_data.split(",", 1)[1]

        raw = base64.b64decode(image_data)
        with open(output_path, "wb") as fh:
            fh.write(raw)

    # ------------------------------------------------------------------
    # Batch
    # ------------------------------------------------------------------

    def export_multiple(self, tasks: list[ExportTask]) -> list[ExportTaskResult]:
        """Export multiple diagrams.

        Each task is handled independently -- a failure in one task does
        **not** affect the others.

        Returns a result list in the same order as *tasks*.
        """
        results: list[ExportTaskResult] = []
        for t in tasks:
            try:
                if t.format == "svg":
                    self.export_svg(t.data, t.output_path)
                elif t.format == "png":
                    self.export_png(t.data, t.output_path)  # type: ignore[arg-type]
                else:
                    raise ValueError(f"Unsupported format: {t.format!r}")

                file_size = os.path.getsize(self._ensure_extension(t.output_path, f".{t.format}"))
                results.append(ExportTaskResult(task=t, success=True, file_size=file_size))
            except Exception as exc:
                results.append(
                    ExportTaskResult(
                        task=t,
                        success=False,
                        error_message=str(exc),
                    )
                )
        return results

    # ------------------------------------------------------------------
    # Path helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _ensure_parent(path: str) -> None:
        """Create parent directories for *path* if they do not exist."""
        parent = os.path.dirname(os.path.abspath(path))
        if parent:
            os.makedirs(parent, exist_ok=True)

    @staticmethod
    def _ensure_extension(path: str, ext: str) -> str:
        """Append *ext* (e.g. ``.svg``) to *path* if it is missing."""
        if not path.lower().endswith(ext):
            path += ext
        return path

    # ------------------------------------------------------------------
    # Default path generation
    # ------------------------------------------------------------------

    @staticmethod
    def default_export_path(
        diagram_name: str,
        fmt: str,
        base_dir: str | None = None,
        timestamp: datetime | None = None,
    ) -> str:
        """Return a conventional export path.

        Pattern: ``<base_dir>/<diagram_name>_<timestamp>.<fmt>``

        *base_dir* defaults to the ``exports/`` sub-directory relative
        to the current working directory.
        """
        if base_dir is None:
            base_dir = DEFAULT_EXPORT_DIR
        if timestamp is None:
            timestamp = datetime.now(tz=timezone.utc)
        ts_str = timestamp.strftime(FILENAME_TIMESTAMP_FMT)
        filename = f"{diagram_name}_{ts_str}.{fmt}"
        return os.path.join(base_dir, filename)

    # ------------------------------------------------------------------
    # SVG optimisation (light, optional)
    # ------------------------------------------------------------------

    @staticmethod
    def _optimize_svg(svg: str) -> str:
        """Apply light SVG optimisations.

        - Removes Fabric.js-specific attributes (``fabric:*``).
        - Collapses whitespace between tags (safe for SVG -- significant
          whitespace lives inside ``<text>`` elements).
        """
        # Remove Fabric.js custom namespace attributes (keys may contain hyphens).
        svg = re.sub(r'\s+fabric:[^\s=]+\s*=\s*"[^"]*"', "", svg)
        # Collapse whitespace between adjacent tags.
        svg = re.sub(r">\s+<", "><", svg)
        # Collapse runs of spaces (non-greedy on attribute content).
        svg = re.sub(r"\s{2,}", " ", svg)
        return svg

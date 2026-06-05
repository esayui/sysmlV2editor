"""
Pydantic request / response models for API data validation and serialization.

Source: detailed-design.md §4.6.3.
JSON keys use camelCase (via alias), Python attributes use snake_case.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


def _to_camel(snake: str) -> str:
    """Convert snake_case to camelCase (e.g. ``dir_path`` → ``dirPath``)."""
    parts = snake.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


# =============================================================================
#  Common base — all models auto-alias snake_case → camelCase
# =============================================================================


class CamelModel(BaseModel):
    """Base model that serialises Python snake_case attributes as JSON camelCase."""

    model_config = ConfigDict(
        alias_generator=_to_camel,
        populate_by_name=True,
    )


# =============================================================================
#  Error response
# =============================================================================


class ErrorResponse(CamelModel):
    code: str
    message: str
    location: dict[str, int] | None = None
    details: Any | None = None


# =============================================================================
#  Model parse / serialize
# =============================================================================


class ParseRequest(CamelModel):
    text: str = Field(..., min_length=1, description="SysML v2 text content")


class ParseResponse(CamelModel):
    model: dict[str, Any]
    warnings: list[str] = []


class SerializeRequest(CamelModel):
    model: dict[str, Any] = Field(
        ..., description="Semantic model JSON (SemanticModel dictionary)"
    )


class SerializeResponse(CamelModel):
    text: str


# =============================================================================
#  Project file operations
# =============================================================================


class ProjectMetadataDict(CamelModel):
    name: str
    created: str   # ISO 8601
    modified: str  # ISO 8601
    version: str   # format version (e.g. "1.0")


class ProjectDataDict(CamelModel):
    metadata: ProjectMetadataDict
    semantic_model: dict[str, Any]
    canvas_model: dict[str, Any]


class CreateProjectRequest(CamelModel):
    dir_path: str = Field(..., description="Project directory path")
    name: str = Field(..., min_length=1, max_length=128)


class CreateProjectResponse(CamelModel):
    project_data: ProjectDataDict


class OpenProjectRequest(CamelModel):
    file_path: str = Field(..., description="Path to .sysml2proj file")


class OpenProjectResponse(CamelModel):
    project_data: ProjectDataDict


class SaveProjectRequest(CamelModel):
    file_path: str
    project_data: ProjectDataDict


class SaveProjectResponse(CamelModel):
    success: bool
    file_path: str
    file_size: int = 0


# =============================================================================
#  Model validation
# =============================================================================


class ValidateRequest(CamelModel):
    model: dict[str, Any]


class ValidationIssueDict(CamelModel):
    code: str             # error code (e.g. 'E001', 'W002')
    message: str          # human-readable message
    element_id: str | None = None
    severity: str         # 'error' | 'warning'
    source_location: str | None = None


class ValidateResponse(CamelModel):
    is_valid: bool
    errors: list[ValidationIssueDict] = []
    warnings: list[ValidationIssueDict] = []


# =============================================================================
#  Export
# =============================================================================


class ExportSVGRequest(CamelModel):
    svg_markup: str
    output_path: str


class ExportPNGRequest(CamelModel):
    image_data: str = Field(..., description="Base64-encoded PNG data")
    output_path: str


class ExportResponse(CamelModel):
    success: bool
    file_path: str = ""
    file_size: int = 0
    error_message: str | None = None

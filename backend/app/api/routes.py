"""
API Routes — /api/v1/*

All REST endpoints for the SysML v2 Modeler backend.

Implements the endpoints specified in detailed-design.md §4.6.2 and
§6.1-§6.2.
"""

from __future__ import annotations

import os
from pydantic import BaseModel
from fastapi import APIRouter

from app.models.schemas import (
    ParseRequest,
    ParseResponse,
    SerializeRequest,
    SerializeResponse,
    CreateProjectRequest,
    CreateProjectResponse,
    OpenProjectRequest,
    OpenProjectResponse,
    SaveProjectRequest,
    SaveProjectResponse,
    ValidateRequest,
    ValidateResponse,
    ExportSVGRequest,
    ExportPNGRequest,
    ExportResponse,
    ValidateResponse as ValidationResponseDict,
    ValidationIssueDict,
    ProjectDataDict,
    ProjectMetadataDict,
)

from app.services.parser import SysML2Parser, SysML2SyntaxError

router = APIRouter(prefix="/api/v1")


# =============================================================================
#  Health check
# =============================================================================


@router.get("/health")
async def health_check():
    """Health check endpoint.

    Returns 200 with status ``"ok"`` when the service is running.
    Used by the frontend to verify backend connectivity on load.
    """
    return {"status": "ok"}


# =============================================================================
#  1.  Model Parse  —  POST /api/v1/model/parse
# =============================================================================

# Lazily-initialised parser (singleton per process).
_parser: SysML2Parser | None = None


def _get_parser() -> SysML2Parser:
    """Return (and lazily create) the application-level SysML2Parser."""
    global _parser
    if _parser is None:
        _parser = SysML2Parser()
    return _parser


@router.post("/model/parse", response_model=ParseResponse)
async def parse_model(request: ParseRequest):
    """Parse ``.sysml2`` text into a SemanticModel.

    **POST** ``/api/v1/model/parse``

    Request body::

        {"text": "part def Vehicle { attribute mass: Real; }"}

    Response (200)::

        {"model": {...}, "warnings": []}

    Response (400) on syntax error::

        {"code": "SYNTAX_ERROR", "message": "...", "location": {"line": 3, "column": 5}}
    """
    parser = _get_parser()
    model = parser.parse_to_model(request.text)
    return ParseResponse(model=model, warnings=[])


# =============================================================================
#  2.  Model Serialize  —  POST /api/v1/model/serialize
# =============================================================================


@router.post("/model/serialize", response_model=SerializeResponse)
def serialize_model(request: SerializeRequest):
    """Serialize a SemanticModel back to ``.sysml2`` text.

    **POST** ``/api/v1/model/serialize``

    Request body::

        {"model": {"id": "...", "elements": [...], ...}}

    Response (200)::

        {"text": "part def Vehicle {\\n    attribute mass: Real;\\n}"}
    """
    parser = _get_parser()
    text = parser.generate_text(request.model, format=True)
    return SerializeResponse(text=text)


# =============================================================================
#  3.  Project Create  —  POST /api/v1/project/create
# =============================================================================

# FileService is now a complete implementation (M-BE-04).
from app.services.file_service import (
    FileService,
    ProjectData,
    ProjectMetadata,
    ProjectNotFoundError as FileServiceProjectNotFoundError,
    InvalidProjectNameError,
    InvalidProjectFileError,
    SaveError,
)

_file_service: FileService | None = None


def _get_file_service() -> FileService:
    """Return (and lazily create) the application-level FileService."""
    global _file_service
    if _file_service is None:
        _file_service = FileService()
    return _file_service


def _register_in_registry(name: str, path: str) -> None:
    """Auto-register a project in the SQLite registry (best-effort)."""
    try:
        from app.services.project_registry import get_project_registry
        registry = get_project_registry()
        registry.register(name, path)
    except Exception:
        pass  # Registry registration is best-effort; don't break main flow


def _project_data_to_pydantic(pd: ProjectData) -> ProjectDataDict:
    """Convert a FileService ProjectData to a Pydantic ProjectDataDict."""
    return ProjectDataDict(
        metadata=ProjectMetadataDict(
            name=pd.metadata.name,
            created=pd.metadata.created,
            modified=pd.metadata.modified,
            version=pd.metadata.version,
        ),
        semantic_model=pd.semantic_model,
        canvas_model=pd.canvas_model,
    )


@router.post("/project/create", response_model=CreateProjectResponse)
async def create_project(request: CreateProjectRequest):
    """Create a new project.

    **POST** ``/api/v1/project/create``

    Request body::

        {"dirPath": "C:/projects", "name": "MyModel"}

    Response (200)::

        {"projectData": {"metadata": {...}, "semanticModel": {...}, "canvasModel": {...}}}
    """
    fs = _get_file_service()
    project_data = fs.create_project(request.dir_path, request.name)
    # Auto-register in persistent project list
    proj_path = os.path.join(request.dir_path, request.name, f"{request.name}.sysml2proj")
    _register_in_registry(request.name, proj_path)
    return CreateProjectResponse(project_data=_project_data_to_pydantic(project_data))


# =============================================================================
#  4.  Project Open  —  POST /api/v1/project/open
# =============================================================================


@router.post("/project/open", response_model=OpenProjectResponse)
async def open_project(request: OpenProjectRequest):
    """Open a ``.sysml2proj`` file.

    **POST** ``/api/v1/project/open``

    Request body::

        {"filePath": "C:/projects/MyModel/MyModel.sysml2proj"}

    Response (200)::

        {"projectData": {...}}

    Response (404) when the file does not exist.
    """
    fs = _get_file_service()
    project_data = fs.open_project(request.file_path)
    # Auto-register in persistent project list
    _register_in_registry(project_data.metadata.name, request.file_path)
    return OpenProjectResponse(project_data=_project_data_to_pydantic(project_data))


# =============================================================================
#  5.  Project Save  —  POST /api/v1/project/save
# =============================================================================


@router.post("/project/save", response_model=SaveProjectResponse)
async def save_project(request: SaveProjectRequest):
    """Save project data to a ``.sysml2proj`` file.

    **POST** ``/api/v1/project/save``

    Request body::

        {"filePath": "...", "projectData": {"metadata": {...}, ...}}

    Response (200)::

        {"success": true, "filePath": "...", "fileSize": 12345}

    Response (403) on permission denied.
    Response (500) on IO error.
    """
    import os

    fs = _get_file_service()

    # Build a ProjectData instance from the request
    meta = request.project_data.metadata
    project_data = ProjectData(
        metadata=ProjectMetadata(
            name=meta.name,
            created=meta.created,
            modified=meta.modified,
            version=meta.version,
        ),
        semantic_model=request.project_data.semantic_model,
        canvas_model=request.project_data.canvas_model,
    )

    fs.save_project(request.file_path, project_data)

    file_size = (
        os.path.getsize(request.file_path)
        if os.path.isfile(request.file_path)
        else 0
    )

    return SaveProjectResponse(
        success=True,
        file_path=request.file_path,
        file_size=file_size,
    )


# =============================================================================
#  6.  Model Validate  —  POST /api/v1/model/validate
# =============================================================================

from app.services.validator import ModelValidator
from app.services.model_manager import ModelManager


@router.post("/model/validate")
async def validate_model(request: ValidateRequest):
    """Validate a semantic model.

    **POST** ``/api/v1/model/validate``

    Request body::

        {"model": {"id": "...", "elements": [...], ...}}

    Response (200)::

        {"isValid": true/false, "errors": [...], "warnings": [...]}
    """
    # Build a temporary ModelManager with the request model data
    mm = ModelManager()
    mm.model = request.model

    validator = ModelValidator(mm)
    result = validator.validate()
    return result.to_dict()


# =============================================================================
#  7.  Export SVG  —  POST /api/v1/export/svg
# =============================================================================


@router.post("/export/svg", response_model=ExportResponse)
async def export_svg(request: ExportSVGRequest):
    """Export SVG markup to a file.

    **POST** ``/api/v1/export/svg``

    Request body::

        {"svgMarkup": "<svg>...</svg>", "outputPath": "C:/exports/diagram.svg"}

    Response (200)::

        {"success": true, "filePath": "...", "fileSize": 12345}
    """
    import os

    from app.services.export_service import ExportService

    service = ExportService()
    service.export_svg(request.svg_markup, request.output_path)

    file_path = request.output_path
    if not file_path.lower().endswith(".svg"):
        file_path += ".svg"

    file_size = os.path.getsize(file_path) if os.path.isfile(file_path) else 0

    return ExportResponse(success=True, file_path=file_path, file_size=file_size)


# =============================================================================
#  8.  Export PNG  —  POST /api/v1/export/png
# =============================================================================


@router.post("/export/png", response_model=ExportResponse)
async def export_png(request: ExportPNGRequest):
    """Export Base64-encoded PNG image to a file.

    **POST** ``/api/v1/export/png``

    Request body::

        {"imageData": "iVBORw0KGgo...", "outputPath": "C:/exports/diagram.png"}

    Response (200)::

        {"success": true, "filePath": "...", "fileSize": 12345}
    """
    import os

    from app.services.export_service import ExportService

    service = ExportService()
    service.export_png(request.image_data, request.output_path)

    file_path = request.output_path
    if not file_path.lower().endswith(".png"):
        file_path += ".png"

    file_size = os.path.getsize(file_path) if os.path.isfile(file_path) else 0

    return ExportResponse(success=True, file_path=file_path, file_size=file_size)


# =============================================================================
#  9.  Project List  —  GET /api/v1/project/list
# =============================================================================


@router.get("/project/list")
async def list_projects():
    """Return all registered projects. Auto-removes entries with missing paths."""
    import os as _os
    from app.services.project_registry import get_project_registry

    registry = get_project_registry()
    records = registry.list_all()
    valid: list[dict] = []
    for r in records:
        if _os.path.exists(r.path) or _os.path.exists(_os.path.dirname(r.path)):
            valid.append({
                "name": r.name, "path": r.path,
                "created": r.created, "modified": r.modified,
            })
        else:
            registry.remove(r.path)  # Auto-clean stale entries
    return {"projects": valid}


# =============================================================================
#  10.  Project Register  —  POST /api/v1/project/register
# =============================================================================


class RegisterProjectRequest(BaseModel):
    name: str
    path: str


@router.post("/project/register")
async def register_project(request: RegisterProjectRequest):
    """Register a project in the persistent registry."""
    from app.services.project_registry import get_project_registry

    registry = get_project_registry()
    record = registry.register(request.name, request.path)
    return {
        "success": True,
        "project": {
            "name": record.name, "path": record.path,
            "created": record.created, "modified": record.modified,
        },
    }


# =============================================================================
#  11.  Project Delete  —  DELETE /api/v1/project/delete
# =============================================================================


class DeleteProjectRequest(BaseModel):
    path: str


@router.post("/project/delete")
async def delete_project(request: DeleteProjectRequest):
    """Remove a project from the registry (does not delete files on disk)."""
    from app.services.project_registry import get_project_registry

    registry = get_project_registry()
    removed = registry.remove(request.path)
    return {"success": removed}


# =============================================================================
#  12.  Project Rename  —  POST /api/v1/project/rename
# =============================================================================


class RenameProjectRequest(BaseModel):
    path: str
    new_name: str


@router.post("/project/rename")
async def rename_project(request: RenameProjectRequest):
    """Rename a project in the registry."""
    from app.services.project_registry import get_project_registry

    registry = get_project_registry()
    record = registry.register(request.new_name, request.path)
    return {
        "success": True,
        "project": {
            "name": record.name, "path": record.path,
            "created": record.created, "modified": record.modified,
        },
    }

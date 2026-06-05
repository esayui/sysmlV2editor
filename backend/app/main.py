"""
SysML v2 Modeler — FastAPI Application Entry Point
"""
import os
import time
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router as api_router
from app.services.parser.errors import SysML2SyntaxError
from app.services.file_service import (
    FileServiceError,
    InvalidProjectNameError,
    InvalidProjectFileError,
    ProjectNotFoundError as FileServiceProjectNotFoundError,
    SaveError,
)
from app.services.project_registry import init_project_registry

# ---------------------------------------------------------------------------
#  Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger("sysml2.api")


# ===================================================================
#  FastAPI Application
# ===================================================================

app = FastAPI(
    title="SysML v2 Modeler API",
    description="Backend API for SysML v2 graphical modeling tool",
    version="1.0.0",
)

# ===================================================================
#  CORS Middleware
# ===================================================================
# Allow frontend dev server (Vite on localhost:5173) to access the API.

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===================================================================
#  Request Logging Middleware
# ===================================================================
# Logs method, path, status code, and duration for every request.


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log each HTTP request: method, path, status, duration (ms)."""
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "%s %s  →  %d  (%.2f ms)",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


# ===================================================================
#  Global Exception Handlers
# ===================================================================


# -- 400: SysML v2 Syntax Error --------------------------------------------------


@app.exception_handler(SysML2SyntaxError)
async def syntax_error_handler(request: Request, exc: SysML2SyntaxError):
    """Map SysML2SyntaxError → 400 with structured error body."""
    return JSONResponse(
        status_code=400,
        content={
            "code": "SYNTAX_ERROR",
            "message": exc.message,
            "location": {
                "line": exc.line,
                "column": exc.column,
            }
            if (exc.line is not None or exc.column is not None)
            else None,
            "details": exc.context or None,
        },
    )


# -- 404: File Not Found ---------------------------------------------------------


@app.exception_handler(FileNotFoundError)
async def file_not_found_handler(request: Request, exc: FileNotFoundError):
    """Map FileNotFoundError → 404 with structured error body."""
    return JSONResponse(
        status_code=404,
        content={
            "code": "NOT_FOUND",
            "message": str(exc) if str(exc) else "The requested resource was not found.",
        },
    )


# -- 403: Permission Error -------------------------------------------------------


@app.exception_handler(PermissionError)
async def permission_error_handler(request: Request, exc: PermissionError):
    """Map PermissionError → 403 with structured error body."""
    return JSONResponse(
        status_code=403,
        content={
            "code": "PERMISSION_DENIED",
            "message": str(exc) if str(exc) else "Permission denied.",
        },
    )


# -- 400: Invalid Project Name --------------------------------------------------


@app.exception_handler(InvalidProjectNameError)
async def invalid_project_name_handler(request: Request, exc: InvalidProjectNameError):
    """Map InvalidProjectNameError → 400 (bad request)."""
    return JSONResponse(
        status_code=400,
        content={
            "code": "INVALID_PROJECT_NAME",
            "message": str(exc),
        },
    )


# -- 400: Invalid Project File --------------------------------------------------


@app.exception_handler(InvalidProjectFileError)
async def invalid_project_file_handler(request: Request, exc: InvalidProjectFileError):
    """Map InvalidProjectFileError → 400 (bad request / corrupted file)."""
    return JSONResponse(
        status_code=400,
        content={
            "code": "INVALID_PROJECT_FILE",
            "message": str(exc),
        },
    )


# -- 404: Project Not Found (FileService) ---------------------------------------


@app.exception_handler(FileServiceProjectNotFoundError)
async def project_not_found_handler(
    request: Request, exc: FileServiceProjectNotFoundError
):
    """Map FileService ProjectNotFoundError → 404."""
    return JSONResponse(
        status_code=404,
        content={
            "code": "NOT_FOUND",
            "message": str(exc),
        },
    )


# -- 500: Save Error (FileService) ----------------------------------------------


@app.exception_handler(SaveError)
async def save_error_handler(request: Request, exc: SaveError):
    """Map SaveError → 500 (I/O failure during save)."""
    logger.exception("Save error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "code": "SAVE_ERROR",
            "message": str(exc),
        },
    )


# -- 500: Unhandled / Generic ----------------------------------------------------


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Catch-all for unhandled exceptions → 500 Internal Server Error."""
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "code": "INTERNAL_ERROR",
            "message": "An unexpected internal error occurred. "
            "Please check the server logs.",
        },
    )


# ===================================================================
#  Router Registration
# ===================================================================

# ===================================================================
#  Project Registry Initialization
# ===================================================================

_registry_db_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
init_project_registry(_registry_db_dir)
logger.info("ProjectRegistry initialized at %s", os.path.join(_registry_db_dir, "projects.db"))

# ===================================================================
#  Router Registration
# ===================================================================

app.include_router(api_router)


# ===================================================================
#  Root Endpoint
# ===================================================================


@app.get("/")
async def root():
    """Root endpoint — API info."""
    return {
        "name": "SysML v2 Modeler API",
        "version": "1.0.0",
        "docs": "/docs",
    }

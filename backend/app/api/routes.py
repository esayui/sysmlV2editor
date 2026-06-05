"""
API Routes — /api/v1/*
"""
from fastapi import APIRouter

router = APIRouter(prefix="/api/v1")


@router.get("/health")
async def health_check():
    """
    Health check endpoint.

    Returns 200 with status "ok" when the service is running.
    Used by the frontend to verify backend connectivity on load.
    """
    return {"status": "ok"}

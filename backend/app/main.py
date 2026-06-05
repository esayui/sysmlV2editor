"""
SysML v2 Modeler — FastAPI Application Entry Point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router

app = FastAPI(
    title="SysML v2 Modeler API",
    description="Backend API for SysML v2 graphical modeling tool",
    version="1.0.0",
)

# ---- CORS Middleware ----
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

# ---- Register API Router ----
app.include_router(api_router)


@app.get("/")
async def root():
    """Root endpoint — API info."""
    return {
        "name": "SysML v2 Modeler API",
        "version": "1.0.0",
        "docs": "/docs",
    }

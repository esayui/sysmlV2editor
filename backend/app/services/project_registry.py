"""
Project Registry — SQLite-based persistent storage for project metadata.

Stores project name, path, and timestamps so the project list
survives application restarts.
"""

from __future__ import annotations

import sqlite3
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


DB_FILENAME = "projects.db"


@dataclass
class ProjectRecord:
    """A single project entry in the registry."""
    name: str
    path: str
    created: str      # ISO 8601
    modified: str     # ISO 8601


class ProjectRegistry:
    """Manages the project registry SQLite database."""

    def __init__(self, db_dir: str):
        """
        Args:
            db_dir: Directory where the SQLite database file will be stored.
        """
        self.db_path = os.path.join(db_dir, DB_FILENAME)
        self._init_db()

    # ------------------------------------------------------------------
    # Database initialization
    # ------------------------------------------------------------------

    def _init_db(self) -> None:
        """Create the projects table if it does not exist."""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS projects (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    name        TEXT    NOT NULL,
                    path        TEXT    NOT NULL UNIQUE,
                    created     TEXT    NOT NULL,
                    modified    TEXT    NOT NULL
                )
            """)
            conn.commit()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def register(self, name: str, path: str) -> ProjectRecord:
        """Register a new project or update an existing one (keyed by path)."""
        now = datetime.now(timezone.utc).isoformat()
        with sqlite3.connect(self.db_path) as conn:
            # UPSERT: update if path exists, insert if not
            conn.execute(
                """
                INSERT INTO projects (name, path, created, modified)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(path) DO UPDATE SET
                    name     = excluded.name,
                    modified = excluded.modified
                """,
                (name, path, now, now),
            )
            conn.commit()
        return ProjectRecord(name=name, path=path, created=now, modified=now)

    def list_all(self) -> list[ProjectRecord]:
        """Return all registered projects, most-recently-modified first."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT name, path, created, modified FROM projects ORDER BY modified DESC"
            ).fetchall()
        return [
            ProjectRecord(
                name=row["name"],
                path=row["path"],
                created=row["created"],
                modified=row["modified"],
            )
            for row in rows
        ]

    def get_by_path(self, path: str) -> Optional[ProjectRecord]:
        """Look up a project by its file path."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT name, path, created, modified FROM projects WHERE path = ?",
                (path,),
            ).fetchone()
        if row is None:
            return None
        return ProjectRecord(
            name=row["name"],
            path=row["path"],
            created=row["created"],
            modified=row["modified"],
        )

    def remove(self, path: str) -> bool:
        """Remove a project from the registry. Returns True if deleted."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("DELETE FROM projects WHERE path = ?", (path,))
            conn.commit()
            return cursor.rowcount > 0


# ------------------------------------------------------------------
# Singleton (created in main.py during app startup)
# ------------------------------------------------------------------

_registry: Optional[ProjectRegistry] = None


def get_project_registry() -> ProjectRegistry:
    """Return the global ProjectRegistry singleton."""
    global _registry
    if _registry is None:
        raise RuntimeError("ProjectRegistry has not been initialized. Call init_project_registry() first.")
    return _registry


def init_project_registry(db_dir: str) -> ProjectRegistry:
    """Initialize the global ProjectRegistry singleton."""
    global _registry
    _registry = ProjectRegistry(db_dir)
    return _registry

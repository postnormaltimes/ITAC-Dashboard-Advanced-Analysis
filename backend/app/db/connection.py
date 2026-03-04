
import duckdb
import os
from pathlib import Path

# Resolve absolute project root from this file's location:
#   connection.py is at  backend/app/db/connection.py
#   backend dir  =       3 parents up  (db -> app -> backend)
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
# Default DB lives at <repo_root>/data/warehouse.duckdb
_DEFAULT_DB_PATH = str(_BACKEND_DIR.parent / "data" / "warehouse.duckdb")

DB_PATH = os.getenv("DB_PATH", _DEFAULT_DB_PATH)

class DuckDBManager:
    def __init__(self, db_path=DB_PATH):
        self.db_path = db_path

    def get_connection(self):
        """Returns a DuckDB connection."""
        conn = duckdb.connect(self.db_path, read_only=True)
        return conn

db_manager = DuckDBManager()

def get_db():
    """Dependency for FastAPI endpoints."""
    conn = db_manager.get_connection()
    try:
        yield conn
    finally:
        conn.close()

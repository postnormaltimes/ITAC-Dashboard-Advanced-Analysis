
import duckdb
import os

DB_PATH = os.getenv("DB_PATH", "../data/warehouse.duckdb")

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

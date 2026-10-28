import sys
import os
import asyncio

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.database import SessionLocal
from backend.app.services.maintenance_service import clear_all_operational_warnings


def cleanup_operational_warnings():
    """
    Safely deletes operational warning data and dependent records.
    GUARANTEE: Preserves 100% of User accounts, roles, credentials, settings, and AuditLogs.
    """
    db = SessionLocal()
    try:
        asyncio.run(clear_all_operational_warnings(db=db, create_backup=True))
    finally:
        db.close()


if __name__ == "__main__":
    cleanup_operational_warnings()

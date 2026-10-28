import logging
from sqlalchemy import text
from backend.app.database import engine

logger = logging.getLogger("crisisbridge.migrations")

def run_safe_migrations():
    """
    Applies non-destructive, additive migrations to existing database tables.
    Never drops tables or clears existing records.
    """
    logger.info("Running safe additive migrations...")
    
    # Columns to ensure in assistance_requests table
    columns_to_add = [
        ("acknowledged_by_id", "INTEGER REFERENCES users(id)"),
        ("acknowledged_at", "DATETIME"),
        ("dispatched_by_id", "INTEGER REFERENCES users(id)"),
        ("dispatched_at", "DATETIME"),
        ("citizen_verification_status", "VARCHAR(50)"),
        ("citizen_verified_at", "DATETIME"),
        ("citizen_verification_notes", "TEXT"),
        ("resolved_by_id", "INTEGER REFERENCES users(id)"),
        ("resolution_notes", "TEXT")
    ]
    
    with engine.connect() as conn:
        # Check users table for preferred_language
        try:
            conn.execute(text("SELECT preferred_language FROM users LIMIT 1"))
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE users ADD COLUMN preferred_language VARCHAR(10) DEFAULT 'en'"))
                conn.commit()
                logger.info("Safely added column 'preferred_language' to table 'users'")
            except Exception as e:
                logger.warning(f"Could not add 'preferred_language' to users: {e}")
                try:
                    conn.rollback()
                except Exception:
                    pass

        # User location and profile columns that may be missing from older databases
        user_columns_to_add = [
            ("location_updated_at", "DATETIME"),
            ("location_accuracy_radius_m", "FLOAT DEFAULT 500.0"),
            ("district", "VARCHAR(100)"),
            ("city", "VARCHAR(100)"),
            ("state", "VARCHAR(100)"),
            ("postal_code", "VARCHAR(20)"),
            ("location_geojson", "TEXT"),
        ]
        for col_name, col_type in user_columns_to_add:
            try:
                conn.execute(text(f"SELECT {col_name} FROM users LIMIT 1"))
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass
                try:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}"))
                    conn.commit()
                    logger.info(f"Safely added column '{col_name}' to table 'users'")
                except Exception as alter_err:
                    logger.warning(f"Could not add '{col_name}' to users: {alter_err}")
                    try:
                        conn.rollback()
                    except Exception:
                        pass

        for col_name, col_type in columns_to_add:
            try:
                # Check if column already exists in table
                check_query = text(f"SELECT {col_name} FROM assistance_requests LIMIT 1")
                conn.execute(check_query)
            except Exception:
                # Column does not exist, safely add it
                try:
                    conn.rollback() # reset transaction state before altering
                except Exception:
                    pass
                try:
                    alter_query = text(f"ALTER TABLE assistance_requests ADD COLUMN {col_name} {col_type}")
                    conn.execute(alter_query)
                    conn.commit()
                    logger.info(f"Safely added column '{col_name}' to table 'assistance_requests'")
                except Exception as alter_err:
                    logger.warning(f"Could not add column '{col_name}': {alter_err}")
                    try:
                        conn.rollback()
                    except Exception:
                        pass

        # Warning RAG columns
        warning_rag_columns = [
            ("rag_sources_json", "TEXT"),
            ("rag_grounding_score", "VARCHAR(50)"),
            ("rag_query_used", "TEXT"),
            ("rag_status", "VARCHAR(50) DEFAULT 'Grounded'")
        ]
        for col_name, col_type in warning_rag_columns:
            try:
                check_query = text(f"SELECT {col_name} FROM warnings LIMIT 1")
                conn.execute(check_query)
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass
                try:
                    alter_query = text(f"ALTER TABLE warnings ADD COLUMN {col_name} {col_type}")
                    conn.execute(alter_query)
                    conn.commit()
                    logger.info(f"Safely added column '{col_name}' to table 'warnings'")
                except Exception as alter_err:
                    logger.warning(f"Could not add column '{col_name}' to warnings: {alter_err}")
                    try:
                        conn.rollback()
                    except Exception:
                        pass
        # Ensure authority_notifications table exists
        try:
            conn.execute(text("SELECT id FROM authority_notifications LIMIT 1"))
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
            try:
                from backend.app.models.authority_notification import AuthorityNotification
                AuthorityNotification.__table__.create(bind=conn, checkfirst=True)
                conn.commit()
                logger.info("Safely created table 'authority_notifications'")
            except Exception as table_err:
                logger.warning(f"Could not create table 'authority_notifications': {table_err}")
                try:
                    conn.rollback()
                except Exception:
                    pass
    
    logger.info("Safe additive migrations complete.")


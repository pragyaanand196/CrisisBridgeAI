import sqlite3
import os
import sys
import datetime
import requests

def run_purge():
    db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "crisisbridge.db"))
    print(f"Target Database: {db_path}")
    assert os.path.exists(db_path), f"Database not found at {db_path}"

    # 1. Verify backup exists
    backups = [f for f in os.listdir(os.path.dirname(db_path)) if "pre_user_warning_purge" in f]
    print(f"Verified pre-purge backups: {backups}")
    assert len(backups) > 0, "No pre-purge backup found!"

    # 2. Connect to database
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # Pre-deletion counts
    tables = [
        "authority_notifications",
        "notification_delivery_records",
        "citizen_responses",
        "assistance_requests",
        "verification_reports",
        "resources",
        "audit_logs",
        "response_zones",
        "warning_target_areas",
        "warnings",
        "users",
        "system_configs"
    ]
    
    pre_counts = {}
    for t in tables:
        pre_counts[t] = cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    
    print("\n--- PRE-PURGE RECORD COUNTS ---")
    for t, c in pre_counts.items():
        print(f"  {t}: {c}")

    # 3. Transactional Deletion in Foreign-Key Dependency Order
    print("\n--- EXECUTING TRANSACTIONAL DELETION ---")
    conn.execute("BEGIN TRANSACTION;")
    try:
        # Child 1: authority_notifications (references users, assistance_requests)
        cur.execute("DELETE FROM authority_notifications;")
        del_auth_notif = cur.rowcount
        
        # Child 2: notification_delivery_records (references warnings, users, response_zones, etc.)
        cur.execute("DELETE FROM notification_delivery_records;")
        del_delivery = cur.rowcount
        
        # Child 3: citizen_responses (references warnings, response_zones, users)
        cur.execute("DELETE FROM citizen_responses;")
        del_responses = cur.rowcount
        
        # Child 4: assistance_requests (references warnings, response_zones, users)
        cur.execute("DELETE FROM assistance_requests;")
        del_assist = cur.rowcount
        
        # Child 5: verification_reports (references warnings, users)
        cur.execute("DELETE FROM verification_reports;")
        del_verif = cur.rowcount
        
        # Child 6: resources (references response_zones)
        cur.execute("UPDATE resources SET response_zone_id = NULL;")
        
        # Child 7: audit_logs (timeline events and user logs)
        cur.execute("DELETE FROM audit_logs;")
        del_audit = cur.rowcount
        
        # Child 8: response_zones (references warnings)
        cur.execute("DELETE FROM response_zones;")
        del_zones = cur.rowcount
        
        # Child 9: warning_target_areas (references warnings)
        cur.execute("DELETE FROM warning_target_areas;")
        del_target = cur.rowcount
        
        # Child 10: warnings (disconnect parent_warning_id self-ref then delete)
        cur.execute("UPDATE warnings SET parent_warning_id = NULL;")
        cur.execute("DELETE FROM warnings;")
        del_warnings = cur.rowcount
        
        # Child 11: users (all citizen, authority, admin accounts)
        cur.execute("DELETE FROM users;")
        del_users = cur.rowcount

        conn.execute("COMMIT;")
        print("Transaction successfully committed.")
    except Exception as e:
        conn.execute("ROLLBACK;")
        print(f"ERROR: Transaction failed and rolled back: {e}")
        raise e

    # 4. Foreign Key Integrity Check
    fk_violations = cur.execute("PRAGMA foreign_key_check;").fetchall()
    print(f"\nForeign Key Check Violations: {len(fk_violations)}")
    assert len(fk_violations) == 0, f"FK Violations detected: {fk_violations}"

    # 5. Post-deletion counts
    post_counts = {}
    for t in tables:
        post_counts[t] = cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]

    print("\n--- POST-PURGE RECORD COUNTS ---")
    for t, c in post_counts.items():
        print(f"  {t}: {c}")

    conn.close()

    assert post_counts["users"] == 0, f"Users remaining: {post_counts['users']}"
    assert post_counts["warnings"] == 0, f"Warnings remaining: {post_counts['warnings']}"
    assert post_counts["warning_target_areas"] == 0
    assert post_counts["response_zones"] == 0
    assert post_counts["notification_delivery_records"] == 0
    assert post_counts["audit_logs"] == 0

    print("\n[SUCCESS] Direct database verification passed: 0 users and 0 warnings.")
    
    return {
        "pre_counts": pre_counts,
        "post_counts": post_counts,
        "deleted": {
            "users": del_users,
            "warnings": del_warnings,
            "warning_target_areas": del_target,
            "response_zones": del_zones,
            "notification_delivery_records": del_delivery,
            "audit_logs": del_audit,
            "citizen_responses": del_responses,
            "assistance_requests": del_assist,
            "authority_notifications": del_auth_notif,
            "verification_reports": del_verif
        }
    }

if __name__ == "__main__":
    run_purge()

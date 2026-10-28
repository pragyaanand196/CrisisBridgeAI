import sys
import os
import argparse
import asyncio
from datetime import datetime, timezone

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.database import SessionLocal
from backend.app.models.user import User
from backend.app.models.warning import Warning
from backend.app.models.warning_target_area import WarningTargetArea
from backend.app.models.notification_delivery_record import NotificationDeliveryRecord
from backend.app.models.response_zone import ResponseZone
from backend.app.models.citizen_response import CitizenResponse
from backend.app.models.assistance_request import AssistanceRequest
from backend.app.models.verification_report import VerificationReport
from backend.app.models.resource import Resource
from backend.app.models.audit_log import AuditLog
from backend.app.services.maintenance_service import (
    create_database_backup,
    get_cleanup_scope_inspection,
    clear_all_operational_warnings
)


async def main():
    parser = argparse.ArgumentParser(
        description="Controlled CrisisBridge AI Warning Cleanup Maintenance Script"
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Explicitly authorize and execute the cleanup operation. Without this flag, a dry-run inspection is performed."
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="Skip database backup before cleanup (NOT recommended)."
    )
    args = parser.parse_args()

    print("=" * 80)
    print("CRISISBRIDGE AI - CONTROLLED WARNING CLEANUP MAINTENANCE")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()} UTC")
    print("=" * 80)

    db = SessionLocal()
    try:
        # 1. Inspection & Scope Assessment
        inspection = get_cleanup_scope_inspection(db)
        to_remove = inspection["to_remove"]
        to_preserve = inspection["to_preserve"]
        users_preview = inspection["users_preview"]

        print("\n[SCOPE INSPECTION - PLANNED REMOVAL (WARNING-SPECIFIC)]")
        print(f"  * Warnings:                       {to_remove['warnings_count']}")
        print(f"  * Warning Target Areas:           {to_remove['warning_target_areas_count']}")
        print(f"  * Response Zones:                 {to_remove['response_zones_count']}")
        print(f"  * Notification Delivery Records:  {to_remove['notification_delivery_records_count']}")
        print(f"  * Citizen Responses:              {to_remove['citizen_responses_count']}")
        print(f"  * Warning Assistance Requests:    {to_remove['assistance_requests_count']}")
        print(f"  * Authority Notifications:        {to_remove.get('authority_notifications_count', 0)}")

        print("\n[SCOPE INSPECTION - STRICTLY PRESERVED]")
        print(f"  [OK] User Accounts:               {to_preserve['users_count']} (100% Intact)")
        print(f"  [OK] Historical Audit Logs:       {to_preserve['audit_logs_count']} (100% Intact)")
        print(f"  [OK] Verification Reports:        {to_preserve['verification_reports_count']} (Preserved)")
        print(f"  [OK] Emergency Resources:         {to_preserve['resources_count']} (Preserved)")

        print(f"\n[REGISTERED USERS SNAPSHOT ({len(users_preview)} accounts)]")
        for u in users_preview:
            print(f"  - User #{u['id']}: {u['email']} [{u['role']}] - {u['full_name']} ({u['location_name']})")

        if not args.confirm:
            print("\n" + "#" * 80)
            print("DRY-RUN COMPLETE: No changes were made to the database.")
            print("To execute this cleanup and remove the old warnings, run:")
            print("    python safe_clear_warnings.py --confirm")
            print("#" * 80 + "\n")
            return

        # 2. Execution Confirmation
        print("\n[EXECUTING CONTROLLED TRANSACTIONAL CLEANUP...]")
        res = await clear_all_operational_warnings(
            db=db,
            admin_user=None,
            create_backup=not args.no_backup
        )

        print("\n" + "=" * 80)
        print("CLEANUP COMPLETED SUCCESSFULLY")
        print("=" * 80)
        if res.get("backup_file"):
            print(f"Database Backup Created: {res['backup_file']}")
        print(f"Deleted Records Breakdown:")
        for k, v in res["deleted_records"].items():
            print(f"  - {k}: {v} removed")
        print(f"Preserved Records Breakdown:")
        for k, v in res["preserved_records"].items():
            print(f"  [OK] {k}: {v} preserved")
        print(f"User Accounts Verification: {res['user_verification']['total_accounts']} accounts verified unchanged.")
        print("=" * 80 + "\n")

    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())

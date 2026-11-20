"""
CrisisBridge AI - Cleanup Operational Warnings (Backwards-compatibility proxy)
Executes backend/scripts/cleanup_operational_warnings.py
"""
import os
import sys
import runpy

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

TARGET_SCRIPT = os.path.join(os.path.dirname(__file__), "scripts", "cleanup_operational_warnings.py")

if __name__ == "__main__":
    runpy.run_path(TARGET_SCRIPT, run_name="__main__")

"""
CrisisBridge AI - Test Backend Runner (Backwards-compatibility proxy)
Executes backend/tests/test_backend.py
"""
import os
import sys
import runpy

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

TARGET_TEST = os.path.join(os.path.dirname(__file__), "tests", "test_backend.py")

if __name__ == "__main__":
    runpy.run_path(TARGET_TEST, run_name="__main__")

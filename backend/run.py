import uvicorn
import sys
import os

# Add workspace root to sys.path so 'backend.app' imports resolve reliably
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

if __name__ == "__main__":
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=True)

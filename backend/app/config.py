import os
from pydantic_settings import BaseSettings
from typing import List

_BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_DEFAULT_DB_FILE = os.path.join(_BASE_DIR, "crisisbridge.db").replace("\\", "/")
_DEFAULT_DB_URL = f"sqlite:///{_DEFAULT_DB_FILE}"

class Settings(BaseSettings):
    PROJECT_NAME: str = "CrisisBridge AI"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Database Configuration: PostgreSQL (production) or SQLite (fallback)
    DATABASE_URL: str = os.getenv("DATABASE_URL") if os.getenv("DATABASE_URL") and "sqlite:///." not in os.getenv("DATABASE_URL") else _DEFAULT_DB_URL
    
    # JWT Authentication
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "crisisbridge-super-secret-production-key-change-in-env-987654321")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # AI Keys (Optional - falls back to deterministic engine gracefully if not set)
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    
    # CORS Origins
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "*"
    ]
    
    # Deterministic Analytics Default Thresholds
    DEFAULT_COMMUNICATION_GAP_THRESHOLD: float = 40.0  # Alert if >40% no-response / failure
    DEFAULT_UNDERSTANDING_GAP_THRESHOLD: float = 25.0  # Alert if >25% 'dont_understand'
    DEFAULT_ASSISTANCE_SURGE_THRESHOLD: int = 5        # Alert if >=5 active help requests in a zone
    DEFAULT_INSUFFICIENT_DATA_THRESHOLD: int = 3       # Flag if total responses < 3
    
    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

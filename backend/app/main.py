import logging
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from backend.app.config import settings
from backend.app.database import engine, Base
import backend.app.models  # Load all models into metadata
from backend.app.routers import (
    auth,
    warnings,
    zones,
    citizen,
    assistance,
    verification,
    resources,
    analytics,
    reports,
    admin,
    notifications,
    ws
)

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("crisisbridge.main")

# Initialize database tables
Base.metadata.create_all(bind=engine)

# Apply safe non-destructive migrations to existing database
try:
    from backend.app.migrations import run_safe_migrations
    run_safe_migrations()
except Exception as e:
    logger.warning(f"Migration runner notice: {e}")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="CrisisBridge AI — Closed-Loop Warning-to-Action Disaster Communication and Response Verification Platform",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Exception Handler to ensure standard JSON error structure
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error processing {request.method} {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred. Please contact the disaster operations team."}
    )

# Register API Routers
api_v1 = settings.API_V1_STR
app.include_router(auth.router, prefix=api_v1)
app.include_router(warnings.router, prefix=api_v1)
app.include_router(zones.router, prefix=api_v1)
app.include_router(citizen.router, prefix=api_v1)
app.include_router(assistance.router, prefix=api_v1)
app.include_router(verification.router, prefix=api_v1)
app.include_router(resources.router, prefix=api_v1)
app.include_router(analytics.router, prefix=api_v1)
app.include_router(reports.router, prefix=api_v1)
app.include_router(admin.router, prefix=api_v1)
app.include_router(notifications.router, prefix=api_v1)
app.include_router(ws.router)

@app.get("/")
def root():
    return {
        "platform": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "Operational",
        "mode": "Warning-to-Action Closed-Loop Communication Engine",
        "api_docs": "/docs"
    }

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": settings.PROJECT_NAME}

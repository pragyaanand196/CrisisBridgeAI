# CrisisBridge AI — AI-Powered Disaster Communication and Response Verification Platform

[![Python](https://img.shields.io/badge/Python-3.12-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF.svg)](https://vitejs.dev/)
[![CAP v1.2](https://img.shields.io/badge/Standard-CAP%20v1.2-critical.svg)](https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2.html)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)

CrisisBridge AI is a closed-loop **Warning-to-Action disaster communication and response verification platform**. Rather than functioning merely as a one-way alert broadcast system, it bridges the critical operational gap between official disaster warnings and confirmed citizen safety actions through localized **Response Zones**, controlled **AI language simplification & translation**, a strict **Human Authority Approval Layer**, real-time **citizen feedback tracking**, **deterministic operational analytics** (Communication Gaps, Understanding Gaps, Assistance Surges, Warning-to-Action Scores), **information verification & debunking**, and **immutable post-disaster audit reporting**.

---

## 🌟 Key Innovations & Workflows

1. **Closed-Loop Warning-to-Action Cycle**:
   - Continuous operational bridge connecting warning authoring $\to$ citizen delivery $\to$ language comprehension $\to$ emergency assistance triage $\to$ authority dispatch and resolution.
2. **Geographical Response Zones**:
   - Subdivides affected target disaster regions into localized polygon Response Zones with population estimates, delivery tracking, and live operational statuses.
3. **Controlled AI with Human Authority Approval Layer**:
   - Translates and simplifies technical emergency bulletins into accessible 6th-grade English and Hindi without hallucinating emergency shelters, helplines, or instructions.
   - Built with strict guardrails: authorities must review, edit, approve, or reject AI-generated simplifications prior to citizen broadcast.
4. **Deterministic Operational Analytics & WTA Score**:
   - Transparent, audit-proof mathematical calculations computing:
     - Delivery Rate, Acknowledgement Rate, Understanding Rate, Assistance Request Rate, No-Response Rate, Failure Rate.
     - **Warning-to-Action (WTA) Score** (0–100 operational communication effectiveness index).
     - Automated Situation Classifications: *Stable, Attention Required, Critical, Understanding Gap, Communication Gap, Assistance Surge, Insufficient Data, Location Mismatch, Conflicting Information, Warning Updated, Warning Cancelled, Notification Delivery Failure*.
5. **Information Verification & Rumor Clarification**:
   - Citizens and field observers submit conflicting rumors and misinformation reports. Authorities review claims, verify facts against official data, and publish official clarifications.
6. **Immutable Audit Trail & Post-Disaster Reports**:
   - 100% data-backed lifecycle analysis with chronological event timelines, audit logs, and bottleneck detection.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, Vite 8, React Router v7, Vanilla CSS Design System, Leaflet & React-Leaflet, Lucide React |
| **Backend API** | Python 3.12, FastAPI, Uvicorn, Pydantic v2, WebSockets |
| **Database & Spatial** | SQLAlchemy 2.0 (PostgreSQL / PostGIS compatible, SQLite fallback), Shapely GeoJSON spatial analysis |
| **Authentication & RBAC** | JWT (JSON Web Tokens via python-jose), Passlib (bcrypt), Role-Based Access Control (`citizen`, `authority`, `administrator`) |
| **AI & Guardrails** | OpenAI GPT & Google Gemini API integrations with automated fallback to deterministic template engine and HuggingFace Sentence-Transformers |
| **Standards** | Common Alerting Protocol (OASIS CAP v1.2) compliant alert serialization |

---

## 📁 Project Structure

```text
CrisisBridge AI/
├── backend/
│   ├── app/
│   │   ├── knowledge/               # Disaster SOP documents & vector indices
│   │   │   ├── documents/           # SOP Markdown guides (flood, cyclone, earthquake, etc.)
│   │   │   ├── structured_sop_bullets.json
│   │   │   └── vector_index.json
│   │   ├── models/                  # SQLAlchemy ORM models
│   │   │   ├── assistance_request.py
│   │   │   ├── audit_log.py
│   │   │   ├── authority_notification.py
│   │   │   ├── citizen_response.py
│   │   │   ├── notification_delivery_record.py
│   │   │   ├── resource.py
│   │   │   ├── response_zone.py
│   │   │   ├── system_config.py
│   │   │   ├── user.py
│   │   │   ├── verification_report.py
│   │   │   ├── warning.py
│   │   │   └── warning_target_area.py
│   │   ├── routers/                 # FastAPI API route controllers
│   │   │   ├── admin.py
│   │   │   ├── analytics.py
│   │   │   ├── assistance.py
│   │   │   ├── auth.py
│   │   │   ├── citizen.py
│   │   │   ├── notifications.py
│   │   │   ├── reports.py
│   │   │   ├── resources.py
│   │   │   ├── verification.py
│   │   │   ├── warnings.py
│   │   │   ├── ws.py
│   │   │   └── zones.py
│   │   ├── schemas/                 # Pydantic request/response schemas
│   │   ├── services/                # Core business logic services
│   │   │   ├── ai_service.py        # Simplification, translation & guardrails
│   │   │   ├── analytics_service.py # Deterministic metrics & WTA calculations
│   │   │   ├── auth_service.py      # Token creation & password verification
│   │   │   ├── cap_service.py       # OASIS CAP v1.2 serialization
│   │   │   ├── geo_service.py       # Spatial polygon & location matching
│   │   │   ├── notification_service.py
│   │   │   ├── rag_service.py       # Retrieval-augmented grounding
│   │   │   └── websocket_manager.py # Live updates & alerts
│   │   ├── config.py                # Pydantic application settings
│   │   ├── database.py              # SQLAlchemy engine & session maker
│   │   ├── main.py                  # FastAPI application entrypoint
│   │   └── migrations.py            # Non-destructive additive database migrations
│   ├── requirements.txt             # Backend Python dependencies
│   ├── run.py                       # Backend development server runner
│   └── test_backend.py              # In-memory automated verification test suite
├── frontend/
│   ├── public/                      # Static assets, disaster imagery, icons
│   ├── src/
│   │   ├── assets/                  # Frontend image assets & SVG icons
│   │   ├── components/
│   │   │   ├── authority/           # Authority consoles (Triage table, Approval modal, etc.)
│   │   │   ├── citizen/             # Citizen portals (Active warning cards, Audio reader, etc.)
│   │   │   ├── common/              # Shared UI components (Navbar, Sidebar, Modals, Badges)
│   │   │   └── map/                 # Leaflet disaster maps and response zone overlays
│   │   ├── context/                 # React Contexts (Auth, WebSocket, Notification, Sidebar)
│   │   ├── pages/                   # Application route views (Dashboards, Details, Portals)
│   │   ├── services/                # Axios/Fetch API client wrappers
│   │   ├── styles/                  # CSS design system (components.css, pages.css, theme.css)
│   │   ├── App.jsx                  # Main router and view coordinator
│   │   └── main.jsx                 # React root mount
│   ├── package.json                 # Frontend dependencies and build scripts
│   └── vite.config.js               # Vite bundler configuration
├── .env.example                     # Environment template with placeholders
├── .gitignore                       # Git exclusion rules (protects data, node_modules, keys)
├── package.json                     # Monorepo orchestration scripts
├── README.md                        # Project documentation
└── requirements.txt                 # Root Python requirements
```

---

## ⚡ Prerequisites

Before running the application, make sure you have the following installed:
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **Python**: v3.10, v3.11, or v3.12
- **npm**: v9.0.0 or higher
- **Git**

---

## 🚀 Setup & Installation Guide

### 1. Clone the Repository
```bash
git clone https://github.com/pragyaanand196/CrisisBridgeAI.git
cd CrisisBridgeAI
```

### 2. Configure Backend Environment
Create your local environment file by copying the template:
```bash
# On Linux/macOS
cp .env.example .env

# On Windows PowerShell
Copy-Item .env.example .env
```

Open `.env` and configure your settings:
- `JWT_SECRET_KEY`: Set a secure random string (e.g. run `openssl rand -hex 32` or `python -c "import secrets; print(secrets.token_hex(32))"`).
- `DATABASE_URL`: Defaults to `sqlite:///./crisisbridge.db`. For production PostgreSQL, set `postgresql://<user>:<password>@<host>:5432/<dbname>`.
- `OPENAI_API_KEY` / `GEMINI_API_KEY`: *(Optional)* Add your API key for live LLM simplification, or leave empty to use the built-in deterministic fallback engine.

### 3. Install Backend Dependencies
It is recommended to use a Python virtual environment:
```bash
# Create and activate virtual environment
python -m venv .venv

# On Windows PowerShell
.venv\Scripts\Activate.ps1

# On Linux/macOS
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 4. Run Safe Database Migrations
CrisisBridge AI uses non-destructive, additive migrations to configure and upgrade database schemas without wiping existing data:
```bash
python -c "from backend.app.migrations import run_safe_migrations; run_safe_migrations()"
```

### 5. Install Frontend Dependencies
```bash
cd frontend
npm install
cd ..
```

---

## 🖥️ Running the Application

### Option A: Monorepo Orchestration Scripts (Root)
From the project root directory:
```bash
# Start Backend (runs at http://127.0.0.1:8000)
npm run start:backend

# Start Frontend (in a separate terminal, runs at http://localhost:5173)
npm run start:frontend
```

### Option B: Manual Startup

**Terminal 1 — Backend:**
```bash
python backend/run.py
```
- API Server: `http://127.0.0.1:8000`
- Interactive OpenAPI Docs: `http://127.0.0.1:8000/docs`
- ReDoc Docs: `http://127.0.0.1:8000/redoc`

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```
- Frontend Web Portal: `http://localhost:5173`

---

## 🧪 Verification & Test Suite

### Running Backend Verification Tests
The backend test suite runs against an **isolated in-memory SQLite database** (`sqlite:///:memory:`), ensuring your production and development database records are never modified:
```bash
python backend/test_backend.py
```
This tests:
1. User registration, password hashing (bcrypt), and RBAC JWT issuance.
2. OASIS Common Alerting Protocol (CAP v1.2) serialization.
3. Controlled AI simplification and Hindi translation fallback.
4. Warning creation and spatial Response Zone subdivision.
5. Citizen feedback capture and response tracking.
6. Deterministic analytics, situation matrix, and Understanding Gap detection.
7. Emergency assistance surge detection and triage priority.
8. Rumor verification and authority debunk logging.

### Building Frontend for Production
```bash
cd frontend
npm run build
```

---

## 🔒 Security, Privacy & Data Architecture Notice

> [!IMPORTANT]
> **Database Records and User Data are Never Committed to Git:**
> Cloning this repository provides the complete, working source code and assets. It does **not** transfer existing live user accounts, passwords, password hashes, historical disaster warnings, citizen feedback records, or incident reports.
>
> All database files (`*.db`, `*.sqlite`, `*.sqlite3`) and environment files containing real credentials (`.env`) are strictly excluded via `.gitignore`.
>
> When deployed in a new environment, running `backend/run.py` or `run_safe_migrations()` will initialize a clean, secure database schema ready for your operational use.

---

## 🤝 Roles & Access Control

- **Citizen**: View active localized disaster warnings, receive plain-language and Hindi instructions, confirm understanding or flag confusion, request emergency assistance, and submit rumor clarification reports.
- **Authority**: Create technical CAP warnings, review and edit AI plain-language adaptations through the Human Approval Modal, monitor Response Zone delivery metrics, triage emergency assistance requests, and publish debunk notices.
- **Administrator**: Full platform audit logs, authority user onboarding, system configuration, and post-disaster operational review.

---

## 📄 License
This project is proprietary and maintained by the CrisisBridge AI Team.

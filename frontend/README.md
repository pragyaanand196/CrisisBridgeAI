# CrisisBridge AI — Frontend Web Application

The frontend of CrisisBridge AI is a high-performance, responsive single-page application built with **React 19**, **Vite 8**, **React Router v7**, and a custom **Warm Disaster Management Design System** (Inter + Outfit typography, terracotta/espresso/sand palette).

It delivers operational interfaces for three primary user roles:
1. **Citizens**: Real-time localized disaster warnings, emergency instructions in simplified English & Hindi, audio read-aloud assistance, location management, quick response feedback, and emergency assistance requests.
2. **Authorities**: Warning authoring, spatial response zone targeting, AI language simplification review (Human Approval Modal), real-time situation matrix, gap detection alerts, and assistance triage.
3. **Administrators**: System-wide configuration, operational audit logs, authority onboarding, and post-disaster analysis reports.

---

## 📁 Directory Structure

```text
frontend/
├── public/                       # Static public assets (hero photos, disaster rescue bg, icons)
│   ├── disaster-rescue-bg.png
│   ├── flood-rescue-convoy.png
│   ├── flood-rescue-convoy.jpg
│   ├── hero-disaster.jpg
│   ├── community-safety.jpg
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── components/               # Modular reusable UI components
│   │   ├── authority/            # Authority dashboards, triage tables, human approval modals
│   │   ├── citizen/              # Active warning cards, audio read-aloud, assistance modals
│   │   ├── common/               # Shared components (Navbar, Sidebar, TopHeader, Modal, Toast)
│   │   ├── incident/             # Incident tracking components
│   │   └── map/                  # Leaflet geospatial maps and response zone overlays
│   ├── context/                  # React Context providers
│   │   ├── AuthContext.jsx       # Authentication, user session & role-based access
│   │   ├── NotificationContext.jsx # Real-time notification banners & toasts
│   │   ├── SidebarWidthContext.jsx # Responsive dashboard sidebar state
│   │   └── WebSocketContext.jsx  # Live push updates for warnings & triage
│   ├── pages/                    # Route pages (Admin, Authority, Citizen, Login, Register, etc.)
│   ├── services/                 # Backend API service integrations
│   │   ├── api.js                # Core REST API client with JWT session token management
│   │   └── citizenIncidentService.js # Incident report submission & status queries
│   ├── styles/                   # Unified CSS Design System
│   │   ├── theme.css             # Color palette tokens, typography & CSS variables
│   │   ├── index.css             # Global base resets & layout foundations
│   │   ├── components.css        # Component-level styles (cards, tables, modals, buttons)
│   │   └── pages.css             # Page-specific views & responsive layouts
│   ├── App.jsx                   # Application router and layout manager
│   ├── index.css                 # Root CSS import aggregator
│   └── main.jsx                  # Application entry point
├── package.json                  # Dependencies and scripts
└── vite.config.js                # Vite build and dev server configuration
```

---

## 🛠️ Development & Build Commands

Run commands from the `frontend/` directory (or use root monorepo scripts):

```bash
# Install frontend dependencies
npm install

# Start Vite local development server (http://localhost:5173)
npm run dev

# Build optimized production bundle
npm run build

# Preview production build locally
npm run preview
```

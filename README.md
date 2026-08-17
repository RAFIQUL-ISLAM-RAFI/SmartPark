# 🅿️ SmartPark — Full-Stack Intelligent Parking Management System

[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?style=flat&logo=node.js)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat&logo=express)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-4169E1?style=flat&logo=postgresql)](https://www.postgresql.org)
[![Jest](https://img.shields.io/badge/Jest-Tested-C21325?style=flat&logo=jest)](https://jestjs.io)
[![Security](https://img.shields.io/badge/Security-Hardened-00C79A?style=flat&logo=securityscorecard)](https://helmetjs.github.io)

**SmartPark** is a production-grade, full-stack parking management system. It features real-time parking bay allocation with row-level transaction locks, authoritative fee computation, digital SVG QR ticketing, printable receipts, and interactive analytics.

---

## 🌟 Key Features & Portfolio Highlights

- ⚡ **Real-Time Facility Dashboard**: Live occupancy ring gauges, today's revenue analytics, and live activity streams.
- 🎯 **Visual Parking Grid**: Real-time visual map with status pulses, quick checkout triggers, and type/plate filtering.
- 🔒 **ACID Row-Lock Concurrency**: Implements `FOR UPDATE SKIP LOCKED` inside PostgreSQL transactions to guarantee zero double-booking under concurrent traffic.
- 🎫 **Digital QR Code Tickets & Printable Receipts**: Instant SVG QR code generation for vehicle check-in and clean, printable checkout receipts.
- 📊 **Interactive Analytics & Reports**: 7-day revenue velocity trends, vehicle type breakdown donuts, and capacity gauges.
- 🛡️ **Enterprise Security**:
  - Tiered rate limiting with `express-rate-limit` (General + Write Protection).
  - Strict Content Security Policy (CSP) & HTTP headers via `helmet`.
  - Schema-driven input validation and sanitization using `zod`.
  - Full XSS output encoding across all frontend components.
- 🔄 **Live Backend Status Indicator**: Real-time header connection badge with latency ping and auto-reconnect polling.
- 💾 **Data Management**: Full database export (JSON/CSV), schema-validated data restore, and transaction-safe resetting.

---

## 🏗️ Architecture Overview

```mermaid
graph TD
    Client["Browser Frontend (HTML5 / Vanilla CSS / Vanilla JS)"]
    APIClient["SP.api (Fetch Client + Signal Timeout)"]
    StateStore["SP.state (Reactive Store + Live Sync)"]
    Express["Express.js Server (Port 5000)"]
    Middlewares["Security Middlewares (Helmet, CORS, RateLimit, Zod)"]
    Services["Domain Services (Parking, Reports, Settings, Admin)"]
    DB[("PostgreSQL Database (pg Connection Pool)")]

    Client <--> StateStore
    StateStore <--> APIClient
    APIClient -->|REST API Requests| Middlewares
    Middlewares --> Express
    Express --> Services
    Services -->|Transactions with Row-Locks| DB
```

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Vanilla JavaScript (ES6+), Modern CSS3 Tokens, HTML5 Semantic Elements |
| **Backend** | Node.js, Express.js |
| **Database** | PostgreSQL, `pg` Connection Pool with Transaction Management |
| **Validation** | `zod` Schema Validation & Sanitization |
| **Security & Utilities** | `helmet`, `cors`, `express-rate-limit`, `compression`, `morgan` |
| **Testing** | Jest, Supertest |

---

## 📁 Project Structure

```
SmartPark/
├── backend/
│   ├── config/
│   │   └── db.js               # PostgreSQL connection pool & transaction helper
│   ├── controllers/            # Thin HTTP controllers
│   │   ├── activityController.js
│   │   ├── adminController.js
│   │   ├── dashboardController.js
│   │   ├── exportController.js
│   │   ├── reportController.js
│   │   ├── settingsController.js
│   │   ├── slotController.js
│   │   └── vehicleController.js
│   ├── middleware/
│   │   ├── errorHandler.js     # Centralized error handler & PostgreSQL code translation
│   │   └── validate.js         # Zod schemas & sanitization middleware
│   ├── routes/                 # Express API routes
│   ├── services/               # Authoritative business logic
│   │   ├── adminService.js     # Reset & JSON data restore
│   │   ├── exportService.js    # JSON & CSV generators
│   │   ├── parkingService.js   # Slot allocation with row locks
│   │   ├── reportService.js    # Aggregations & reporting
│   │   └── settingsService.js  # Safe slot resizing & configuration
│   ├── utils/
│   │   ├── AppError.js         # Custom application error class
│   │   ├── asyncHandler.js     # Express async error catcher
│   │   └── feeCalculator.js    # Authoritative billing & duration calculations
│   └── server.js               # Express entrypoint with rate-limiting & static serving
├── frontend/
│   ├── index.html              # Main application shell & modal dialogs
│   ├── style.css               # Comprehensive design system & print styles
│   └── js/
│       ├── api.js              # REST fetch wrapper with timeout & health ping
│       ├── state.js            # Asynchronous reactive state store
│       ├── utils.js            # Formatters, icons, and counter animations
│       ├── toast.js            # Non-intrusive toast notifications
│       ├── charts.js           # Lightweight SVG chart renderers
│       ├── render.js           # UI view renderers & QR generator
│       └── app.js              # Routing, event wiring, and background sync
├── database/
│   ├── schema.sql              # Database schema with partial indexes & triggers
│   └── seed.sql                # Initial demonstration data
├── scripts/
│   └── setup-db.js             # Automated database setup script
├── tests/
│   └── api.test.js             # Integration & edge case test suite
└── package.json
```

---

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org) (v18 or higher)
- [PostgreSQL](https://www.postgresql.org) (v14 or higher)

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory:
```bash
cp .env.example .env
```

Edit `.env` with your database credentials:
```env
PORT=5000
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/smartpark
CORS_ORIGIN=*
```

### 4. Database Setup & Seeding
Run the database migration and seed script:
```bash
npm run db:setup
```

### 5. Launch the Application
```bash
# Development (with nodemon auto-restart)
npm run dev

# Production
npm start
```

Open your browser at **http://localhost:5000**.

---

## 🧪 Testing

Run the automated integration test suite:
```bash
npm test
```

The test suite validates:
- Real-time vehicle check-in and automatic bay assignment.
- Double-parking prevention and duplicate plate rejection.
- Authoritative fee calculation (same-hour minimum stay and overnight stays).
- Safe slot expansion & shrinkage guardrails.
- Malformed inputs, XSS strings, and unknown route handling.

---

## 📡 REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Live PostgreSQL connectivity check & latency |
| `GET` | `/api/dashboard` | Aggregated statistics, occupancy, and today's revenue |
| `GET` | `/api/slots` | All parking bays with current occupancy status |
| `GET` | `/api/slots/:slotNumber` | Detailed status of a specific parking bay |
| `GET` | `/api/vehicles` | List parked vehicles with filter and search queries |
| `POST` | `/api/vehicles/park` | Check in a vehicle and allocate the next free bay |
| `POST` | `/api/vehicles/remove` | Check out a vehicle, free the bay, and compute fee receipt |
| `GET` | `/api/activity` | Paginated activity history with filters and sorting |
| `GET` | `/api/reports` | Analytics breakdown (`?range=all\|today\|7\|30`) |
| `GET` | `/api/settings` | Current facility configuration |
| `PUT` | `/api/settings` | Update rates, total slots, theme, and preferences |
| `GET` | `/api/export/json` | Download full facility state as JSON |
| `GET` | `/api/export/csv` | Download history logs as CSV |
| `POST` | `/api/admin/import` | Restore full database from JSON export |
| `POST` | `/api/admin/reset` | Clear all active sessions and vehicle history |

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).

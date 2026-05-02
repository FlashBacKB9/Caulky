# Caulky — Personal Finance Manager

> Track your income, expenses, savings and investments from a clean self-hosted web app.

Caulky is a full-stack personal finance application built for self-hosting. It lets you record and categorize every movement, visualize your spending over time, compare years side by side, set budgets, and track investment funds — all from a single, fast interface that runs entirely on your own server.

---

## Features

- **Dashboard** — Customizable widgets: account balances, monthly/annual income & expenses, net balance, budget progress and custom charts. Drag, resize and rearrange freely.
- **Movements** — Full transaction log with filters, search, tags, notes and file attachments. Kanban and day-grouped views.
- **Annual view** — Monthly breakdown of every category across the year with trend charts.
- **Charts** — Build your own charts: choose metric, axis, period, sign and advanced filters. Saved per session.
- **Comparisons** — Compare any two years side by side or overlaid. Line, bar or area display. Clickable legend to hide/show series. Multi-year summary table and evolution charts.
- **Budgets** — Rolling or fixed-period budgets linked to movement types, with progress bars and dashboard widgets.
- **Investments** — Track investment funds with purchase history, units, price at purchase and current value via Yahoo Finance.
- **Import** — Upload bank CSV/XLSX files, map columns, auto-match movement types and preview before committing.
- **Backup & restore** — Full JSON export/import with granular control over which sections to restore. One-click factory reset with default seed data.
- **Dark mode** — System-aware, toggleable.
- **Multi-currency** — EUR, USD, GBP and more.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS v4, Recharts, TanStack Query, React Router |
| Backend | FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic v2 |
| Database | PostgreSQL 16 |
| Prices | Yahoo Finance API (investment funds) |
| Deployment | Docker + Docker Compose |

---

## Self-hosting with Docker

The easiest way to run Caulky is with the included `docker-compose.yml`. It builds the frontend, starts the API and spins up a Postgres database — all in one command.

### Requirements

- Docker and Docker Compose installed on your server
- Ports 8081 (or your choice) open

### Deploy

```bash
git clone https://github.com/FlashBacKB9/Caulky.git
cd Caulky
docker compose up -d --build
```

The app will be available at `http://your-server:8081`.

On first start the backend runs all database migrations automatically and seeds a set of default categories and accounts so you can start adding movements right away.

### Via Portainer

1. **Stacks → Add stack**
2. Choose **Repository**
3. URL: `https://github.com/FlashBacKB9/Caulky`
4. Compose path: `docker-compose.yml`
5. Click **Deploy the stack**

Enable **GitOps update** (Polling) to auto-redeploy on push.

### Environment variables

The backend reads these from environment (or a `backend/.env` file in development):

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:spendly@localhost:5432/spendly` | PostgreSQL connection string |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins (`*` in docker-compose) |

---

## Local development

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create a .env with your local DATABASE_URL
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to `localhost:8000` automatically.

---

## Project structure

```
Caulky/
├── backend/
│   ├── app/
│   │   ├── models/        # SQLAlchemy models
│   │   ├── routers/       # FastAPI route handlers
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── services/      # Business logic
│   │   ├── config.py
│   │   ├── database.py
│   │   └── main.py
│   ├── alembic/           # Database migrations
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/           # Axios API clients
│   │   ├── components/    # Shared components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── pages/         # Page components
│   │   └── App.tsx
│   ├── Dockerfile
│   ├── nginx.conf
│   └── vite.config.ts
└── docker-compose.yml
```

---

## License

MIT — do whatever you want with it.

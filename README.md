# Caulky — Personal Finance Manager

> Track your income, expenses, savings and investments from a clean self-hosted web app.

Caulky is a full-stack personal finance application built for self-hosting. It lets you record and categorize every movement, visualize your spending over time, compare years side by side, set budgets, and track investment funds — all from a single, fast interface that runs entirely on your own server.

---

## Features

- **Dashboard** — Customizable widgets: account balances, monthly/annual income & expenses, net balance, budget progress and custom charts. Drag, resize and rearrange freely.
- **Movements** — Full transaction log with filters, search, tags, notes and file attachments (with an in-app PDF/image viewer that supports zoom). Calendar, table and Kanban views.
- **Accounts** — Balance analytics and evolution per account, total net worth with composition breakdown, vehicle depreciation and asset/liability tracking.
- **Annual view** — Monthly breakdown of every category across the year with trend charts.
- **Charts** — Build your own charts: choose metric, axis, period, sign and advanced filters. Saved per session.
- **Comparisons** — Compare any two years side by side or overlaid. Line, bar or area display. Clickable legend to hide/show series. Multi-year summary table and evolution charts.
- **Analysis** — Financial health score, savings rate, emergency fund, 50/30/20 rule, spending heatmap and an AI-ready summary prompt.
- **Expense Control** — Monthly evolution by category with multi-year comparison, plus a subscriptions tab (active/inactive, annual cost, next charge estimate).
- **Budgets** — Rolling or fixed-period budgets linked to movement types, with progress bars, dashboard widgets and a floating alert bell.
- **Savings goals (Huchas)** — Goal-based savings accounts with target date and contribution projections.
- **Debts** — Mortgages and loans with French amortization schedule, real-payment tracking (capital/interest split), early-repayment simulator and equity integration with linked assets.
- **Investments** — Track investment funds with purchase history, units, price at purchase and current value via Yahoo Finance.
- **Import** — Upload bank CSV/XLSX files, map columns, auto-match movement types and preview before committing.
- **Backup & restore** — Full JSON export/import with granular control over which sections to restore. One-click factory reset with default seed data.
- **Customization** — Tabbed settings, custom languages and plugins, configurable navigation.
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
| `SECRET_KEY` | *(auto-generated)* | JWT signing secret. Generated automatically on first start and persisted in `backend/.secret_key`. Override with a fixed value in production if needed. |
| `COOKIE_SECURE` | `false` | Set to `true` when serving over HTTPS |

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

## Security considerations

Caulky is designed for **personal or small household use** on a trusted network. It does not implement certain hardening measures that a public-facing multi-tenant application would require:

- **No rate limiting on login or registration.** An attacker with network access to the server could attempt to brute-force passwords or create accounts in bulk. If you expose Caulky to the internet, consider placing it behind a reverse proxy (e.g. Nginx or Caddy) with request limiting, or restrict access via VPN / firewall rules.
- **Open registration.** Anyone who can reach the server can create an account. If you want to restrict access, either close the registration endpoint at the network level or add an invite-only mechanism.
- **`COOKIE_SECURE` is `false` by default.** Set it to `true` in your `.env` if you serve the app over HTTPS (recommended for any internet-facing deployment).
- **Plugin system executes arbitrary JavaScript.** Plugins are user-supplied code run directly in the app context via `new Function()`. The built-in scanner blocks obvious dangerous patterns, but regex-based filters can be bypassed. Only install plugins you have reviewed and trust. Do not share plugins between users — if a sharing mechanism were added in the future, it would need to run plugins inside a sandboxed `<iframe>` to be safe.
- **Session tokens are not revoked on logout.** Caulky uses JWT cookies with a 30-day lifetime. Logging out clears the cookie from the browser but does not invalidate the token server-side. In practice the cookie is `httponly` (not accessible to JavaScript), so the risk is low for trusted-network use. For internet-facing deployments with untrusted users, consider implementing a token blacklist or reducing the token lifetime.

For home or LAN use these limitations are generally acceptable. For any internet-exposed deployment, the mitigations above are strongly recommended.

---

## License

**CC BY-NC 4.0 — Attribution-NonCommercial**

You are free to use, copy, modify and distribute this project for any **non-commercial** purpose, as long as you credit the original:

> Caulky by [FlashBacKB9](https://github.com/FlashBacKB9) — https://github.com/FlashBacKB9/Caulky

**You may not** sell this software, offer it as a paid service, or use it in any way that generates revenue.

Full license: [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)

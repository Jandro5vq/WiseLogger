# ⏱️ WiseLogger

**A self-hosted work-time tracker built for people who care about precision.**

Log your workday, track tasks, manage breaks, and visualize your time — all from a clean, fast UI. Runs entirely on your own machine with zero cloud dependencies.

---

## Features

- **Daily shift tracking** — Start and close your workday, see live countdown to end-of-day
- **Task logging** — Add tasks with descriptions and tags; same task worked multiple times merges into a single grouped row
- **Break management** — Define scheduled break rules (always, by shift duration, by weekday); breaks auto-apply when a day starts and shift the expected end time
- **Timeline view** — Swimlane Gantt chart of your day with proportional bars per task
- **History** — Browse past days, edit tasks, see week-at-a-glance summaries with per-day breakdowns
- **Stats** — Weekly/monthly worked vs. expected charts and daily balance table
- **MCP server** — Expose a Model Context Protocol endpoint so AI assistants (Claude, GitHub Copilot, etc.) can log tasks on your behalf, including historical data import
- **Admin panel** — Manage users, reset passwords, assign roles
- **Dark / light theme** — System-aware with manual toggle
- **PWA-ready** — Installable as a desktop/mobile app

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 14](https://nextjs.org/) (App Router) |
| Database | SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| ORM | [Drizzle ORM](https://orm.drizzle.team/) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) |
| Charts | [Recharts](https://recharts.org/) |
| Auth | JWT + bcrypt (cookie-based sessions) |
| MCP | [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) |
| Runtime | Node.js |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install & Run

```bash
# Install dependencies
npm install

# Run database migrations
npm run db:migrate

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The first run seeds an admin user:

| Username | Password |
|----------|----------|
| `admin`  | `admin`  |

> **Change the admin password immediately** via Settings after first login.

### Production

```bash
npm run build
npm start
```

Or use Docker:

```bash
docker compose up -d
```

The app listens on port **3000** by default. Data is persisted in `./data/wiselogger.db`.

---

## MCP Server

WiseLogger exposes an [MCP](https://modelcontextprotocol.io/) endpoint at `/api/mcp` that lets AI assistants log and query your time data.

### Available Tools

| Tool | Description |
|------|-------------|
| `get_today_summary` | Full summary for today |
| `get_day_summary` | Summary for any specific date |
| `list_days` | List all recorded days, optionally filtered by range |
| `start_day` | Start a shift (defaults to today) |
| `close_day` | Close a shift |
| `add_task` | Add a task (supports past dates for bulk import) |
| `stop_active_task` | Stop the currently running task |

### Config Examples

In Settings → MCP API Key, you'll find ready-to-paste config snippets for **VS Code Copilot**, **Claude Desktop**, and **Claude Code**.

---

## Project Structure

```
src/
├── app/
│   ├── (app)/          # Authenticated routes: dashboard, history, stats, settings, admin
│   ├── (auth)/         # Login + setup pages
│   └── api/            # REST + MCP API routes
├── components/
│   ├── dashboard/      # Today stats, task list, timeline, breaks panel
│   ├── history/        # Week view, entry editor
│   └── layout/         # Sidebar, theme provider
└── lib/
    ├── auth/           # Session management
    ├── business/       # Balance, task, break logic
    ├── db/             # Drizzle schema + queries
    └── mcp/            # MCP tool definitions
```

---

## License

MIT

---

*Built with care for the focused worker.*

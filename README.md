# jpg-frontend — Docu Arch AI

React chat UI and admin ingestion dashboard for **jpg-adapter**.

```
LogicalDOC  →  jpg-adapter (:8001)  ←  Vite proxy (/api)  ←  this app (:3000)
                      ↕
                 RAG Engine
```

## Quick start

**Prerequisites:** jpg-adapter running on **http://localhost:8001** (see [jpg-adapter docs/runbooks/LOCAL_DEV.md](../jpg-adapter/docs/runbooks/LOCAL_DEV.md)).

```bash
cp .env.example .env
npm install
npm run dev
```

| Page | URL |
|------|-----|
| **AI Chat** | http://localhost:3000/chat |
| **Admin — ingestion** | http://localhost:3000/admin/ingestion |
| **Admin — activity log** | http://localhost:3000/admin/ingestion?tab=activity |

Open **http://localhost:3000** — redirects to chat.

---

## Environment (`.env`)

```env
# Vite dev proxy sends /api → http://127.0.0.1:8001
VITE_API_BASE_URL=/api

# Skip login wall locally (adapter still needs a session for folder browse)
VITE_AUTH_BYPASS=true
```

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE_URL` | API prefix (default `/api` — use proxy in dev) |
| `VITE_AUTH_BYPASS=true` | Show chat UI without cookie login check (dev only) |
| `VITE_ADMIN_API_KEY` | Optional — must match adapter `ADAPTER_QUERY_API_KEY` if set |

**Chat session:** `VITE_AUTH_BYPASS` only bypasses the frontend login screen. Folder browse and queries still need an adapter `ai_session` cookie unless adapter has `AI_SESSION_DEV_BYPASS=true`.

Get a session:

- Open AI Chat from LogicalDOC (recommended), or
- Visit a one-time exchange URL from adapter handoff — see [LD_CHAT_SETUP.md](../jpg-adapter/docs/ai-chat/LD_CHAT_SETUP.md)

Use **`localhost`** everywhere (not `127.0.0.1`) for cookies.

---

## Stack

- **React 19** + TypeScript
- **Vite** — dev server on port **3000**
- **Ant Design** — admin tables, layout
- **Tailwind CSS** — chat + admin styling
- **TanStack Query** — data fetching, polling

## Project layout

```
src/
├── api/              # HTTP client, query SSE, admin endpoints
├── components/       # Chat UI, sidebar, document picker
├── components/admin/ # Ingestion dashboard, activity log, pipeline waterfall
├── pages/admin/      # Admin routes
├── hooks/            # useBrowseTree, useSendQuery, …
└── utils/            # lifecycle labels, query progress, user-facing errors
```

## Chat behaviour

- Select documents in the **sidebar folder tree**, then ask a question.
- While waiting: live **pipeline stages** from RAG (`Retrieving documents…`, etc.).
- On failure: plain-language error in the thread (technical detail stays in adapter logs — `query_failed`).
- **Stop** button uses a square icon; sends abort to cancel streaming.

### Chat history

When a user opens AI Chat from LogicalDOC, the adapter creates an `ai_session` cookie and exposes the LogicalDOC **`userId`** via `GET /api/auth/me`. The frontend uses that id as the persistence key.

| What | Where |
|------|--------|
| User identity | Adapter session (`userId` from LogicalDOC handoff) |
| Chat threads + messages | **Browser `localStorage` only** — key `docu_chat_history_<userId>` |
| Server database | **Not used for chat history** (adapter Postgres is for ingestion/docs) |

History is restored after session timeout or re-login **in the same browser** for the same user. It is not synced across devices. Logout clears the server session but keeps local history.

There is **no app expiry** (kept until site data is cleared, private browsing ends, or the browser evicts storage). Saves cap at **40 sessions** per user; in-progress streaming replies are not stored.

## Admin dashboard

Polls adapter admin API every few seconds when open.

| Tab | Shows |
|-----|--------|
| Overview | Counts, progress, bulk throughput |
| Activity log | Timeline from document timestamps |
| Documents | Search + filter |
| Failures | Failed docs + retry |
| Health | Adapter / dependency checks |
| Sync | Reconciliation status |

Requires Postgres populated by adapter ingestion.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server → http://localhost:3000 |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm test` | Vitest unit tests |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Sign in required" / session expired | New LD handoff link or enable dev bypass on adapter |
| Empty folder tree | Check `/api/auth/me` — need valid `ai_session` |
| Query errors | See adapter logs (`grep query_failed`); often RAG OOM on k3d |
| Admin 401 | Set `VITE_ADMIN_API_KEY` if adapter requires query key |

Full stack runbook: **[jpg-adapter/docs/runbooks/LOCAL_DEV.md](../jpg-adapter/docs/runbooks/LOCAL_DEV.md)**

# Docu Arch AI — Frontend

React + Vite + Ant Design + Tailwind CSS chat UI for jpg_logicaldoc_rag.

## Setup

```bash
cd react
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Stack

- **React 19** + TypeScript
- **Vite** — dev server & build
- **Ant Design** — Layout, Tree, Input, Avatar, Tag
- **Tailwind CSS** — utility styling

## API layer

Separate modules under `src/api/`:

| File | Purpose |
|------|---------|
| `http.ts` | Base fetch client, auth headers, token refresh |
| `auth.ts` | Login (`/auth/verify-token`), logout, `/auth/me` |
| `query.ts` | Chat queries via `/query/sync` |
| `documents.ts` | File browser via `/documents/browse` |
| `types/` | TypeScript types matching backend schemas |

[TanStack Query](https://tanstack.com/query) hooks in `src/hooks/`:

- `useDocuments` — cached document list for sidebar tree
- `useSendQuery` — mutation for sending chat messages
- `useCurrentUser` — fetch authenticated user profile

## Backend connection

1. Start the API on port 8000
2. Copy env file: `cp .env.example .env`
3. Run the frontend: `npm run dev`

Vite proxies `/api` → `http://localhost:8000` in development.

### Login (dev)

Dev-only username/password login is enabled when `ENVIRONMENT=development`:

| Username | Password |
|----------|----------|
| `admin`  | `admin`  |

Override via `DEV_LOGIN_USERNAME` / `DEV_LOGIN_PASSWORD` in the root `.env`.

Production uses LogicalDOC context tokens via `/auth/verify-token`.

### Env vars

```env
VITE_API_BASE_URL=/api
```


| Command         | Description          |
|-----------------|----------------------|
| `npm run dev`   | Start dev server     |
| `npm run build` | Production build     |
| `npm run preview` | Preview production build |

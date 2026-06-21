# Deploying ScoutBrief

ScoutBrief is two deployables:

| Part | Code | Host | Why |
|---|---|---|---|
| **Console** (UI) | `apps/console` (Next.js 15) | **Vercel** | Static + serverless, standalone, no workspace deps |
| **Agent** (API) | `apps/agent` (Express + SQLite + Hedera SDK) | **Fly.io** (or any Node 22 host) | Long-running SSE server + persistent SQLite + Hedera keys |

The console talks to the agent over `NEXT_PUBLIC_AGENT_API_URL`. Deploy the agent first so you have a URL to point the console at.

---

## 1. Frontend → Vercel (the part this repo is wired for)

The console is a **standalone** Next.js app — it imports no workspace packages, so Vercel only needs to build `apps/console`.

### Import

1. Vercel → **Add New… → Project** → import `Nicolas6879/ScoutBrief`.
2. **Root Directory:** set to **`apps/console`** (Edit → pick the folder). This is the one setting that matters — it tells Vercel to build the console, not the monorepo root.
3. Framework preset auto-detects **Next.js**. Build/install commands: leave default (Vercel uses the root `pnpm-lock.yaml` and `pnpm@9` from `packageManager`).

### Environment variables (Production + Preview)

| Key | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_AGENT_API_URL` | `https://<your-agent-host>` | **Build-time** var (it's `NEXT_PUBLIC_`). Set it *before* the first build or redeploy after. No trailing slash. |
| `NEXT_PUBLIC_HASHSCAN_BASE` | `https://hashscan.io/testnet` | Optional; this is the default. |

4. **Deploy.** Vercel builds `apps/console` and serves it. Done.

> If you ever see the UI calling `localhost:3001`, the `NEXT_PUBLIC_AGENT_API_URL` wasn't set at build time — set it and **redeploy** (env changes for `NEXT_PUBLIC_` vars require a rebuild).

`apps/console/vercel.json` pins the framework; `apps/console/.env.example` documents the vars.

---

## 2. Backend → Fly.io (needed for the app to actually work)

The agent can't run on Vercel: it holds open SSE streams, writes a SQLite file, and signs Hedera transactions with long-lived keys.

`fly.toml` (repo root) is already configured: app `scoutbrief`, port 3001, a persistent volume mounted at `/data` (SQLite lives at `/data/scoutbrief.db`), and a `/health` check.

**Still required before `fly deploy` works:**

- [ ] A root **`Dockerfile`** that builds the workspace and runs `node apps/agent/dist/server.js` on a **Node 22+** base (needed for `node:sqlite`). `fly.toml` references it but it isn't in the repo yet.
- [ ] Push secrets with `fly secrets set …` (do **not** commit `.env`): `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`, `HEDERA_ESCROW_ID`, `HEDERA_ESCROW_KEY`, `HCS_AUDIT_TOPIC`, `HCS_POLICY_MANIFEST_TOPIC`, `TAVILY_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, plus the caps (`PER_BRIEF_CAP_TINYBARS`, `DAILY_CAP_TINYBARS`).
- [ ] Create the volume once: `fly volumes create scoutbrief_data --size 1 --region iad`.
- [ ] Enable CORS / allow the Vercel origin to call the agent (the console fetches it directly from the browser).

Then `fly deploy`, grab the `https://scoutbrief.fly.dev` URL, and put it in Vercel's `NEXT_PUBLIC_AGENT_API_URL`.

> The bounty requires the hosted demo URL to stay up ≥90 days — keep `min_machines_running = 1` (already set) so the agent doesn't cold-stop.

---

## 3. After both are up

- Update `manifest.json` → `endpoints.demo` / `endpoints.api` with the real URLs.
- Update `README.md` line 7 "Demo URL (pending deploy)" with the live link.
- Smoke test: open the Vercel URL, add an account, run a scout, confirm the pipeline animates and a HashScan receipt opens.

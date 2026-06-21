# ScoutBrief

> **Reference implementation of the Hedera Agent Kit V4 Hooks & Policies pattern.** Spend caps, counterparty allowlists, contextual approval, and on-chain audit — applied to a persistent account-intelligence dashboard that purchases real third-party APIs in HBAR.

**Hedera AI Bounty Week 5 submission** — *Hedera Policy Agent*

[Demo URL (pending deploy)](#) · [Live HCS audit topic](https://hashscan.io/testnet/topic/0.0.9261411) · [Policy manifest topic](https://hashscan.io/testnet/topic/0.0.9261410)

---

## What this is

ScoutBrief is an **account-intelligence dashboard** with on-chain governance for every external API call it makes. You add companies to a watchlist, hit a button, and watch the agent research each one in real time — with every policy decision visible as it happens.

**The user flow:**
1. Add accounts to the watchlist (Anthropic, Cohere, Mistral, your 20 prospects).
2. Select the ones you want and click "Scout". The agent fires immediately.
3. Watch the 7-node policy pipeline animate as the agent routes through each check: vendor allowlist → HBAR escrow → spend cap → web research → contextual approval → Hedera audit.
4. Each completed brief is saved to History. Every policy decision is logged in the Audit trail.
5. If a policy blocks a run, funds are refunded on-chain. The reason is shown inline. No hidden failures.

**What makes this real:** the Policy chain is genuinely load-bearing. Without `SpendLimitPolicy`, the escrow drains on every run unchecked. Without `CounterpartyAllowlistPolicy`, any vendor URL could be swapped in. Without `ContextualApprovalPolicy`, settlement happens before the brief has been synthesized. The policies are not decorators — they are the gate.

## How it satisfies the bounty brief

| Brief requirement | Implementation |
|---|---|
| Hooks AND Policies | 1 built-in non-blocking hook (`HcsAuditTrailHook`) + 3 custom blocking policies (each extends the Kit's `AbstractPolicy`/`AbstractHook`), all registered in the toolkit `hooks` array |
| Spend limits | `SpendLimitPolicy` (Post-Param-Norm) — per-brief cap + rolling 24h cap, re-fetches live escrow balance before each run |
| Allowed counterparties | `CounterpartyAllowlistPolicy` (Pre-Tool) — endpoint-hash allowlist; non-allowlisted URLs hard-blocked before any cost |
| Contextual approval | `ContextualApprovalPolicy` (Post-Core) — settlement hold gating escrow release |
| Real services purchased | Tavily search + Groq LLM + Gemini fallback — all real APIs, all purchased via HBAR in escrow |
| Interface integration | React Flow pipeline DAG streams policy state live; manifest at `/manifest`; budget gauge on dashboard |
| Indexed for ecosystem | HCS-2 policy manifest topic + agent `manifest.json` |
| Built using Hedera Agent Kit | V4 JS — policies fire through the Kit lifecycle on every `transfer_hbar_tool` invocation, not Express middleware |
| Payments in HBAR | Real HBAR transfers from a dedicated escrow account; charge via the Kit tool, release/refund signed with the escrow key; all txs visible on HashScan |

## Architecture

```
[Dashboard UI]  →  POST /scout/run  →  [Agent (Kit V4 + LangChain)]
                                            ↓ buyBrief() orchestrator
                                            ↓ transfer_hbar_tool invoked → Kit V4 lifecycle fires:
                                            │    ├─ CounterpartyAllowlistPolicy (Pre-Tool) → BLOCK if not in allowlist
                                            │    ├─ SpendLimitPolicy (Post-Param-Norm) → BLOCK if over cap
                                            │    └─ HcsAuditTrailHook (non-blocking) → audit charge
                                            ↓ charge settled: operator → escrow (real HBAR)
                                            ↓ Tavily.search → Groq / Gemini synthesis
                                            ↓ ContextualApprovalPolicy (Post-Core) → settlement hold
                                            ↓ escrowRelease (escrow-key-signed) → operator   [on block: escrowRefund]
                                            ↓ HCS audit topic write (intent · charge · release · complete)
                     SSE stream ←──────────────────────────────────────────────
                  (per-step events: node states → React Flow pipeline animates)
```

The 3 policies are registered in the toolkit `hooks` array (`apps/agent/src/agent.ts`) and execute inside the Kit lifecycle when `buyBrief()` invokes `transfer_hbar_tool`. Release/refund are escrow-key-signed transfers performed by the orchestrator (outside the Kit lifecycle, since they sign with the escrow key) and audited to HCS. Each run persists to SQLite (`accounts`, `runs`, `decisions` tables); the History and Audit tabs read from there.

## Stack

| Layer | Choice |
|---|---|
| Agent framework | Hedera Agent Kit V4 (JS / TypeScript) |
| LLM | Groq (Llama 3.1 70b) primary · Google Gemini 2.0 Flash fallback |
| Research API | Tavily |
| Chain | Hedera testnet |
| Currency | HBAR |
| Audit | HCS-2 topics (manifest topic + per-run audit topic) |
| Database | Node 22 built-in `node:sqlite` (no deps) |
| Frontend | Next.js 15.5 · React 19 · Tailwind v4 |
| Pipeline visualization | React Flow v12 (`@xyflow/react`) |
| Animations | Framer Motion |
| **Total cost** | **$0** |

## Run locally

```bash
# 1. Copy and fill .env
cp .env.example .env
# Edit .env: Hedera operator key/ID, escrow key/ID, HCS topic IDs,
#            Tavily API key, Groq API key, Gemini API key

# 2. Install deps
pnpm install

# 3. Compute endpoint hashes (anti-substitution for CounterpartyAllowlistPolicy)
pnpm hash:endpoints
# Paste output lines into .env

# 4. Start everything
pnpm -F @scoutbrief/agent dev    # agent API on :3001
pnpm -F @scoutbrief/console dev  # Next.js dashboard on :3000
```

Then open http://localhost:3000, add a company name to the watchlist, check it, and click Scout.

## Demo

See [DEMO.md](./DEMO.md) for the 3-minute walkthrough script + what to look for in each pipeline step.

## Submission

- **Bounty:** Hedera AI Bounty — Week 5 (Policy Agent)
- **Deadline:** 2026-06-21 23:59 UTC
- **Repository:** All code written during the hackathon window. Prior project [HIVE Protocol](https://github.com/Nicolas6879/HIVE) (ETHDenver on-chain automation winner) is referenced as credential only and shares no code.

## License

MIT

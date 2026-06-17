# ScoutBrief

> Policy-governed AI agent that delivers VC intelligence briefs via real x402+HBAR purchases of Tavily search and Resend email — on Hedera testnet.

**Hedera AI Bounty Week 5 submission** — *Hedera Policy Agent*

[Demo URL (pending)](#) · [Live HCS audit topic (pending)](#) · [Agent Manifest (pending)](#)

---

## What it does

Dana, a VC analyst, types `Brief on Anthropic, send to my-email@x.com`. ScoutBrief reasons over the request, picks brief depth (lite/standard/deep), pays Tavily and Resend in HBAR via x402, delivers a 1-page intelligence brief to her inbox, and anchors every decision to an HCS-2 audit topic — all within Hedera Agent Kit V4 Hooks and Policies that constrain spending, allowed counterparties, and require contextual approval before settlement.

## How it satisfies the bounty brief

| Brief requirement | Implementation |
|---|---|
| Hooks AND Policies | 2 non-blocking hooks (`auditLogHook`, `settlementHook`) + 3 blocking policies |
| Spend limits | `spendLimitPolicy` — per-brief cap + rolling 24h cap, re-fetches live escrow balance |
| Allowed counterparties | `counterpartyAllowlistPolicy` — endpoint-hash allowlist + per-recipient cap |
| Contextual approval | `contextualApprovalPolicy` — settlement hold T+10min + refund on Resend bounce |
| Real services purchased | Tavily search ($) + Resend email ($) — both real, instant-signup, do measurable work |
| Interface integration | Next.js chat UI streams policy events live; manifest served at `/manifest` |
| Indexed for ecosystem | HCS-2 policy manifest topic + agent `manifest.json` + AI Studio registry |
| Built using Hedera Agent Kit | V4 JS — hooks/policies registered via `BaseTool` lifecycle, not Express middleware |
| Payments in HBAR | x402 facilitator settles HBAR transfers from a dedicated escrow account |

## Architecture (short)

```
[Chat UI] → [Agent (Kit V4 + LangChain)]
   ↓ BuyBriefTool extends BaseTool
   ↓ Stage 1: auditLogHook (HCS log, non-blocking)
   ↓ Stage 2: counterpartyAllowlistPolicy (block invalid endpoints/recipients)
   ↓ x402 envelope → escrow account (real HBAR transfer)
   ↓ Stage 4: spendLimitPolicy (live escrow balance + caps)
   ↓ Tavily.search → Groq/Gemini synth → Resend.send
   ↓ Stage 6: contextualApprovalPolicy (settlement hold T+10min)
   ↓ Stage 7: settlementHook → release OR refund (real on-chain HBAR transfer)
   ↓ HashScan link visible in UI + audit message on HCS
```

## Stack

| | |
|---|---|
| Agent framework | Hedera Agent Kit V4 (JS) |
| LLM | Groq (Llama 3.1 70b) primary · Google Gemini 2.0 Flash fallback |
| Research API | Tavily |
| Email API | Resend |
| Chain | Hedera testnet |
| Currency | HBAR (no USDC — testnet faucet trivial) |
| Audit | HCS-2 topics |
| Frontend | Next.js 14 |
| Hosting | Fly.io (backend) + Vercel (frontend) |
| **Total cost** | **$0** |

## Run locally

```bash
# 1. Create accounts and fill .env (see .env.example)
cp .env.example .env
# edit .env with your Hedera operator + API keys

# 2. Install deps
pnpm install

# 3. Setup testnet (creates escrow + 2 HCS topics, prints values to add to .env)
pnpm setup

# 4. Compute endpoint hashes (anti-substitution policy)
pnpm hash:endpoints
# append output to .env

# 5. Start services
pnpm dev:facilitator   # x402 facilitator on :3002
pnpm dev:agent          # agent API on :3001
pnpm dev:console        # Next.js UI on :3000
```

## Try the live demo

> **Anonymous judges:** the demo URL pre-funds a session wallet. Just enter any email + a startup name and watch the policy chain in real time.

See [DEMO.md](./DEMO.md) for the 60-second walkthrough + HashScan links + Loom embed.

## Security

See [SECURITY.md](./SECURITY.md) for the threat model and anti-drain mitigations.

## Submission

- **Bounty:** Hedera AI Bounty — Week 5 (Policy Agent)
- **Deadline:** 2026-06-21 23:59 UTC
- **Payout:** $1,500 in HBAR
- **Repository:** This repo, with all code authored during the hackathon window. Prior project [HIVE Protocol](https://github.com/Nicolas6879/HIVE) (ETHDenver onchain-automation winner) is referenced as credential only and shares no code.

## License

MIT

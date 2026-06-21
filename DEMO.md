# ScoutBrief — Demo walkthrough

## Setup before recording

- Dashboard open at http://localhost:3000
- Watchlist empty (fresh state)
- Agent server running, SQLite fresh (or with 1–2 prior runs for History)
- Have 4–5 real company names ready: e.g. "Anthropic", "Cohere", "Mistral", "Perplexity", "Together AI"

---

## Script (~3 minutes)

### 0:00 — Dashboard cold open

Open the app. Show:
- The dark glassmorphism dashboard — sidebar on left, Live tab active
- Budget gauge in top bar showing `0.00 / X HBAR`
- Empty watchlist with placeholder

**Say:** *"This is ScoutBrief — an account-intelligence dashboard. Sales reps, founders doing outbound, recruiters — anyone who tracks a list of companies uses this to get a quick intelligence brief on each one. What makes it interesting is that every API call the agent makes is governed by a policy chain on Hedera."*

### 0:20 — Add accounts to watchlist

Type "Anthropic" into the Add account input → hit Enter. Watch the card animate in.
Add 3 more: "Cohere", "Mistral", "Perplexity".

**Say:** *"I've got four accounts on my watchlist. Now I'll check a couple and run a scout."*

### 0:40 — Select and trigger batch run

Check "Anthropic" and "Cohere". Click the **Scout 2 accounts** button.

The tab switches to Live automatically. Show the queue strip appearing at the top with two pills ("Anthropic ⚡", "Cohere ◌").

**Say:** *"The agent starts processing accounts one by one. Watch the pipeline animate."*

### 0:50 — Live pipeline walkthrough (Anthropic)

The 7-node pipeline lights up left to right. Walk through each node as it activates:

1. **Request** → violet pulse: *"Scout job entered the agent."*
2. **Vendor check** → cyan: *"CounterpartyAllowlistPolicy checks that Tavily and Groq are in the approved endpoint list. Non-listed vendors are hard-blocked before any money moves."*
3. **Initial charge** → *"The agent deducts HBAR from the operator wallet into a dedicated escrow account. Real on-chain transfer — you can follow the HashScan link."*
4. **Budget check** → amber: *"SpendLimitPolicy fires inside the charge lifecycle (Post-Param-Norm). It re-reads the live escrow balance and checks the per-brief cap and the rolling daily cap. If either would be exceeded it denies the transfer before it executes — so a blocked run costs nothing at all."*
5. **Web research** → fuchsia: *"Tavily returns sources. The LLM (Groq Llama 70b, Gemini as fallback) synthesizes the brief from those sources."*
6. **Final approval** → emerald: *"ContextualApprovalPolicy gates settlement. Once the brief is synthesized, it approves the release and the escrow returns the held HBAR to the operator — another real on-chain transfer, escrow-key-signed. Had the run failed, this same escrow would refund instead."*
7. **Hedera audit** → cyan: *"Every on-chain action is recorded to an HCS-2 audit topic — HcsAuditTrailHook logs the charge automatically, and the agent writes the intent, release, and completion records. Immutable, timestamped, publicly readable."*

The brief slides in below the pipeline when Anthropic finishes. Confetti fires.

**Click "Payment receipt"** to show HashScan with the real HBAR transfer.

### 1:40 — Queue strip advances to Cohere

The Cohere pill activates. The pipeline resets and runs for Cohere.

**Say:** *"The batch continues automatically. Each account gets its own run, its own set of policy evaluations, its own on-chain audit."*

### 2:00 — Show a blocked run (demonstrate SpendLimitPolicy)

*(For the demo, temporarily lower `PER_BRIEF_CAP_TINYBARS` in `.env` to `1000000` (0.01 HBAR — below the 0.05 HBAR per-brief charge) and restart the agent, or add a 3rd account after the daily cap has been partially consumed.)*

When the blocked run fires, the **Budget check** node turns red and the pipeline stops. A "Blocked before any cost" panel appears below — SpendLimitPolicy fires inside the charge's lifecycle (Post-Param-Norm), so the transfer never executes. No HBAR leaves the wallet.

**Say:** *"This is the spend cap firing. SpendLimitPolicy evaluated the per-brief and rolling daily caps and denied the transfer before it executed. Nothing was charged — not a partial charge, not a charge-then-refund. The wallet never moved. That's the strongest form of governance: the spend is stopped before it happens."*

> **To demo the refund path instead** (escrow → operator after a *post-charge* failure), trigger a vendor error after the charge — e.g. set an invalid `TAVILY_API_KEY`. The charge settles into escrow, the research step fails, and the agent issues an on-chain refund. The **"Refund receipt"** button then appears and links to the real refund tx on HashScan.

### 2:20 — History tab

Switch to History. Show the completed runs grouped by day.
Click on the Anthropic run to expand it — the frozen pipeline + brief renders inline.

**Say:** *"Every scout is saved. Click any run to replay its pipeline state and read the brief again. The HashScan and HCS links are there too."*

### 2:40 — Audit tab

Switch to Audit. Show the timeline of all decisions across all runs.
Click "Blocked only" filter — only the blocked run's decisions appear.
Expand one decision to show the JSON detail and HCS record link.

**Say:** *"The Audit tab is a cross-run decision log. Every policy evaluation, every hook call, every block is here. You can filter by type or time. Expand any entry to see the full decision data and its on-chain reference."*

### 2:55 — Technical toggle (optional)

Toggle "Dev mode" in the top-right corner. Show the pipeline node labels change from friendly ("Vendor check", "Budget check") to technical ("CounterpartyAllowlistPolicy", "SpendLimitPolicy").

**Say:** *"There's a developer mode that exposes the real policy names and hook names — useful for anyone integrating this pattern into their own agent."*

### 3:05 — Close

**Say:** *"ScoutBrief is a reference implementation of the V4 Hedera Agent Kit policy pattern — three blocking policies plus a built-in HCS audit-trail hook, wired into a real agent that buys real APIs in HBAR. The pipeline you just watched isn't a mock; those are live on-chain transactions. Fork the pattern, swap the tool, and you have the same governance layer for any agent that buys external services."*

---

## Things to verify live on HashScan

- **Charge tx**: operator account → escrow account, HBAR amount = `PER_BRIEF_HBAR`
- **Release tx** (on success): escrow account → operator account, escrow-key-signed
- **Refund tx** (if blocked/failed): escrow account → operator account
- **HCS audit topic**: messages per brief — `intent_logged`, charge (via HcsAuditTrailHook), `release_executed`, `decision_complete` (or `refund_issued` on a blocked run)

---

## If something goes wrong

| Symptom | Fix |
|---|---|
| Agent returns 500 | Check `apps/agent/.env` symlink exists: `ls -la apps/agent/.env` |
| Pipeline stays idle | Open browser console — check for SSE errors; verify agent is on :3001 |
| Budget shows 0/0 | Agent hasn't been hit yet; `/budget` returns after first run |
| Blocked on every run | `PER_BRIEF_CAP_TINYBARS` too low (must exceed 5000000 = 0.05 HBAR); bump it in `.env` and restart agent |

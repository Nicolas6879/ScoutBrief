// Agent HTTP server — entry point. Wires Hedera Agent Kit V4 + LangChain + policy chain.
// Implemented in M2 (Day 2). This is a placeholder so workspaces resolve.
import 'dotenv/config'
import express from 'express'

const app = express()
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'scoutbrief-agent', stage: 'M1.2-bootstrap' })
})

const port = Number(process.env.AGENT_PORT ?? 3001)
app.listen(port, () => {
  console.log(`[agent] listening on :${port}`)
})

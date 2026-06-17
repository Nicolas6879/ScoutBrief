/**
 * Resend email client. Free tier: 3000 emails/mo, 100/day.
 *
 * Sending from `onboarding@resend.dev` (Resend's shared domain) WITHOUT
 * domain verification is allowed for testing — but Resend only delivers to
 * the account owner's email address until a custom domain is verified.
 *
 * For the public demo, we'll need to verify a free duckdns.org subdomain
 * (M3.6 deploy step). Until then, the deliver flow works only for the
 * operator's own email.
 */
import { Resend } from 'resend'

let cached: Resend | null = null

function getClient(): Resend {
  if (cached) return cached
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY missing')
  cached = new Resend(process.env.RESEND_API_KEY)
  return cached
}

export interface ResendResult {
  messageId: string
  ms: number
}

export async function sendBriefEmail(args: {
  to: string
  topic: string
  markdown: string
}): Promise<ResendResult> {
  const start = Date.now()
  const resp = await getClient().emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev',
    to: args.to,
    subject: `ScoutBrief: ${args.topic}`,
    html: markdownToHtml(args.markdown),
    text: args.markdown,
  })

  if (resp.error) {
    throw new Error(`Resend error: ${resp.error.message}`)
  }
  if (!resp.data?.id) {
    throw new Error('Resend returned no message id')
  }
  return { messageId: resp.data.id, ms: Date.now() - start }
}

/** Minimal markdown → HTML conversion sufficient for plain briefs. */
function markdownToHtml(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let inList = false
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.startsWith('### ')) {
      if (inList) {
        out.push('</ul>')
        inList = false
      }
      out.push(`<h3>${escapeHtml(line.slice(4))}</h3>`)
    } else if (line.startsWith('## ')) {
      if (inList) {
        out.push('</ul>')
        inList = false
      }
      out.push(`<h2>${escapeHtml(line.slice(3))}</h2>`)
    } else if (line.startsWith('# ')) {
      if (inList) {
        out.push('</ul>')
        inList = false
      }
      out.push(`<h1>${escapeHtml(line.slice(2))}</h1>`)
    } else if (line.startsWith('- ')) {
      if (!inList) {
        out.push('<ul>')
        inList = true
      }
      out.push(`<li>${escapeHtml(line.slice(2))}</li>`)
    } else if (line === '') {
      if (inList) {
        out.push('</ul>')
        inList = false
      }
      out.push('<br/>')
    } else {
      if (inList) {
        out.push('</ul>')
        inList = false
      }
      out.push(`<p>${escapeHtml(line)}</p>`)
    }
  }
  if (inList) out.push('</ul>')
  return `<div style="font-family: -apple-system, sans-serif; max-width: 720px; margin: 0 auto;">${out.join('')}</div>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

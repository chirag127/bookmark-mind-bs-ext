#!/usr/bin/env node
/**
 * Generate placeholder promo tile + hero screenshots for CWS listing.
 * Uses node's built-in Canvas replacement (no Chrome required for these
 * synthetic tiles). Real screenshots of the running extension should
 * replace these before actual CWS submission.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(__dirname, '../docs/cws-assets')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

/**
 * Minimal SVG-first approach: generate SVG placeholder tiles that clearly
 * signal "placeholder — replace before submission" while still meeting CWS
 * dimension requirements. SVG-to-PNG conversion left to the user
 * (or use browser-use skill to open + screencap these).
 */

function svgPromoSmall() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4285f4"/>
      <stop offset="1" stop-color="#1a73e8"/>
    </linearGradient>
  </defs>
  <rect width="440" height="280" fill="url(#g)"/>
  <text x="30" y="60" fill="#ffffff" font-family="Inter, system-ui, sans-serif"
        font-size="24" font-weight="700">BookmarkMind</text>
  <text x="30" y="90" fill="#e8f0fe" font-family="Inter, system-ui, sans-serif" font-size="14">
    AI Bookmark Organizer
  </text>
  <g transform="translate(30, 130)">
    <rect x="0" y="0" width="380" height="40" rx="6" fill="rgba(255,255,255,0.15)"/>
    <text x="16" y="26" fill="#ffffff" font-family="Inter, sans-serif" font-size="14">
      🎁  13 built-in providers · bring your own key
    </text>
    <rect x="0" y="52" width="380" height="40" rx="6" fill="rgba(255,255,255,0.15)"/>
    <text x="16" y="78" fill="#ffffff" font-family="Inter, sans-serif" font-size="14">
      📁  FMHY-style functional folders
    </text>
    <rect x="0" y="104" width="380" height="40" rx="6" fill="rgba(255,255,255,0.15)"/>
    <text x="16" y="130" fill="#ffffff" font-family="Inter, sans-serif" font-size="14">
      🔐  AES-GCM encrypted key storage
    </text>
  </g>
</svg>`
}

function svgPromoMarquee() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="560" viewBox="0 0 1400 560">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4285f4"/>
      <stop offset="1" stop-color="#1a73e8"/>
    </linearGradient>
  </defs>
  <rect width="1400" height="560" fill="url(#g)"/>
  <text x="80" y="140" fill="#ffffff" font-family="Inter, system-ui, sans-serif"
        font-size="72" font-weight="800">BookmarkMind</text>
  <text x="80" y="200" fill="#e8f0fe" font-family="Inter, sans-serif" font-size="32">
    AI Bookmark Organizer · Bring your own key
  </text>
  <g transform="translate(80, 280)" font-family="Inter, sans-serif" fill="#ffffff">
    <text x="0" y="30" font-size="24">✨ 13 built-in OpenAI-compatible LLM providers</text>
    <text x="0" y="70" font-size="24">📁 Functional folder hierarchy: what services DO, not who provides</text>
    <text x="0" y="110" font-size="24">🔐 AES-GCM encrypted keys · no server · no telemetry</text>
    <text x="0" y="150" font-size="24">🏠 Local models supported: Ollama, LM Studio, OmniRoute, LiteLLM</text>
    <text x="0" y="190" font-size="24">🆓 Permanent free tiers: Groq, Cerebras, Gemini, OpenRouter, Mistral, HF</text>
  </g>
</svg>`
}

function svgScreenshot(title, subtitle, points) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
  <rect width="1280" height="800" fill="#0f1419"/>
  <rect x="0" y="0" width="1280" height="64" fill="#1a73e8"/>
  <text x="24" y="42" fill="#ffffff" font-family="Inter, sans-serif" font-size="22" font-weight="600">
    BookmarkMind · ${escapeXml(title)}
  </text>
  <text x="60" y="180" fill="#ffffff" font-family="Inter, sans-serif" font-size="42" font-weight="700">
    ${escapeXml(subtitle)}
  </text>
  <g transform="translate(60, 260)" font-family="Inter, sans-serif" fill="#e8f0fe">
    ${points.map((p, i) =>
      `<text x="0" y="${i * 60}" font-size="24">• ${escapeXml(p)}</text>`
    ).join('\n    ')}
  </g>
  <text x="60" y="760" fill="#5f6368" font-family="Inter, sans-serif" font-size="14">
    Placeholder screenshot — replace with actual extension screencap before CWS submission.
  </text>
</svg>`
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c],
  )
}

writeFileSync(resolve(outDir, 'promo-small.svg'), svgPromoSmall())
writeFileSync(resolve(outDir, 'promo-marquee.svg'), svgPromoMarquee())

writeFileSync(resolve(outDir, 'screenshot-1-providers.svg'),
  svgScreenshot('Options → Providers', '13 built-in providers, drag to reorder', [
    'Groq · Cerebras · Google Gemini · OpenRouter · Mistral',
    'HuggingFace · Novita · DeepSeek · OpenAI',
    'LM Studio · Ollama · LiteLLM · OmniRoute (all localhost)',
    'Plus: custom OpenAI-compat URL for anything else',
  ]))

writeFileSync(resolve(outDir, 'screenshot-2-add-provider.svg'),
  svgScreenshot('Add Provider', 'Pick from 13 presets or add custom URL', [
    'Preset picker with free-tier badges (permanent, trial, byok, localhost)',
    'Per-provider "Get your API key" homepage links',
    'Test button verifies the key with /models endpoint',
    'Model dropdown auto-populates from /models',
  ]))

writeFileSync(resolve(outDir, 'screenshot-3-custom-provider.svg'),
  svgScreenshot('Add Custom Provider', 'Any OpenAI-compat endpoint', [
    'Base URL: point at any HTTPS endpoint',
    'Auth scheme: Bearer / custom header / query param',
    'Perfect for self-hosted vLLM, corporate proxies, niche providers',
    'Locally-hosted defaults built in: localhost:1234, :11434, :4000, :20128',
  ]))

writeFileSync(resolve(outDir, 'screenshot-4-categorize.svg'),
  svgScreenshot('Categorize', 'AI-driven functional folder tree', [
    'FMHY-style categories: Tools > File Tools > Cloud Storage',
    'Not by provider: Google Drive / Dropbox / OneDrive → one folder',
    'Progress bar with batch counter (50 bookmarks per batch)',
    'Snapshot created before reorganize — nothing lost',
  ]))

writeFileSync(resolve(outDir, 'screenshot-5-before-after.svg'),
  svgScreenshot('Before → After', 'From chaos to organized', [
    'Before: 2000+ bookmarks in flat root folder',
    'After: 30+ functional folders, 2-3 levels deep',
    'Learning: your manual moves feed back into future categorizations',
    'Free options: Groq (30 RPM), Cerebras (1M tok/day), Gemini free tier',
  ]))

console.log('✓ Generated 7 CWS asset placeholders in docs/cws-assets/')
console.log('  - promo-small.svg (440×280)')
console.log('  - promo-marquee.svg (1400×560)')
console.log('  - screenshot-{1..5}-*.svg (1280×800 each)')
console.log('')
console.log('SVGs render in Chrome directly. To convert to PNG for CWS:')
console.log('  1. Open each SVG in Chrome')
console.log('  2. F12 → Elements → right-click the <svg> → "Capture node screenshot"')
console.log('  OR')
console.log('  npm install -g svg-to-png-cli')
console.log('  for f in docs/cws-assets/*.svg; do svg-to-png "$f" --output "${f%.svg}.png"; done')
console.log('')
console.log('BEFORE CWS SUBMISSION: replace at least screenshot-1..5 with')
console.log('real screencaps of the extension running against real bookmarks.')

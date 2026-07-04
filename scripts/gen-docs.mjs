#!/usr/bin/env node
/**
 * Regenerate every doc that repeats provider-catalog / permission-list
 * data from the single-source-of-truth registries. Idempotent.
 *
 * Sources of truth (read-only):
 *   - extension/manifest.json          (name, version, description, permissions)
 *   - extension/lib/providers/registry.js  (13-provider catalog)
 *
 * Regenerated fragments (between BEGIN-AUTOGEN / END-AUTOGEN markers):
 *   - README.md            <!-- BEGIN-AUTOGEN:PROVIDERS -->
 *   - docs/PROVIDERS.md    <!-- BEGIN-AUTOGEN:PROVIDERS -->
 *   - docs/CWS-LISTING.md  <!-- BEGIN-AUTOGEN:DESCRIPTION --> and <!-- BEGIN-AUTOGEN:PERMISSIONS -->
 *   - docs/PRIVACY.md      <!-- BEGIN-AUTOGEN:PROVIDERS -->
 *   - package.json         "description" (mirrors manifest.description)
 *
 * Run:  node scripts/gen-docs.mjs
 * CI:   npm run docs (defined in package.json)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const manifest = JSON.parse(readFileSync(resolve(root, 'extension/manifest.json'), 'utf8'))
const registrySrc = readFileSync(resolve(root, 'extension/lib/providers/registry.js'), 'utf8')

// Parse the registry file — extract each entry via a tolerant regex over the export const PROVIDERS array
const registryMatch = registrySrc.match(/export const PROVIDERS = Object\.freeze\(\[([\s\S]*?)\]\)/)
if (!registryMatch) {
  console.error('gen-docs: failed to locate PROVIDERS array in registry.js')
  process.exit(1)
}
const entryBlock = registryMatch[1]
const providers = []
for (const m of entryBlock.matchAll(/\{([\s\S]*?)\}/g)) {
  const body = m[1]
  const rec = {}
  for (const field of ['id', 'displayName', 'baseUrl', 'defaultModel', 'freeTier', 'freeNotes', 'homepage']) {
    const rx = new RegExp(`${field}\\s*:\\s*['"]([^'"]*)['"]`)
    const fm = body.match(rx)
    if (fm) rec[field] = fm[1]
  }
  if (rec.id) providers.push(rec)
}

console.log(`Parsed ${providers.length} providers from registry.js`)

const emoji = { permanent: '🎁', trial: '⏳', byok: '🔑', localhost: '🏠' }
const label = { permanent: 'Permanent free', trial: 'Trial credits', byok: 'BYOK', localhost: 'Localhost' }

/** Provider table for README.md + docs/PROVIDERS.md */
function providerTableMd() {
  const rows = providers.map((p) => {
    const tier = `${emoji[p.freeTier] || ''} ${label[p.freeTier] || p.freeTier}`
    return `| ${p.displayName} | ${tier} | \`${p.baseUrl}\` | ${p.freeNotes} |`
  })
  return [
    '| Provider | Tier | Base URL | Notes |',
    '|---|---|---|---|',
    ...rows,
  ].join('\n')
}

/** CWS listing "detailed description" — human-friendly one-line summary of provider list */
function providerSummaryLine() {
  return providers.map((p) => p.displayName).join(', ')
}

/** Justification lookup — one paragraph per permission that appears in manifest.json */
const permissionJustifications = {
  bookmarks: `BookmarkMind reads the user's bookmark tree to identify uncategorized bookmarks and rearrange them into AI-generated folders. Every operation is initiated by an explicit user click ("Categorize All Bookmarks"). No bookmark data is shared with anyone other than the LLM provider the user configured.`,
  storage: `BookmarkMind stores per-provider API keys (AES-GCM encrypted) in chrome.storage.sync so they roam across the user's Chrome installs. It also stores user preferences (batch size, provider fallback order) and persistent categorization state (so a large categorization can survive service worker restarts).`,
  tabs: `BookmarkMind reads currently-open tab titles to enrich bookmark categorization — a live tab title is more accurate than a stale bookmark title stored years ago. It never modifies or navigates tabs, only reads titles.`,
  notifications: `BookmarkMind shows a system notification when a categorization batch completes so the user knows to check the result without leaving their current tab.`,
  alarms: `BookmarkMind schedules alarms to resume batch categorization after the Chrome service worker suspends between batches (Chrome suspends idle service workers to save memory).`,
  activeTab: `BookmarkMind reads the currently-active tab's title when the user clicks the extension icon, so it can offer to categorize the current page as a bookmark.`,
}

/** Host permission block — one paragraph */
const hostPermissionJustification = `BookmarkMind supports ${providers.length} built-in OpenAI-compatible LLM providers PLUS a "custom provider" feature where the user enters any HTTPS endpoint. Because the extension cannot enumerate all possible provider URLs in advance (users may point at self-hosted vLLM, corporate proxies, localhost:1234 for LM Studio, or any other OpenAI-compat server), <all_urls> is required.

BookmarkMind ONLY makes network requests to endpoints the user has explicitly configured in the Options page. It never makes background network requests, never phones home, and has no telemetry. The user's provider configuration in chrome.storage.sync is the ONLY source of truth for network destinations.

Alternative (optional_host_permissions) was considered but rejected because it would trigger a permission dialog every time the user adds a new provider, which interrupts batch categorization flows across multiple providers.`

function permissionJustificationsMd() {
  const lines = []
  for (const perm of manifest.permissions) {
    lines.push(`**\`${perm}\`**`)
    lines.push('')
    lines.push('```')
    lines.push(permissionJustifications[perm] || `(TODO: add justification for permission "${perm}" in scripts/gen-docs.mjs)`)
    lines.push('```')
    lines.push('')
  }
  if (manifest.host_permissions?.includes('<all_urls>')) {
    lines.push(`**\`<all_urls>\` host permission (JUSTIFY EXTENSIVELY — CWS reviews this)**`)
    lines.push('')
    lines.push('```')
    lines.push(hostPermissionJustification)
    lines.push('```')
    lines.push('')
  }
  return lines.join('\n')
}

/** Replace content between BEGIN-AUTOGEN:<KEY> and END-AUTOGEN:<KEY> markers. */
function spliceBlock(content, key, replacement) {
  const rx = new RegExp(`(<!-- BEGIN-AUTOGEN:${key} -->)([\\s\\S]*?)(<!-- END-AUTOGEN:${key} -->)`)
  if (!rx.test(content)) {
    console.warn(`  no BEGIN-AUTOGEN:${key} marker — skipping`)
    return { content, changed: false }
  }
  // Use replacement function to avoid $-substitutions inside `replacement`.
  const next = content.replace(rx, (_, open, _mid, close) => `${open}\n${replacement}\n${close}`)
  return { content: next, changed: next !== content }
}

function updateFile(relPath, patches) {
  const abs = resolve(root, relPath)
  if (!existsSync(abs)) {
    console.warn(`skip ${relPath} — not found`)
    return
  }
  let content = readFileSync(abs, 'utf8')
  let any = false
  for (const [key, value] of patches) {
    const { content: next, changed } = spliceBlock(content, key, value)
    content = next
    if (changed) any = true
    console.log(`  ${relPath} :: ${key} ${changed ? '✓ updated' : '(no change)'}`)
  }
  if (any) writeFileSync(abs, content)
}

console.log('Regenerating docs from single sources of truth...')
console.log('')

console.log('README.md')
updateFile('README.md', [
  ['PROVIDERS', providerTableMd()],
])

console.log('docs/PROVIDERS.md')
updateFile('docs/PROVIDERS.md', [
  ['PROVIDERS', providerTableMd()],
])

console.log('docs/CWS-LISTING.md')
updateFile('docs/CWS-LISTING.md', [
  ['PROVIDERS_SUMMARY', providerSummaryLine()],
  ['PROVIDERS', providerTableMd()],
  ['PERMISSIONS', permissionJustificationsMd()],
])

console.log('docs/PRIVACY.md')
updateFile('docs/PRIVACY.md', [
  ['PROVIDERS', providerTableMd()],
])

// package.json description mirror
console.log('package.json')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
if (pkg.description !== manifest.description) {
  pkg.description = manifest.description
  writeFileSync(resolve(root, 'package.json'), `${JSON.stringify(pkg, null, 4)}\n`)
  console.log('  package.json description ✓ synced from manifest')
} else {
  console.log('  package.json description (no change)')
}

console.log('')
console.log('✓ Done. Diff to review, then commit.')

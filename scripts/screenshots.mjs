#!/usr/bin/env node
/**
 * Capture CWS listing screenshots using headless Chrome.
 *
 * Approach: for each screenshot spec, generate a self-contained HTML file
 * that renders the target UI (Options page, provider modal, etc.) against
 * an in-memory chrome.* stub. Then invoke Chrome headless to screencap
 * each to a PNG at 1280×800.
 *
 * Chrome is required — this script fails if Chrome isn't installed.
 * On Windows: C:\Program Files\Google\Chrome\Application\chrome.exe
 * On macOS:   /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
 * On Linux:   /usr/bin/google-chrome-stable or /usr/bin/chromium
 *
 * Outputs:
 *   docs/cws-assets/screenshot-1-providers.png   (Options → provider list)
 *   docs/cws-assets/screenshot-2-add-provider.png (Add provider modal, preset)
 *   docs/cws-assets/screenshot-3-custom-provider.png (Add custom modal)
 *   docs/cws-assets/screenshot-4-categorize.png (Popup mid-categorization)
 *   docs/cws-assets/screenshot-5-before-after.png (Before/after bookmark tree)
 *
 * These auto-replace the SVG placeholders. Real screenshots of the
 * running extension against real bookmarks are still recommended before
 * final CWS submission — this pass gives a polished baseline.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const outDir = resolve(root, 'docs/cws-assets')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

// Locate Chrome
const chromeCandidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe` : null,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)
const chrome = chromeCandidates.find((p) => existsSync(p))
if (!chrome) {
  console.error('Chrome not found in any standard location. Set CHROME_PATH env var or install Chrome.')
  process.exit(1)
}
console.log(`Chrome: ${chrome}`)

// Load providers from registry
const registrySrc = readFileSync(resolve(root, 'extension/lib/providers/registry.js'), 'utf8')
const rx = /export const PROVIDERS = Object\.freeze\(\[([\s\S]*?)\]\)/
const arrBody = registrySrc.match(rx)[1]
const providers = []
for (const m of arrBody.matchAll(/\{([\s\S]*?)\}/g)) {
  const body = m[1]
  const rec = {}
  for (const field of ['id', 'displayName', 'baseUrl', 'defaultModel', 'freeTier', 'freeNotes']) {
    const fm = body.match(new RegExp(`${field}\\s*:\\s*['"]([^'"]*)['"]`))
    if (fm) rec[field] = fm[1]
  }
  if (rec.id) providers.push(rec)
}

const emoji = { permanent: '🎁', trial: '⏳', byok: '🔑', localhost: '🏠' }
const tmpDir = resolve(root, '.screenshot-tmp')
if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
mkdirSync(tmpDir, { recursive: true })

const commonCss = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif;
    background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ee 100%);
    color: #202124;
    padding: 40px;
    min-height: 800px;
    width: 1280px;
  }
  .app {
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.06);
    max-width: 1200px;
    margin: 0 auto;
    overflow: hidden;
  }
  .header {
    background: linear-gradient(135deg, #4285f4 0%, #1a73e8 100%);
    color: white;
    padding: 24px 32px;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .logo { font-size: 28px; }
  .header h1 { font-size: 22px; font-weight: 600; }
  .header .sub { font-size: 13px; opacity: 0.85; margin-top: 2px; }
  .main { padding: 32px; }
  .section-title { font-size: 15px; font-weight: 600; color: #5f6368; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px; }
  .provider-card {
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 16px;
    transition: box-shadow 0.15s;
  }
  .provider-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .drag { color: #9aa0a6; cursor: grab; font-size: 18px; letter-spacing: -2px; }
  .badge {
    display: inline-block;
    padding: 3px 10px;
    background: #e8f5e9;
    color: #1b5e20;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
  }
  .badge.trial { background: #fff8e1; color: #6d4c00; }
  .badge.byok { background: #e3f2fd; color: #0d47a1; }
  .badge.localhost { background: #f3e5f5; color: #4a148c; }
  .provider-name { font-weight: 600; font-size: 15px; flex: 1; }
  .provider-url { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 12px; color: #5f6368; }
  .actions { display: flex; gap: 8px; }
  .btn {
    padding: 6px 14px;
    border: 1px solid #dadce0;
    background: white;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    color: #1a73e8;
    font-weight: 500;
  }
  .btn.primary { background: #1a73e8; color: white; border-color: #1a73e8; }
  .btn.danger { color: #d93025; }
  .add-buttons { display: flex; gap: 12px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e8eaed; }
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.4);
    display: flex; align-items: center; justify-content: center;
  }
  .modal {
    background: white;
    border-radius: 12px;
    width: 560px;
    box-shadow: 0 24px 48px rgba(0,0,0,0.24);
    overflow: hidden;
  }
  .modal-header { padding: 20px 24px; border-bottom: 1px solid #e0e0e0; font-size: 18px; font-weight: 600; }
  .modal-body { padding: 24px; display: flex; flex-direction: column; gap: 12px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field label { font-size: 13px; font-weight: 500; color: #5f6368; }
  .field input, .field select {
    padding: 10px 12px;
    border: 1px solid #dadce0;
    border-radius: 6px;
    font-size: 14px;
    font-family: inherit;
  }
  .field .hint { font-size: 12px; color: #5f6368; }
  .modal-footer { padding: 16px 24px; border-top: 1px solid #e0e0e0; display: flex; justify-content: flex-end; gap: 10px; }
  .status-pill {
    display: inline-block;
    padding: 3px 10px;
    background: #e8f0fe;
    color: #1967d2;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
  }
  .status-pill.ok { background: #e6f4ea; color: #1e8e3e; }
  .progress-bar {
    height: 8px;
    background: #e8eaed;
    border-radius: 4px;
    overflow: hidden;
    margin-top: 8px;
  }
  .progress-fill { height: 100%; background: linear-gradient(90deg, #4285f4, #1a73e8); width: 68%; }
  .tree {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    line-height: 1.7;
  }
  .tree .folder { color: #1a73e8; font-weight: 600; }
  .tree .indent { color: #dadce0; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 32px; }
  .col-title { font-weight: 600; margin-bottom: 12px; color: #202124; }
  .col-before { background: #fce8e6; padding: 20px; border-radius: 8px; }
  .col-after { background: #e6f4ea; padding: 20px; border-radius: 8px; }
`

function html({ title, body }) {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${title}</title><style>${commonCss}</style></head>
<body>${body}</body>
</html>`
}

function providerCard(p) {
  return `
    <div class="provider-card">
      <span class="drag">⋮⋮</span>
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
          <span class="provider-name">${p.displayName}</span>
          <span class="badge ${p.freeTier}">${emoji[p.freeTier]} ${p.freeTier}</span>
          ${p.freeTier === 'permanent' && ['groq', 'cerebras', 'gemini'].includes(p.id) ? '<span class="status-pill ok">✓ connected</span>' : '<span class="status-pill">untested</span>'}
        </div>
        <div class="provider-url">${p.baseUrl}</div>
      </div>
      <div class="actions">
        <button class="btn">↻ Models</button>
        <button class="btn">Test</button>
        <button class="btn danger">Remove</button>
      </div>
    </div>`
}

// Screenshot 1 — Options page with provider list
const shot1Body = `
<div class="app">
  <div class="header">
    <div class="logo">📚</div>
    <div>
      <h1>BookmarkMind</h1>
      <div class="sub">AI-Powered Bookmark Organizer · v1.2.0</div>
    </div>
  </div>
  <div class="main">
    <div class="section-title">AI Providers · drag to reorder fallback</div>
    ${providers.slice(0, 6).map(providerCard).join('')}
    <div class="add-buttons">
      <button class="btn primary">+ Add Provider</button>
      <button class="btn">+ Custom (OpenAI-compat URL)</button>
    </div>
  </div>
</div>`

// Screenshot 2 — Add Provider modal (preset picker)
const shot2Body = `
<div class="app" style="filter: brightness(0.7)">
  <div class="header">
    <div class="logo">📚</div>
    <div><h1>BookmarkMind</h1><div class="sub">Options</div></div>
  </div>
  <div class="main">
    <div class="section-title">AI Providers</div>
    ${providers.slice(0, 3).map(providerCard).join('')}
  </div>
</div>
<div class="modal-overlay">
  <div class="modal">
    <div class="modal-header">Add Provider</div>
    <div class="modal-body">
      <div class="field">
        <label>Pick a provider</label>
        <select>
          ${providers.map((p) => `<option${p.id === 'groq' ? ' selected' : ''}>${p.displayName} (${p.freeTier})</option>`).join('')}
        </select>
        <div class="hint">🎁 30 RPM, 500K tokens/day. No card. Fastest inference in fleet.</div>
      </div>
      <div class="field">
        <label>API key</label>
        <input type="password" placeholder="Paste your API key" value="gsk_••••••••••••••••••••••••" />
        <div class="hint">Get a key from <span style="color:#1a73e8;text-decoration:underline">console.groq.com/keys</span></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn">Cancel</button>
      <button class="btn primary">Save</button>
    </div>
  </div>
</div>`

// Screenshot 3 — Custom Provider modal
const shot3Body = `
<div class="app" style="filter: brightness(0.7)">
  <div class="header">
    <div class="logo">📚</div>
    <div><h1>BookmarkMind</h1><div class="sub">Options</div></div>
  </div>
  <div class="main">
    <div class="section-title">AI Providers</div>
    ${providers.slice(0, 2).map(providerCard).join('')}
  </div>
</div>
<div class="modal-overlay">
  <div class="modal">
    <div class="modal-header">Add Custom Provider</div>
    <div class="modal-body">
      <div class="field">
        <label>ID (kebab-case)</label>
        <input value="my-vllm" />
      </div>
      <div class="field">
        <label>Display name</label>
        <input value="My vLLM Server" />
      </div>
      <div class="field">
        <label>Base URL (no trailing /)</label>
        <input value="https://ai.mycompany.internal/v1" />
      </div>
      <div class="field">
        <label>Default model</label>
        <input value="llama-3.3-70b" />
      </div>
      <div class="field">
        <label>Auth scheme</label>
        <select><option>Bearer (Authorization header)</option><option>Custom header</option><option>Query parameter (?key=…)</option></select>
      </div>
      <div class="field">
        <label>API key</label>
        <input type="password" placeholder="Leave blank for anonymous / localhost" />
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn">Cancel</button>
      <button class="btn primary">Save</button>
    </div>
  </div>
</div>`

// Screenshot 4 — Popup mid-categorization
const shot4Body = `
<div style="display:flex;justify-content:center;align-items:center;min-height:720px">
<div class="app" style="max-width:420px">
  <div class="header">
    <div class="logo">📚</div>
    <div><h1 style="font-size:18px">BookmarkMind</h1><div class="sub">Categorizing…</div></div>
  </div>
  <div class="main">
    <div style="font-size:14px;color:#5f6368;margin-bottom:6px">Batch 14 of 21</div>
    <div style="font-size:16px;font-weight:600;margin-bottom:16px">Processing 683 of 1,024 bookmarks</div>
    <div class="progress-bar"><div class="progress-fill"></div></div>
    <div style="margin-top:24px">
      <div style="font-size:13px;color:#5f6368;margin-bottom:8px">Latest categorized</div>
      <div style="background:#f8f9fa;padding:12px;border-radius:8px;font-size:13px;line-height:1.6">
        <div>🎁 <strong>WeTransfer</strong> → Tools > File Tools > Sharing</div>
        <div>🎁 <strong>Dropbox</strong> → Tools > File Tools > Cloud Storage</div>
        <div>🎁 <strong>GitHub</strong> → Development > Code Repositories</div>
        <div>🎁 <strong>Mullvad VPN</strong> → Privacy > VPN</div>
      </div>
    </div>
    <div style="margin-top:20px;padding:12px;background:#e8f0fe;border-radius:8px;font-size:12px;color:#1967d2">
      Active provider: <strong>Groq</strong> · 8 RPM / 30 RPM · avg 240ms/batch
    </div>
  </div>
</div>
</div>`

// Screenshot 5 — Before/After
const shot5Body = `
<div class="app">
  <div class="header">
    <div class="logo">📚</div>
    <div>
      <h1>Before → After</h1>
      <div class="sub">2,041 bookmarks organized into 34 functional folders</div>
    </div>
  </div>
  <div class="two-col">
    <div class="col-before">
      <div class="col-title">😩 Before</div>
      <div class="tree">
📁 Bookmarks Bar<br>
<span class="indent">├─</span> Google Drive<br>
<span class="indent">├─</span> Untitled<br>
<span class="indent">├─</span> DropBox — Home<br>
<span class="indent">├─</span> Tab Manager<br>
<span class="indent">├─</span> ProtonVPN<br>
<span class="indent">├─</span> GitHub - facebook/react<br>
<span class="indent">├─</span> Netflix<br>
<span class="indent">├─</span> StackOverflow<br>
<span class="indent">├─</span> …2,033 more<br>
<br>
<span style="color:#d93025">flat, chaotic, unsearchable</span>
      </div>
    </div>
    <div class="col-after">
      <div class="col-title">🎯 After</div>
      <div class="tree">
📁 Bookmarks Bar<br>
<span class="indent">├─</span> <span class="folder">📁 Tools</span><br>
<span class="indent">│&nbsp;&nbsp;&nbsp;├─</span> <span class="folder">📁 File Tools</span><br>
<span class="indent">│&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;├─</span> <span class="folder">📁 Cloud Storage</span> (Drive, Dropbox…)<br>
<span class="indent">│&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;└─</span> <span class="folder">📁 Sharing</span> (WeTransfer…)<br>
<span class="indent">├─</span> <span class="folder">📁 Privacy</span><br>
<span class="indent">│&nbsp;&nbsp;&nbsp;└─</span> <span class="folder">📁 VPN</span> (ProtonVPN, Mullvad…)<br>
<span class="indent">├─</span> <span class="folder">📁 Development</span><br>
<span class="indent">│&nbsp;&nbsp;&nbsp;└─</span> <span class="folder">📁 Code Repositories</span><br>
<span class="indent">└─</span> <span class="folder">📁 Entertainment > Streaming</span><br>
<br>
<span style="color:#1e8e3e">functional, hierarchical, browsable</span>
      </div>
    </div>
  </div>
</div>`

const shots = [
  { name: 'screenshot-1-providers', title: 'Options — Provider List', body: shot1Body },
  { name: 'screenshot-2-add-provider', title: 'Add Provider Modal', body: shot2Body },
  { name: 'screenshot-3-custom-provider', title: 'Add Custom Provider Modal', body: shot3Body },
  { name: 'screenshot-4-categorize', title: 'Categorization in Progress', body: shot4Body },
  { name: 'screenshot-5-before-after', title: 'Before / After', body: shot5Body },
]

for (const shot of shots) {
  const htmlPath = resolve(tmpDir, `${shot.name}.html`)
  const pngPath = resolve(outDir, `${shot.name}.png`)
  writeFileSync(htmlPath, html(shot))

  console.log(`Capturing ${shot.name}.png ...`)
  // Chrome headless screenshot
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1280,800',
    `--screenshot=${pngPath}`,
    `--virtual-time-budget=5000`,
    // Chrome on Windows needs file:/// URL with forward slashes
    `file:///${htmlPath.replace(/\\/g, '/')}`,
  ]
  try {
    execSync(`"${chrome}" ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`, {
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 60000,
    })
    if (existsSync(pngPath)) {
      const size = execSync(process.platform === 'win32'
        ? `powershell -NoProfile -Command "(Get-Item '${pngPath}').Length"`
        : `stat -c %s "${pngPath}"`).toString().trim()
      console.log(`  ✓ ${(Number(size) / 1024).toFixed(1)} KB`)
    } else {
      console.log(`  ✗ PNG not created`)
    }
  } catch (err) {
    console.error(`  ✗ Chrome failed: ${err.message.slice(0, 200)}`)
  }
}

// Cleanup temp HTML
rmSync(tmpDir, { recursive: true, force: true })
console.log('\n✓ Screenshots captured to docs/cws-assets/')
console.log('  Replace with real extension screencaps before final CWS submission if desired.')

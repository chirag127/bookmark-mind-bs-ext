# BookmarkMind — AI Bookmark Organizer

[![CI](https://img.shields.io/github/actions/workflow/status/chirag127/bookmark-mind-bs-ext/ci.yml?style=flat-square)](https://github.com/chirag127/bookmark-mind-bs-ext/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)](./LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-blue.svg?style=flat-square)](./extension/manifest.json)
[![GitHub Stars](https://img.shields.io/github/stars/chirag127/bookmark-mind-bs-ext?style=flat-square)](https://github.com/chirag127/bookmark-mind-bs-ext)

Auto-organize your Chrome bookmarks into intelligent, functional folders using any OpenAI-compatible LLM. Bring your own key — 13 providers built in, plus support for any custom endpoint.

> [⭐ Star this repo](https://github.com/chirag127/bookmark-mind-bs-ext) if this saves you time.

## Highlights

- **13 built-in providers** — Groq, Cerebras, Google Gemini, OpenRouter, Mistral, HuggingFace, DeepSeek, OpenAI, Novita + localhost providers (LM Studio, Ollama, LiteLLM, OmniRoute)
- **Custom provider** — add any OpenAI-compatible HTTPS endpoint (self-hosted vLLM, corporate proxy, niche vendor)
- **Fallback ordering** — drag providers to prioritize; automatic 5-min cool-off on HTTP 429
- **Encrypted key storage** — AES-256-GCM before writing to `chrome.storage.sync`
- **FMHY-style folders** — categorizes by what services DO ("Tools > File Tools > Cloud Storage") not by provider ("Google > Drive")
- **Zero telemetry** — no server, no analytics, no phone-home. Source at [chirag127/bookmark-mind-bs-ext](https://github.com/chirag127/bookmark-mind-bs-ext).

## Install

**From Chrome Web Store**: (pending listing — v1.2.0 in submission queue)

**From source** (unpacked):

1. `git clone https://github.com/chirag127/bookmark-mind-bs-ext.git`
2. Open Chrome → `chrome://extensions/` → toggle **Developer mode** (top-right)
3. Click **Load unpacked** → select the `extension/` directory
4. Icon appears in toolbar — click to open the popup

Or download the latest release ZIP from [releases](https://github.com/chirag127/bookmark-mind-bs-ext/releases) and drag it onto `chrome://extensions/`.

## Providers

> Table auto-generated from `extension/lib/providers/registry.js`. Run `npm run docs` to regenerate.

<!-- BEGIN-AUTOGEN:PROVIDERS -->
| Provider | Tier | Base URL | Notes |
|---|---|---|---|
| Groq | 🎁 Permanent free | `https://api.groq.com/openai/v1` | 30 RPM, 500K tokens/day. No card. Fastest inference in fleet. |
| Cerebras | 🎁 Permanent free | `https://api.cerebras.ai/v1` | 1M tokens/day, 30 RPM, no card. 8K context cap on free tier. |
| Google Gemini | 🎁 Permanent free | `https://generativelanguage.googleapis.com/v1beta/openai` | Free tier, no card. Not available in EU/UK/CH. Prompts train models. |
| OpenRouter | 🎁 Permanent free | `https://openrouter.ai/api/v1` | Aggregator. 20+ :free models. 20 RPM / 50 RPD free, 1K RPD with $10 credit. |
| Mistral (Experiment) | 🎁 Permanent free | `https://api.mistral.ai/v1` | Experiment plan: 1 RPS, 500K TPM. Prompts train Mistral unless opted out. |
| HuggingFace Router | 🎁 Permanent free | `https://router.huggingface.co/v1` | Free tier included with HF account. Cold starts can be 30s+. |
| Novita | ⏳ Trial credits | `https://api.novita.ai/v3/openai` | $0.50 signup credits, 60 RPM. 120+ models. |
| DeepSeek | ⏳ Trial credits | `https://api.deepseek.com/v1` | 5M tokens on signup, 30 days. Card required past trial. |
| OpenAI | ⏳ Trial credits | `https://api.openai.com/v1` | Trial credits inconsistent by region. Card required past trial. |
| LM Studio (localhost) | 🏠 Localhost | `http://localhost:1234/v1` | Runs local models. Start LM Studio server first. No key needed. |
| Ollama (localhost) | 🏠 Localhost | `http://localhost:11434/v1` | Local models via Ollama. Set OLLAMA_ORIGINS=chrome-extension://* env var. |
| LiteLLM Proxy | 🔑 BYOK | `http://localhost:4000/v1` | Route to any provider via self-hosted LiteLLM proxy. Edit baseUrl. |
| OmniRoute (localhost) | 🏠 Localhost | `http://localhost:20128/v1` | 60+ free models routed via local OmniRoute dev server. No key needed. |
<!-- END-AUTOGEN:PROVIDERS -->

**Tier legend**: 🎁 permanent free (no card) · ⏳ trial credits · 🔑 bring-your-own-key · 🏠 localhost

## Configuration

1. Click the BookmarkMind icon → **Options** (or right-click → Options)
2. Under **AI Providers**, click **+ Add Provider** and pick a preset, or **+ Custom** for any OpenAI-compat URL
3. Paste your API key (or leave blank for localhost) → **Save** → **Test** to verify
4. Click **↻ Refresh models** to populate the model dropdown
5. Drag providers to reorder — top = tried first, fallback on rate limit
6. Return to the popup → **Categorize All Bookmarks**

Full docs: [`docs/PROVIDERS.md`](./docs/PROVIDERS.md)

## Publishing to Chrome Web Store

See [`docs/PUBLISHING.md`](./docs/PUBLISHING.md) for the step-by-step. Uses the ZIP built by `npm run package`.

Listing copy, permission justifications, privacy policy: [`docs/CWS-LISTING.md`](./docs/CWS-LISTING.md), [`docs/PRIVACY.md`](./docs/PRIVACY.md).

## Development

```bash
git clone https://github.com/chirag127/bookmark-mind-bs-ext.git
cd bookmark-mind-bs-ext
pnpm install                  # or npm install
pnpm test                     # runs the provider registry + adapter + keyStore tests
pnpm run check                # biome lint + format
pnpm run package              # builds dist/bookmarkmind-v<version>.zip for CWS
pnpm run docs                 # regenerates docs from registry.js
pnpm run screenshots          # captures CWS listing screenshots via headless Chrome
```

### Architecture

```
extension/
├── manifest.json               # MV3, host_permissions: <all_urls>
├── lib/providers/
│   ├── registry.js             # 13-provider catalog (source of truth)
│   ├── adapter.js              # OpenAI-compat request builder + response normalizer
│   ├── keyStore.js             # AES-GCM key encryption in chrome.storage.sync
│   ├── modelDiscovery.js       # /models cache in chrome.storage.local, 24h TTL
│   └── README.md
├── features/ai/
│   ├── chatOrchestrator.js     # provider fallback + rate-limit cool-off + JSON-mode helper
│   ├── aiProcessor.js          # Categorizer-facing API; delegates to chatOrchestrator
│   └── categorizer.js          # main batch pipeline
├── features/bookmarks/         # bookmark + folder + snapshot services
├── features/settings/          # settings-providers.js hooks up the new UI
└── features/core/background.js # MV3 service worker
```

### Adding a provider

Two paths:

1. **Built-in**: edit `extension/lib/providers/registry.js` and add a record. Then `npm run docs` to update the table everywhere. Tests in `tests/features/lib/providers/registry.test.js` auto-cover the count invariant.
2. **User custom**: use the "**+ Custom**" flow in Options — user enters ID, name, baseUrl, auth scheme, defaultModel. Runtime validation via `validateCustomProvider()`.

## Privacy

BookmarkMind has **no server** and **no telemetry**. Bookmark titles + URLs leave your device **only** when you explicitly click "Categorize" and only to the LLM provider you configured. Full policy: [`docs/PRIVACY.md`](./docs/PRIVACY.md).

## License

MIT — see [`LICENSE`](./LICENSE).

## Related

- [chirag127/workflows](https://github.com/chirag127/workflows) — the reusable Dagger + GHA CI this repo uses
- [chirag127/OmniRoute](https://github.com/chirag127/OmniRoute) — the local aggregation proxy exposing 60+ free models (one of the 13 built-in providers)

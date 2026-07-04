# BookmarkMind Privacy Policy

**Last updated: 2026-07-04**

BookmarkMind ("we", "the extension") is committed to protecting your
privacy. This policy explains exactly what data the extension processes,
where it goes, and what we do (and don't do) with it.

## Summary

- **We collect nothing.** BookmarkMind has no server, no analytics, no
  telemetry, no phone-home.
- **Your API keys are encrypted** with AES-256-GCM before being stored in
  Chrome's sync storage.
- **Your bookmark data leaves your device only** when you initiate a
  categorization and only to the LLM provider you configured in Options.
- **We're open source** — audit any of this at
  https://github.com/chirag127/bookmark-mind-bs-ext.

## What data does BookmarkMind read?

1. **Your bookmark tree** (via `chrome.bookmarks` API) — titles, URLs,
   folder hierarchy. Read only when you click "Categorize All Bookmarks".
2. **Titles of your currently-open tabs** (via `chrome.tabs` API) — read
   during categorization to enrich stale bookmark titles with live ones.
3. **Your API keys for LLM providers** — encrypted before storing.

## What data does BookmarkMind write?

Everything is stored in Chrome's local storage APIs on YOUR device:

- **`chrome.storage.sync.providerKeys`** — your API keys, encrypted with
  AES-256-GCM. The encryption key is derived from PBKDF2 over a
  per-install random nonce stored in `chrome.storage.local`.
- **`chrome.storage.sync.providerOrder`** — the fallback order of your
  configured providers.
- **`chrome.storage.sync.customProviders`** — any custom OpenAI-compatible
  providers you've added (their base URL and metadata, NOT their keys).
- **`chrome.storage.sync.bookmarkMindSettings`** — your preferences
  (batch size, category depth, etc.).
- **`chrome.storage.local.categorizationState`** — persistent state so a
  long-running categorization can resume if the service worker restarts.
- **`chrome.storage.local.ai_moved_<bookmarkId>`** — flags to prevent the
  learning system from treating AI-driven moves as user corrections.

Nothing leaves your device except items 3-4 below.

## What data leaves your device?

**Only when you explicitly click "Categorize All Bookmarks" and only to
the LLM provider(s) you configured**:

1. **The titles and URLs of your uncategorized bookmarks** — sent as part
   of the LLM prompt so the model can suggest a category for each one.
2. **A sample of ~150 bookmark titles + URLs** — sent once at the start
   of each categorization run to generate the folder hierarchy.
3. **Optionally, live titles fetched from your currently-open tabs** — if
   the "enrich with live titles" setting is enabled, BookmarkMind fetches
   the current `<title>` element from each tab's URL to improve stale
   bookmark titles.
4. **Your API key for the chosen provider** — included in the
   `Authorization: Bearer <key>` header on the request to that provider.

**Nothing else. Ever.**

## What does BookmarkMind NOT do?

- We do not collect analytics.
- We do not send heartbeats, ping any BookmarkMind server (there is no
  BookmarkMind server), or phone home.
- We do not sell, share, or transfer your data to third parties.
- We do not use your data for advertising, targeting, or any commercial
  purpose.
- We do not read data from websites you visit unless you explicitly
  add that website's URL as a custom provider in Options.

## Third-party LLM providers

When you configure BookmarkMind with a provider (say, Groq or OpenAI), your
bookmark titles + URLs + your API key are sent to THAT provider on each
categorization. Each provider has its own privacy policy that governs how
they process your data.

The built-in provider catalog (auto-generated from `extension/lib/providers/registry.js`):

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

Notable per-provider notes:

- **Google Gemini** free-tier prompts are used to train Google's models — this is Google's policy, not ours.
- **Mistral** (Experiment plan) prompts are used to train Mistral by default unless you opt out.
- **OpenAI, OpenRouter, DeepSeek, Novita, HuggingFace, LiteLLM**: see respective policies.
- **Localhost providers** (Ollama, LM Studio, OmniRoute, LiteLLM proxy): data never leaves your machine.

BookmarkMind cannot control what happens to your data after it reaches a
third-party provider. Choose your provider(s) accordingly. For maximum
privacy, use a **localhost provider** (Ollama, LM Studio, OmniRoute, LiteLLM).

## Host permission `<all_urls>` — why we need it

Chrome asks for `<all_urls>` host permission at install because we allow
YOU to configure any OpenAI-compatible endpoint as a provider (including
self-hosted proxies, corporate URLs, or any other server). We cannot
enumerate all possible URLs in advance.

BookmarkMind ONLY makes network requests to endpoints you have explicitly
configured in Options. It does NOT read data from other websites, does
NOT inject scripts into web pages, and does NOT observe your browsing.

You can audit every network call by opening Chrome DevTools on the
extension's service worker (`chrome://extensions/` → BookmarkMind →
service worker link).

## Data retention

- **API keys**: retained until you delete them from Options.
- **Bookmark data sent to providers**: retained per each provider's own
  policy (see above).
- **We retain nothing** — we have no server.

## Your rights

- **Delete your data**: open Options, remove each provider (this clears
  encrypted keys), then uninstall the extension (this clears all local
  storage). Optionally, log into each provider's dashboard and revoke
  the API key you gave BookmarkMind.
- **Access your data**: everything BookmarkMind stores about you is
  accessible in Chrome DevTools:
  1. Right-click the BookmarkMind icon → "Manage extension"
  2. Click "service worker" link
  3. In DevTools → Application → Storage → chrome.storage
- **Export your bookmarks**: use Chrome's built-in bookmark manager
  (Ctrl+Shift+O) → Export Bookmarks.

## Changes to this policy

If BookmarkMind's data handling changes, this policy will be updated and
the "Last updated" date at the top will change. Historical versions are
tracked in the repo's git history:
https://github.com/chirag127/bookmark-mind-bs-ext/commits/main/docs/PRIVACY.md

## Contact

- **Bugs / security issues**: https://github.com/chirag127/bookmark-mind-bs-ext/issues
- **General**: chirag127@users.noreply.github.com
- **Source code**: https://github.com/chirag127/bookmark-mind-bs-ext

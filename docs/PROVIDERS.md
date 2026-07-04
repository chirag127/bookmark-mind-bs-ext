# BookmarkMind — Providers

BookmarkMind supports any OpenAI-compatible chat API. Thirteen providers ship built-in
plus an "Add custom" flow for anything else.

> The table below is auto-generated from `extension/lib/providers/registry.js`.
> Do not edit by hand — run `npm run docs` to regenerate.

## Built-in providers

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

## Adding a provider

1. Open BookmarkMind Options
2. Under "AI Providers" click **+ Add Provider**
3. Pick the provider, paste your API key, hit Save
4. Click **Test** to verify the key works
5. Click **↻ Refresh models** to load the model dropdown
6. Drag providers to reorder (top = tried first for each categorization)

## Adding a custom provider

For any OpenAI-compatible endpoint not in the built-in list (self-hosted vLLM, LM
Studio on a non-default port, a corporate proxy, another vendor):

1. Click **+ Custom (OpenAI-compat URL)**
2. Fill in:
   - **ID**: kebab-case slug, unique (e.g. `my-vllm`)
   - **Display name**: label shown in the UI
   - **Base URL**: no trailing slash, e.g. `https://ai.example.com/v1`
   - **Default model**: initial model to use before `/models` discovery runs
   - **Auth scheme**:
     - `Bearer` (most): sends `Authorization: Bearer YOUR_KEY`
     - `Custom header`: pick a header name, e.g. `x-api-key`
     - `Query parameter`: appends `?key=YOUR_KEY` to every request
   - **API key**: optional for localhost/anonymous endpoints

Custom providers live in `chrome.storage.sync` and sync across your Chrome
profile like any other setting.

## Provider fallback

BookmarkMind uses the first working provider for each request. If a provider
returns HTTP 429 (rate limit), it's cooled off for 5 minutes and the next
provider in your order is used. HTTP 401/403 stops the chain immediately
(auth errors won't fall through to another provider's key).

## Key security

Keys are encrypted with AES-GCM before writing to `chrome.storage.sync`. The
encryption key is derived from PBKDF2(SHA-256, 100K iters) over a static
material string + per-install random nonce stored in `chrome.storage.local`.

**This is defense-in-depth vs another extension reading `chrome.storage.sync`
via a stolen host permission.** It is NOT protection against a determined
attacker with local disk access — the nonce lives alongside the ciphertext.

For higher-value keys (production OpenAI, paid tiers): use a self-hosted
LiteLLM proxy and register it as a custom provider. BookmarkMind then only
sees a proxy token, not your upstream key.

## Migration from v1.0.0

On first load of v1.1.0+, BookmarkMind reads any legacy `geminiApiKey`,
`cerebrasApiKey`, `groqApiKey` from `chrome.storage.sync` (they were stored
plaintext in v1.0.0), moves them into the new encrypted key store, and
removes the plaintext originals. The one-shot migration flag
`providersMigrated: '1.1.0'` prevents re-runs.

## Adding a built-in provider (contributors)

Edit `extension/lib/providers/registry.js`, add an entry to the `PROVIDERS`
array. Verify base URL + auth by testing with a real key locally. Ship as a
PR with a link to the provider's docs page. Tests in
`tests/features/lib/providers/registry.test.js` will run in CI.

# Publishing BookmarkMind to the Chrome Web Store

Step-by-step from local repo → live listing. Automated via
`.github/workflows/cws-publish.yml` — you tag `v1.2.1` and CI does the
rest.

## Prerequisites (one-time)

1. **Chrome Web Store Developer account** — $5 registration at
   https://chrome.google.com/webstore/devconsole.
2. **Node 20+** locally (`node --version`).
3. **Publish PRIVACY.md** as a public HTTPS URL. GitHub Pages is already
   enabled on this repo:
   `https://chirag127.github.io/bookmark-mind-bs-ext/docs/PRIVACY.md`

## First manual submission (v1.2.0)

Only the first release goes through the manual dev-console form; every
subsequent release is auto-published by CI.

### Build the ZIP + assets locally

```bash
pnpm install
pnpm run docs         # regenerate provider tables + permission blocks
pnpm run screenshots  # capture 5 PNGs to docs/cws-assets/ via headless Chrome
pnpm run package      # produce dist/bookmarkmind-v1.2.0.zip
```

### Verify the ZIP

```bash
unzip -l dist/bookmarkmind-v1.2.0.zip | grep manifest.json
# manifest.json must be at ZIP root, not nested inside extension/
```

### Load in Chrome for smoke test

1. `chrome://extensions/` → toggle **Developer mode**
2. Drag `dist/bookmarkmind-v1.2.0.zip` onto the page
3. Add a provider (Groq — permanent free tier, no card)
4. Run **Categorize All Bookmarks** on a small subset

### Create the CWS listing

1. https://chrome.google.com/webstore/devconsole → **+ New Item**
2. Upload `dist/bookmarkmind-v1.2.0.zip`
3. **Store Listing tab** — copy verbatim from [`docs/CWS-LISTING.md`](./CWS-LISTING.md):
   - Item name, summary, detailed description
   - Category: Productivity
   - Language: English
   - Icon: `extension/icons/icon128.png`
   - Screenshots: `docs/cws-assets/screenshot-{1..5}.png`
   - Promo tiles: `docs/cws-assets/promo-{small,marquee}.png`
4. **Privacy tab** — copy from [`docs/CWS-LISTING.md`](./CWS-LISTING.md):
   - Single-purpose statement
   - Permission justifications (all 6 + `<all_urls>`)
   - Privacy policy URL: `https://chirag127.github.io/bookmark-mind-bs-ext/docs/PRIVACY.md`
   - Data collection disclosures: check every "does not collect"
5. **Distribution tab** — Public, all regions, Free
6. **Submit for Review** — top-right

**Expected review time**: 5-14 days (extended review triggered by
`<all_urls>` host permission).

### Grab the Extension ID

After submission (even before approval), the CWS Developer Console shows
your Extension ID — a 32-character string in the URL:
`https://chrome.google.com/webstore/devconsole/<PROJECT_ID>/<EXTENSION_ID>/edit/listing`

Copy the **EXTENSION_ID**. You'll need it for auto-publish setup.

## Auto-publish setup (one-time OAuth wiring)

Once the manual submission is done, wire up automated publish for future
versions.

### Step 1 — Create a Google Cloud OAuth 2.0 Client

1. https://console.cloud.google.com/apis/credentials
2. Select or create a project
3. **APIs & Services → Library → search "Chrome Web Store API" → Enable**
4. **Credentials → + Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Desktop app**
6. Name: "BookmarkMind CWS Publisher"
7. Download the JSON — you need `client_id` and `client_secret`

### Step 2 — Get a refresh token

Run once locally:

```bash
CLIENT_ID="YOUR_CLIENT_ID"
CLIENT_SECRET="YOUR_CLIENT_SECRET"

# Step 2a — open this URL in a browser, click "Allow"
echo "https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=$CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob&scope=https://www.googleapis.com/auth/chromewebstore&access_type=offline&prompt=consent"

# Step 2b — Google shows a code. Paste it here:
CODE="paste_the_code_here"

# Step 2c — exchange code for refresh token
curl -sS -X POST https://oauth2.googleapis.com/token \
  -d "client_id=$CLIENT_ID" \
  -d "client_secret=$CLIENT_SECRET" \
  -d "code=$CODE" \
  -d "grant_type=authorization_code" \
  -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob"

# Copy the "refresh_token" field
```

### Step 3 — Save secrets in GitHub

```bash
gh secret set CWS_CLIENT_ID --repo chirag127/bookmark-mind-bs-ext --body "$CLIENT_ID"
gh secret set CWS_CLIENT_SECRET --repo chirag127/bookmark-mind-bs-ext --body "$CLIENT_SECRET"
gh secret set CWS_REFRESH_TOKEN --repo chirag127/bookmark-mind-bs-ext --body "$REFRESH_TOKEN"
gh secret set CWS_EXTENSION_ID --repo chirag127/bookmark-mind-bs-ext --body "$EXTENSION_ID"
```

## Subsequent releases (automated)

Once secrets are set, every future release is:

```bash
# 1. Bump manifest.json + package.json version (in same commit)
# 2. npm run docs         # regenerate tables from registry
# 3. git commit -am "chore: bump v1.2.1"
# 4. git tag v1.2.1
# 5. git push --tags
```

`.github/workflows/cws-publish.yml` fires on the tag push:

1. Verifies `manifest.json` version matches the tag
2. Runs `npm run docs` and fails if the working tree is dirty (forces
   you to commit the regenerated docs before tagging)
3. Runs `npm run package` → `dist/bookmarkmind-v<ver>.zip`
4. Refreshes CWS OAuth access token
5. Uploads the ZIP via CWS API
6. Publishes for review
7. Attaches the ZIP to the GitHub Release

Manual trigger (upload without publish):

```
Actions → Publish to Chrome Web Store → Run workflow → version=1.2.1, publish=false
```

## During review

CWS may email:
- **Approval**: extension goes live within ~1 hour of approval
- **Rejection**: fix, retag with an incremented version, re-run auto-publish
- **Clarification request**: reply via Developer Console

Common rejection reasons on `<all_urls>` extensions:
- Insufficient permission justification → strengthen `<all_urls>` block in
  `docs/CWS-LISTING.md` + run `npm run docs`
- Screenshots don't show core functionality → capture real screencaps
  against real bookmark data + replace `docs/cws-assets/*.png`
- Missing/inadequate privacy policy → strengthen `docs/PRIVACY.md`

## Post-approval

1. Verify listing at `https://chrome.google.com/webstore/detail/<id>`
2. Update README.md badge to link CWS listing (optional)
3. Monitor:
   - CWS Developer Console → Metrics for install/uninstall trends
   - CWS reviews for user feedback (respond politely)
   - GitHub Issues for bugs

## Under-the-hood

Full contract:

- **Source of truth**: `extension/lib/providers/registry.js` +
  `extension/manifest.json`. Everything else is generated.
- `scripts/gen-docs.mjs` → regenerates the provider table + permission
  justifications + package.json description from those two files.
- `scripts/package.mjs` → cross-platform ZIP builder producing
  `dist/bookmarkmind-v<version>.zip` with manifest at ZIP root.
- `scripts/screenshots.mjs` → headless Chrome captures 5 PNGs at 1280×800
  into `docs/cws-assets/` from HTML mockups that use the actual UI CSS.
- `.github/workflows/cws-publish.yml` → glues it together on tag push.

Never hand-edit generated blocks (search for `BEGIN-AUTOGEN` markers).
Edit the source of truth + run `npm run docs`.

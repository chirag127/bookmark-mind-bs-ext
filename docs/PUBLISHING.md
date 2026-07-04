# Publishing BookmarkMind to the Chrome Web Store

Step-by-step guide from local repo → live CWS listing. Assumes you have
this repo cloned and Node 20+ installed.

## Prerequisites

1. **Chrome Web Store Developer account** — one-time $5 USD registration
   at https://chrome.google.com/webstore/devconsole. Requires a valid
   Google account.
2. **Node 20+** installed (`node --version`).
3. **Publish PRIVACY.md as a public HTTPS URL** — the CWS listing needs
   a privacy-policy URL. Options:
   - Enable GitHub Pages on `chirag127/bookmark-mind-bs-ext` and reference
     `https://chirag127.github.io/bookmark-mind-bs-ext/docs/PRIVACY.md`
   - Or host it on Cloudflare Pages / any static HTTPS host.
4. **Capture screenshots** — see `CWS-LISTING.md` § Screenshots for the
   recommended shot list. Chrome Web Store requires 1-5 PNG/JPG images at
   1280×800 or 640×400.

## Step 1 — Build the extension ZIP

```bash
cd /path/to/bookmark-mind-bs-ext
npm install
npm run package
```

This runs `scripts/package.mjs` which reads the version from
`extension/manifest.json` and produces `dist/bookmarkmind-v1.2.0.zip`
containing ONLY the extension/ directory contents (manifest at zip root).

Verify:

```bash
# manifest.json must be at zip root, NOT nested inside `extension/`
unzip -l dist/bookmarkmind-v1.2.0.zip | grep manifest.json
# Should print: manifest.json (no folder prefix)
```

## Step 2 — Test the ZIP locally

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Drag-and-drop `dist/bookmarkmind-v1.2.0.zip` onto the page
4. Verify:
   - Extension icon appears in Chrome toolbar
   - Clicking it opens the popup
   - Options page loads with the new provider-list UI
   - Adding a provider works (test with Groq — permanent free tier, no card)
   - "Categorize" runs end-to-end on a small subset of bookmarks

## Step 3 — Log into the CWS Developer Console

Visit https://chrome.google.com/webstore/devconsole.

If this is your first extension:
1. Pay the one-time $5 registration fee
2. Verify your email + Google account

## Step 4 — Create the item

1. Click **+ New Item** (top-right)
2. Upload `dist/bookmarkmind-v1.2.0.zip`
3. Wait ~30 seconds for CWS to parse the manifest

If parsing fails:
- Manifest V3 required — verify `manifest_version: 3`
- All referenced files (icons, popup, options) must exist in the ZIP
- No `.git/`, `node_modules/`, or test files in the ZIP

## Step 5 — Fill the Store Listing tab

Copy verbatim from `docs/CWS-LISTING.md`:

- **Item name**: `BookmarkMind — AI Bookmark Organizer`
- **Summary**: (see CWS-LISTING.md § Summary)
- **Detailed description**: (see § Detailed description)
- **Category**: Productivity
- **Language**: English
- **Store icon (128×128)**: use `extension/icons/icon128.png`
- **Screenshots**: upload the 3-5 PNGs you captured
- **Promo tile (optional)**: 440×280 or 1400×560

## Step 6 — Fill the Privacy Tab (CRITICAL)

This is where extended review triggers if incomplete.

1. **Single purpose statement**: copy from CWS-LISTING.md § Single purpose
2. **Permission justifications**: for EACH of the 6 permissions
   (`bookmarks`, `storage`, `tabs`, `notifications`, `alarms`, `activeTab`)
   and the `<all_urls>` host permission, paste the justification from
   CWS-LISTING.md
3. **Privacy policy URL**: the public HTTPS URL where you published PRIVACY.md
4. **Data collection disclosures**: check ALL of:
   - "Does not collect personally identifiable information"
   - "Does not collect health information"
   - "Does not collect financial and payment information"
   - "Does not collect authentication information" (NOTE: keys are stored
     locally, never transmitted to us; we don't collect them)
   - "Does not collect personal communications"
   - "Does not collect location"
   - "Does not collect web history"
   - "Does not collect user activity"
   - "Does not collect website content" (NOTE: bookmark titles/URLs are
     sent to the user-chosen LLM provider, not to BookmarkMind. We have
     no server. Answer "does not collect" — we don't collect anything.)

## Step 7 — Distribution tab

- **Visibility**: Public
- **Distribution regions**: All regions (or select specific if you want)
- **Pricing**: Free

## Step 8 — Submit for review

1. Save all tabs
2. Click **Submit for Review** (top-right)
3. Confirm the submission dialog

**Expected review time**:
- Standard: 1-3 business days
- **Extended review**: because of the `<all_urls>` host permission,
  expect 5-14 business days. CWS reviewers will manually verify the
  extension doesn't abuse the permission.

## Step 9 — During review

CWS may email you with:
- **Approval**: extension goes live within ~1 hour
- **Rejection with reasons**: fix the issues, upload a new ZIP, resubmit
- **Request for clarification**: reply via the Developer Console

Common rejection reasons for `<all_urls>` extensions:
- Insufficient permission justification → strengthen the `<all_urls>`
  justification in CWS-LISTING.md
- Missing privacy policy → publish PRIVACY.md and add the URL
- Screenshots don't show the extension's core functionality → add
  screenshots showing the provider list + a live categorization

## Step 10 — Post-approval

Once live at `https://chrome.google.com/webstore/detail/<id>`:

1. Add the CWS listing URL to `README.md` and `manifest.json`'s
   `homepage_url` field (optional but good practice)
2. Announce via GitHub release + your own channels
3. Monitor:
   - CWS Developer Console → Metrics for install/uninstall trends
   - CWS reviews for user feedback (respond politely)
   - GitHub Issues for bugs

## Publishing updates

For subsequent versions:
1. Bump `version` in BOTH `extension/manifest.json` AND `package.json`
2. `git commit -am "feat: <what changed>"` + push
3. `npm run package` → produces new `dist/bookmarkmind-v<ver>.zip`
4. Upload the new ZIP via CWS Dev Console → Item → Package
5. Update store description if features changed
6. Submit for review (updates usually approved faster than initial listing)

## Publisher note — verified/trusted publisher

After ~1 year of activity + no policy violations, Google may verify your
publisher account which:
- Removes the "Featured" limitation
- Improves search ranking
- Enables larger install counts before manual review

Nothing to do — happens automatically.

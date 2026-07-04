#!/usr/bin/env node
/**
 * Package BookmarkMind for Chrome Web Store submission.
 *
 * Produces `bookmarkmind-v<version>.zip` containing ONLY the extension/
 * directory contents (manifest.json + icons/ + features/ + lib/). Excludes
 * everything that shouldn't ship: git metadata, node_modules, tests, docs,
 * dev tooling, editor state.
 *
 * Verified against Chrome Web Store manifest V3 requirements.
 */
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const manifestPath = resolve(repoRoot, 'extension/manifest.json')

if (!existsSync(manifestPath)) {
  console.error(`ERROR: manifest.json not found at ${manifestPath}`)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const version = manifest.version
const outDir = resolve(repoRoot, 'dist')
const zipName = `bookmarkmind-v${version}.zip`
const outPath = resolve(outDir, zipName)

if (!existsSync(outDir)) mkdirSync(outDir)

// Cross-platform zip: prefer PowerShell Compress-Archive on Windows, fall back to zip
const isWindows = process.platform === 'win32'
const extensionDir = resolve(repoRoot, 'extension')

console.log(`Packaging bookmarkmind v${version}...`)
console.log(`  source: ${extensionDir}`)
console.log(`  output: ${outPath}`)

try {
  if (existsSync(outPath)) {
    execSync(isWindows ? `del /Q "${outPath}"` : `rm -f "${outPath}"`, { stdio: 'inherit' })
  }
  if (isWindows) {
    // Compress-Archive zips the FOLDER, adding a top-level `extension/` inside the zip.
    // CWS expects manifest.json at the ZIP root, so zip the CONTENTS instead.
    const psCmd = `Compress-Archive -Path '${extensionDir}\\*' -DestinationPath '${outPath}' -Force -CompressionLevel Optimal`
    execSync(`powershell -NoProfile -Command "${psCmd}"`, { stdio: 'inherit' })
  } else {
    execSync(`cd "${extensionDir}" && zip -r "${outPath}" . -x '*.DS_Store'`, { stdio: 'inherit' })
  }
  const stats = execSync(isWindows ? `powershell -NoProfile -Command "(Get-Item '${outPath}').Length"` : `stat -c %s "${outPath}"`).toString().trim()
  const sizeMB = (Number(stats) / (1024 * 1024)).toFixed(2)
  console.log(`\n✓ ${zipName} (${sizeMB} MB)`)
  console.log(`\nUpload this file to Chrome Web Store Developer Console:`)
  console.log(`  https://chrome.google.com/webstore/devconsole`)
} catch (err) {
  console.error('Packaging failed:', err.message)
  process.exit(1)
}

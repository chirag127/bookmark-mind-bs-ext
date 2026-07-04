import * as keyStore from '../../lib/providers/keyStore.js';
/**
 * AIProcessor — provider-driven (v1.2.0+)
 *
 * Complete rewrite. Delegates every LLM call to chatOrchestrator (which
 * uses the provider registry + key store + adapter). Preserves the
 * public API surface Categorizer + background.js depend on:
 *
 *   setApiKey(geminiKey, cerebrasKey, groqKey)   — one-time legacy migration only
 *   categorizeBookmarks(bookmarks, suggestedCategories, learningData, progressCallback)
 *   processBatch(batch, dynamicCategories, learningData, onMarkAsAIMoved)
 *   _generateDynamicCategories(bookmarks, suggestedCategories, learningData)
 *   _enrichBatchWithTitles(batch)
 *   getQueueMetrics() / displayQueueMetrics() / clearQueueMetrics()
 *
 * The legacy 3970-line Gemini/Cerebras/Groq-specific fetch machinery is
 * gone. Providers now come from the settings-providers UI (chrome.storage.sync
 * providerKeys + providerOrder + customProviders).
 */
import { AnalyticsService } from '../analytics/analyticsService.js';
import { PerformanceMonitor } from '../analytics/performanceMonitor.js';
import { BookmarkService } from '../bookmarks/bookmarkService.js';
import { CategoryGrouper } from './categoryGrouper.js';
import { chatOrchestrator } from './chatOrchestrator.js';

/** Simple request queue for compatibility with old getQueueMetrics API. */
export class RequestQueue {
  constructor() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      queueDepth: 0,
      throttledRequests: 0
    };
  }
  getMetrics() {
    return { ...this.metrics };
  }
  getDetailedMetrics() {
    return this.getMetrics();
  }
  clearMetrics() {
    for (const k of Object.keys(this.metrics)) this.metrics[k] = 0;
  }
  recordSuccess() {
    this.metrics.totalRequests++;
    this.metrics.successfulRequests++;
  }
  recordFailure() {
    this.metrics.totalRequests++;
    this.metrics.failedRequests++;
  }
}

export class AIProcessor {
  constructor() {
    this.bookmarkService = null;
    this.categoryGrouper = typeof CategoryGrouper !== 'undefined' ? new CategoryGrouper() : null;
    this.analyticsService = typeof AnalyticsService !== 'undefined' ? new AnalyticsService() : null;
    this.performanceMonitor =
      typeof PerformanceMonitor !== 'undefined' ? new PerformanceMonitor() : null;
    this.requestQueue = new RequestQueue();
    this.customModelConfig = null;
    // Kept for backwards-compat with legacy code that checks .apiKey to know if init'd
    this.apiKey = null;
  }

  /**
   * Legacy compatibility. If any of the three keys are set, migrate them into
   * the new keyStore (idempotent). Then check providers are configured.
   */
  async setApiKey(geminiKey, cerebrasKey = null, groqKey = null) {
    // One-shot migration if legacy keys passed and orchestrator has none
    const providers = await chatOrchestrator.getEnabledProviders();
    if (providers.length > 0) {
      this.apiKey = 'orchestrator'; // sentinel so `if (this.apiKey)` checks pass
      if (!this.bookmarkService && typeof BookmarkService !== 'undefined') {
        this.bookmarkService = new BookmarkService();
      }
      return;
    }
    // Fall back — migrate whatever legacy keys were passed
    if (geminiKey) await keyStore.set('gemini', geminiKey);
    if (cerebrasKey) await keyStore.set('cerebras', cerebrasKey);
    if (groqKey) await keyStore.set('groq', groqKey);
    if (geminiKey || cerebrasKey || groqKey) {
      this.apiKey = 'orchestrator';
    }
    if (!this.bookmarkService && typeof BookmarkService !== 'undefined') {
      this.bookmarkService = new BookmarkService();
    }
  }

  setCustomModelConfig(config) {
    this.customModelConfig = config;
  }

  getQueueMetrics() {
    return this.requestQueue.getMetrics();
  }
  displayQueueMetrics() {
    return this.requestQueue.getDetailedMetrics();
  }
  clearQueueMetrics() {
    this.requestQueue.clearMetrics();
  }

  /**
   * Called by Categorizer after `_enrichBatchWithTitles`. Prompts the LLM for
   * category assignments for a batch of bookmarks. Returns [{ category, title, confidence }].
   */
  async processBatch(batch, dynamicCategories, _learningData = {}, _onMarkAsAIMoved = null) {
    if (!batch || batch.length === 0) return [];
    const providers = await chatOrchestrator.getEnabledProviders();
    if (providers.length === 0) {
      throw new Error('No AI providers configured. Open BookmarkMind Options → Add Provider.');
    }

    const messages = [
      {
        role: 'system',
        content: `You are a bookmark categorizer. Assign each bookmark to one of these categories:\n${dynamicCategories.join('\n')}\n\nReturn a JSON array where each element is {"category": "...", "title": "cleaned/improved title", "confidence": 0.0-1.0}. One element per bookmark, in the same order. Categories must be one of the provided list verbatim.`
      },
      {
        role: 'user',
        content: `Categorize these ${batch.length} bookmarks:\n${batch.map((b, i) => `${i + 1}. "${b.title || 'Untitled'}" — ${b.url || 'no-url'}`).join('\n')}\n\nReturn ONLY a JSON array. No prose.`
      }
    ];

    try {
      const { data } = await chatOrchestrator.chatJson(messages, { temperature: 0.2 });
      this.requestQueue.recordSuccess();
      if (!Array.isArray(data)) throw new Error('LLM did not return a JSON array');
      // Normalize: ensure we have one result per input
      return batch.map((b, i) => {
        const r = data[i] || {};
        const category =
          r.category && dynamicCategories.includes(r.category) ? r.category : dynamicCategories[0];
        const title = r.title || b.title || 'Untitled';
        const confidence = typeof r.confidence === 'number' ? r.confidence : 0.5;
        return { category, title, confidence };
      });
    } catch (err) {
      this.requestQueue.recordFailure();
      console.error(`[AIProcessor.processBatch] ${err.message}`);
      throw err;
    }
  }

  /**
   * Generate a functional category tree from a sample of bookmarks.
   */
  async _generateDynamicCategories(bookmarks, suggestedCategories = [], _learningData = {}) {
    const providers = await chatOrchestrator.getEnabledProviders();
    if (providers.length === 0) {
      throw new Error('No AI providers configured. Open BookmarkMind Options → Add Provider.');
    }
    const sample = bookmarks.slice(0, Math.min(150, bookmarks.length));
    const existingFolders = await this._getExistingFolderStructure();

    const messages = [
      {
        role: 'system',
        content:
          'You generate hierarchical bookmark categories in FMHY style — functional grouping (what services DO, not who provides them). Format: "Category > Subcategory". 2-3 levels max. Reuse existing folder names where possible. Return a JSON array of category paths.'
      },
      {
        role: 'user',
        content: `Bookmarks (${sample.length} sampled):\n${sample.map((b, i) => `${i + 1}. "${b.title || 'Untitled'}" — ${b.url ? new URL(b.url).hostname : 'no-url'}`).join('\n')}\n\nExisting folders (reuse when possible):\n${existingFolders.slice(0, 30).join('\n') || '(none)'}\n\nSuggested categories to consider: ${suggestedCategories.join(', ') || '(none)'}\n\nReturn a JSON array of 15-40 category paths. Examples: "Tools > File Tools > Cloud Storage", "Development > Documentation", "Privacy > VPN". Return ONLY the JSON array.`
      }
    ];

    try {
      const { data } = await chatOrchestrator.chatJson(messages, { temperature: 0.3 });
      this.requestQueue.recordSuccess();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('LLM did not return a JSON array of categories');
      }
      return data.filter((c) => typeof c === 'string' && !/^other$/i.test(c));
    } catch (err) {
      this.requestQueue.recordFailure();
      console.error(`[AIProcessor._generateDynamicCategories] ${err.message}`);
      throw err;
    }
  }

  /**
   * High-level entry point for full-fleet categorization.
   * Categorizer typically calls processNextBatch in alarms; this is the
   * one-shot synchronous API kept for callers (dashboard.js) that expect it.
   */
  async categorizeBookmarks(
    bookmarks,
    suggestedCategories = [],
    learningData = {},
    progressCallback = null
  ) {
    if (!bookmarks || bookmarks.length === 0) return { categories: [], results: [] };
    const categories = await this._generateDynamicCategories(
      bookmarks,
      suggestedCategories,
      learningData
    );
    const settings = await this._getSettings();
    const batchSize = settings.batchSize || 50;
    const results = [];
    let batchNum = 0;
    const totalBatches = Math.ceil(bookmarks.length / batchSize);
    for (let i = 0; i < bookmarks.length; i += batchSize) {
      batchNum++;
      const batch = bookmarks.slice(i, i + batchSize);
      await this._enrichBatchWithTitles(batch);
      const batchResults = await this.processBatch(batch, categories, learningData);
      results.push(...batchResults);
      progressCallback?.(batchNum, totalBatches);
    }
    return { categories, results };
  }

  /**
   * Fetch live page titles concurrently. Preserved from legacy AIProcessor
   * because Categorizer calls it directly.
   */
  async _enrichBatchWithTitles(batch) {
    const settings = await this._getSettings();
    const concurrency = settings.titleFetchConcurrency || 5;
    const enableMetrics = settings.showDetailedLogs || false;
    const t0 = Date.now();
    let updated = 0;
    for (let i = 0; i < batch.length; i += concurrency) {
      const chunk = batch.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (bookmark) => {
          if (!bookmark.url) return;
          try {
            const liveTitle = await this._fetchPageTitle(bookmark.url);
            if (liveTitle && liveTitle !== bookmark.title) {
              bookmark.title = liveTitle;
              updated++;
            }
          } catch {
            // ignore — title fetch failure is non-fatal
          }
        })
      );
    }
    if (enableMetrics)
      console.log(`Title fetch: ${updated}/${batch.length} updated in ${Date.now() - t0}ms`);
  }

  async _fetchPageTitle(url, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) return null;
      const html = await res.text();
      const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      return m ? m[1].trim() : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async _getExistingFolderStructure() {
    try {
      const folders = [];
      await this._collectFolderPaths('1', '', folders);
      await this._collectFolderPaths('2', '', folders);
      return folders.filter(
        (f) =>
          f &&
          !['Bookmarks Bar', 'Other Bookmarks', 'Mobile Bookmarks'].includes(f) &&
          !f.includes('Recently Added')
      );
    } catch (err) {
      console.warn('[AIProcessor] getExistingFolderStructure failed:', err.message);
      return [];
    }
  }

  async _collectFolderPaths(parentId, currentPath, folderPaths) {
    try {
      const children = await chrome.bookmarks.getChildren(parentId);
      for (const child of children) {
        if (!child.url) {
          const path = currentPath ? `${currentPath} > ${child.title}` : child.title;
          folderPaths.push(path);
          await this._collectFolderPaths(child.id, path, folderPaths);
        }
      }
    } catch {
      /* ignore */
    }
  }

  async _getSettings() {
    const defaults = {
      batchSize: 50,
      titleFetchConcurrency: 5,
      maxCategoryDepth: 3,
      showDetailedLogs: false
    };
    try {
      const { bookmarkMindSettings } = await chrome.storage.sync.get('bookmarkMindSettings');
      return { ...defaults, ...(bookmarkMindSettings || {}) };
    } catch {
      return defaults;
    }
  }
}

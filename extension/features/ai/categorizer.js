import * as keyStore from '../../lib/providers/keyStore.js';
import { AnalyticsService } from '../analytics/analyticsService.js';
import { BookmarkService } from '../bookmarks/bookmarkService.js';
import { FolderManager } from '../bookmarks/folderManager.js';
import { SnapshotManager } from '../bookmarks/snapshotManager.js';
import { AIProcessor } from './aiProcessor.js';
import { LearningService } from './learningService.js';
/**
 * BookmarkMind - Categorizer
 * Main orchestrator for bookmark categorization process
 */

export class Categorizer {
  constructor(aiProcessor, callbacks = {}) {
    this.bookmarkService = new BookmarkService();
    this.aiProcessor = aiProcessor || new AIProcessor();
    this.folderManager = new FolderManager();
    this.callbacks = callbacks;
    this.learningService = typeof LearningService !== 'undefined' ? new LearningService() : null;
    this.snapshotManager = typeof SnapshotManager !== 'undefined' ? new SnapshotManager() : null;
    this.analyticsService = typeof AnalyticsService !== 'undefined' ? new AnalyticsService() : null;
    this.isProcessing = false;
    this.sessionStartTime = null;
  }

  /**
   * Initialize categorizer with settings
   * @param {Object} settings - User settings
   */
  async initialize(settings) {
    if (settings.apiKey) {
      this.aiProcessor.setApiKey(
        settings.apiKey,
        settings.cerebrasApiKey || null,
        settings.groqApiKey || null
      );
    }
  }

  /**
   * Main categorization process
   * @param {Function} progressCallback - Progress update callback
   * @param {boolean} forceReorganize - Whether to reorganize all bookmarks
   * @returns {Promise<Object>} Results summary
   */
  async categorizeAllBookmarks(progressCallback, forceReorganize = false) {
    if (this.isProcessing) {
      throw new Error('Categorization already in progress');
    }

    this.isProcessing = true;
    this.sessionStartTime = Date.now();

    try {
      console.log('Categorizer: Starting persistent categorization...');
      progressCallback?.({ stage: 'starting', progress: 0 });

      // Get settings first
      const settings = await this._getSettings();

      // v1.2.0+: check provider keyStore first, fall back to legacy apiKey
      const configuredProviders = await keyStore.list();
      if (configuredProviders.length === 0 && !settings.apiKey) {
        throw new Error('No AI providers configured. Open BookmarkMind Options → Add Provider.');
      }

      await this.aiProcessor.setApiKey(
        settings.apiKey,
        settings.cerebrasApiKey || null,
        settings.groqApiKey || null
      );

      // Create snapshot before starting (if enabled)
      if (this.snapshotManager && settings.autoSnapshot !== false) {
        try {
          progressCallback?.({
            stage: 'snapshot',
            progress: 5,
            message: 'Creating backup snapshot...'
          });
          const bookmarks = await this.bookmarkService.getAllBookmarks();
          await this.snapshotManager.createSnapshot(
            forceReorganize ? 'Before Force Reorganization' : 'Before AI Categorization',
            {
              operationType: forceReorganize ? 'force_reorganize' : 'categorization',
              bookmarkCount: bookmarks.length,
              uncategorizedCount: bookmarks.filter((b) => ['1', '2', '3'].includes(b.parentId))
                .length
            }
          );
        } catch (snapshotError) {
          console.warn('Failed to create snapshot:', snapshotError);
        }
      }

      // Get bookmarks
      progressCallback?.({ stage: 'loading', progress: 10 });
      const bookmarks = await this.bookmarkService.getAllBookmarks();

      let uncategorizedBookmarks;
      if (forceReorganize) {
        uncategorizedBookmarks = bookmarks;
      } else {
        uncategorizedBookmarks = bookmarks.filter((bookmark) => {
          const isInMainFolders = ['1', '2', '3'].includes(bookmark.parentId);
          const isInRootLevel =
            bookmark.currentFolderName &&
            ['Bookmarks Bar', 'Other Bookmarks', 'Mobile Bookmarks'].includes(
              bookmark.currentFolderName
            );
          return isInMainFolders || isInRootLevel;
        });
      }

      if (uncategorizedBookmarks.length === 0) {
        this.isProcessing = false;
        return {
          processed: bookmarks.length,
          categorized: 0,
          errors: 0,
          message: 'All bookmarks are already organized!'
        };
      }

      // Initialize persistent state
      const batchSize = settings.batchSize || 50;
      const state = {
        bookmarks: uncategorizedBookmarks,
        totalBookmarks: uncategorizedBookmarks.length,
        currentIndex: 0,
        batchSize: batchSize,
        results: [],
        generatedCategories: [],
        startTime: Date.now(),
        forceReorganize: forceReorganize,
        settings: settings
      };

      await this._saveState(state);

      // Notify background to start AI mode
      await chrome.runtime.sendMessage({
        action: 'startAICategorization'
      });

      // Schedule first batch immediately via alarm
      await chrome.alarms.create('process_categorization_batch', {
        when: Date.now() + 100
      });

      console.log(`Categorization started: ${uncategorizedBookmarks.length} bookmarks queued.`);
      return {
        started: true,
        message: 'Categorization started in background'
      };
    } catch (_error) {
      console.error('Categorization start _error:', _error);
      this.isProcessing = false;
      throw _error;
    }
  }

  /**
   * Process the next batch of bookmarks (called by alarm)
   */
  async processNextBatch() {
    try {
      const state = await this._loadState();
      if (!state || state.currentIndex >= state.totalBookmarks) {
        await this._finishCategorization(state);
        return;
      }

      console.log(
        `Processing batch starting at index ${state.currentIndex}/${state.totalBookmarks}`
      );

      // Initialize services if needed (service worker might have restarted)
      if (!this.aiProcessor.apiKey) {
        await this.aiProcessor.setApiKey(
          state.settings?.apiKey || null,
          state.settings?.cerebrasApiKey || null,
          state.settings?.groqApiKey || null
        );
      }

      // Get batch
      const batch = state.bookmarks.slice(state.currentIndex, state.currentIndex + state.batchSize);

      // Enrich titles
      await this.aiProcessor._enrichBatchWithTitles(batch);

      // Process batch
      // We need to get learning data again as it might have changed or we are in a new worker
      const learningData = await this._getLearningData();

      // Get dynamic categories from state or generate new ones if first batch
      let dynamicCategories = state.generatedCategories;
      if (state.currentIndex === 0) {
        dynamicCategories = await this.aiProcessor._generateDynamicCategories(
          state.bookmarks, // Use all bookmarks for better category generation
          state.settings.categories,
          learningData
        );
      }

      // Process batch
      const _results = await this.aiProcessor.processBatch(
        batch,
        dynamicCategories,
        learningData,
        this.callbacks.onMarkAsAIMoved // Pass the callback here
      );

      // v1.2.0+: apply the moves. Legacy AIProcessor did this inline; the
      // new provider-driven AIProcessor returns [{category, title, confidence}]
      // and the categorizer is responsible for the folder-create + move.
      for (let i = 0; i < _results.length; i++) {
        const bookmark = batch[i];
        const result = _results[i];
        if (!bookmark || !result || !result.category) continue;
        try {
          // Mark AI-moved so learningService doesn't record it as a user correction
          try {
            if (this.callbacks.onMarkAsAIMoved) this.callbacks.onMarkAsAIMoved(bookmark.id);
            else
              await chrome.runtime.sendMessage({
                action: 'markBookmarkAsAIMoved',
                bookmarkId: bookmark.id
              });
            await chrome.storage.local.set({ [`ai_moved_${bookmark.id}`]: Date.now() });
          } catch {
            /* non-fatal */
          }
          // Ensure folder exists — AI returns "Category > Subcategory"; FolderManager expects "/"
          const path = result.category.split(/\s*>\s*/).join('/');
          const folderId = await this.folderManager._createCategoryFolder(path, '1');
          // Update title if AI provided a better one, then move
          if (result.title && result.title !== bookmark.title) {
            await chrome.bookmarks.update(bookmark.id, { title: result.title });
          }
          await chrome.bookmarks.move(bookmark.id, { parentId: folderId });
        } catch (mvErr) {
          console.warn(`[Categorizer] move failed for ${bookmark.id}:`, mvErr?.message);
        }
      }

      // Update state
      state.currentIndex += state.batchSize;
      state.generatedCategories = dynamicCategories;

      // Save state
      await this._saveState(state);

      // Schedule next batch
      await chrome.alarms.create('process_categorization_batch', {
        when: Date.now() + 1000 // Process next batch in 1 second
      });
    } catch (_error) {
      console.error('_error processing batch:', _error);
      this.isProcessing = false;
      // Clear alarm on error to stop processing loop
      await chrome.alarms.clear('process_categorization_batch');
    }
  }

  /**
   * Save categorization state
   * @param {Object} state - State to save
   */
  async _saveState(state) {
    await chrome.storage.local.set({ categorizationState: state });
  }

  /**
   * Load categorization state
   * @returns {Promise<Object>} State
   */
  async _loadState() {
    const result = await chrome.storage.local.get('categorizationState');
    return result.categorizationState;
  }

  /**
   * Finish categorization process
   * @param {Object} state - Final state
   */
  async _finishCategorization(state) {
    this.isProcessing = false;
    await chrome.alarms.clear('process_categorization_batch');
    await chrome.storage.local.remove('categorizationState');

    // Notify background to end AI mode
    await chrome.runtime.sendMessage({
      action: 'endAICategorization'
    });

    const duration = Math.round((Date.now() - state.startTime) / 1000);
    console.log(
      `Categorization finished in ${duration}s. Processed ${state.totalBookmarks} bookmarks.`
    );
  }

  /**
   * Record user correction for learning
   * @param {string} bookmarkId - Bookmark ID
   * @param {string} originalCategory - AI-assigned category
   * @param {string} correctedCategory - User-corrected category
   */
  async recordCorrection(bookmarkId, originalCategory, correctedCategory) {
    try {
      const bookmark = await chrome.bookmarks.get(bookmarkId);
      if (!bookmark || !bookmark[0]) return;

      const bookmarkData = bookmark[0];
      if (!this.learningService) {
        this.learningService = new LearningService();
      }
      await this.learningService.recordCorrection(
        bookmarkData,
        originalCategory,
        correctedCategory,
        true
      );
      console.log(
        `Recorded correction: ${originalCategory} → ${correctedCategory} for "${bookmarkData.title}"`
      );
    } catch (_error) {
      console.error('_error recording correction:', _error);
    }
  }

  /**
   * Categorize bookmarks with progress tracking across batches
   * @param {Array} bookmarks - All bookmarks to categorize
   * @param {Array} suggestedCategories - Suggested categories
   * @param {Object} learningData - Learning data
   * @param {number} batchSize - Size of each batch
   * @param {Function} progressCallback - Progress callback
   * @returns {Promise<Object>} Categorization results
   */
  async _categorizeWithProgress(
    bookmarks,
    suggestedCategories,
    learningData,
    batchSize,
    progressCallback
  ) {
    const totalBatches = Math.ceil(bookmarks.length / batchSize);
    console.log(
      `Processing ${bookmarks.length} bookmarks in ${totalBatches} batches of ${batchSize}`
    );

    let _currentBatch = 0;

    // Call the aiProcessor's categorizeBookmarks method which handles batching internally
    // but wrap it to provide progress updates
    const results = await this.aiProcessor.categorizeBookmarks(
      bookmarks,
      suggestedCategories,
      learningData,
      (batchNum, total) => {
        _currentBatch = batchNum;
        const batchProgress = Math.floor((batchNum / total) * 100);
        progressCallback?.({
          currentBatch: batchNum,
          totalBatches: total,
          progress: batchProgress
        });
      }
    );

    return results;
  }

  /**
   * Get user settings
   * @returns {Promise<Object>} User settings
   */
  async _getSettings() {
    const defaultSettings = {
      apiKey: '',
      categories: [
        'Work',
        'Personal',
        'Shopping',
        'Entertainment',
        'News',
        'Social',
        'Learning',
        'Other'
      ],
      lastSortTime: 0,
      batchSize: 50,
      autoSnapshot: true,
      maxSnapshots: 5
    };

    try {
      const result = await chrome.storage.sync.get(['bookmarkMindSettings']);
      return { ...defaultSettings, ...result.bookmarkMindSettings };
    } catch (_error) {
      console.error('_error getting settings:', _error);
      return defaultSettings;
    }
  }

  /**
   * Get learning data
   * @returns {Promise<Object>} Learning data
   */
  async _getLearningData() {
    try {
      if (!this.learningService) {
        this.learningService = new LearningService();
      }
      return await this.learningService.getLearningData();
    } catch (_error) {
      console.error('_error getting learning data:', _error);
      return {
        version: '1.0',
        patterns: {},
        corrections: [],
        lastUpdated: null
      };
    }
  }

  /**
   * Update bookmarks with titles from currently open tabs
   * @param {Array} bookmarks - Array of bookmark objects
   * @returns {Promise<Array>} Updated bookmarks
   */
  async _updateBookmarksWithCurrentTabTitles(bookmarks) {
    try {
      // Check if tabs API is available
      if (!chrome.tabs) {
        console.warn('Tabs API not available, skipping title update from open tabs');
        return bookmarks;
      }

      console.log('Categorizer: Checking open tabs for updated titles...');
      const tabs = await chrome.tabs.query({});

      // Create a map of normalized URL -> Title
      const urlToTitle = new Map();
      tabs.forEach((tab) => {
        if (tab.url && tab.title) {
          urlToTitle.set(tab.url, tab.title);
        }
      });

      let updatedCount = 0;
      const updatedBookmarks = bookmarks.map((bookmark) => {
        if (urlToTitle.has(bookmark.url)) {
          const currentTitle = urlToTitle.get(bookmark.url);
          if (currentTitle && currentTitle !== bookmark.title) {
            console.log(
              `Updated title for "${bookmark.url}": "${bookmark.title}" -> "${currentTitle}"`
            );
            updatedCount++;
            return { ...bookmark, title: currentTitle };
          }
        }
        return bookmark;
      });

      console.log(`Updated ${updatedCount} bookmark titles from open tabs`);
      return updatedBookmarks;
    } catch (_error) {
      console.error('_error updating bookmark titles from tabs:', _error);
      return bookmarks;
    }
  }

  /**
   * Get categorization statistics
   * @returns {Promise<Object>} Statistics
   */
  async getStats() {
    try {
      const bookmarkStats = await this.bookmarkService.getBookmarkStats();
      const settings = await this._getSettings();
      const learningData = await this._getLearningData();

      return {
        ...bookmarkStats,
        lastSortTime: settings.lastSortTime,
        learningPatterns: Object.keys(learningData).length,
        categories: settings.categories.length
      };
    } catch (_error) {
      console.error('_error getting stats:', _error);
      return {};
    }
  }
}

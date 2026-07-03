/**
 * BookmarkMind - Background Script (Service Worker)
 * Handles extension lifecycle and background processing
 */
import { AIProcessor } from '../ai/aiProcessor.js';
import { Categorizer } from '../ai/categorizer.js';
import { CategoryGrouper } from '../ai/categoryGrouper.js';
import { LearningService } from '../ai/learningService.js';
import { ModelComparisonService } from '../ai/modelComparisonService.js';
import { AnalyticsService } from '../analytics/analyticsService.js';
import { BenchmarkService } from '../analytics/benchmarkService.js';
import { PerformanceMonitor } from '../analytics/performanceMonitor.js';
import { BookmarkService } from '../bookmarks/bookmarkService.js';
import { FolderInsights } from '../bookmarks/folderInsights.js';
import { FolderManager } from '../bookmarks/folderManager.js';
import { SnapshotManager } from '../bookmarks/snapshotManager.js';

// Global flag to track script loading state
let isAICategorizing = false;
const aiCategorizedBookmarks = new Set(); // Track bookmarks moved by AI
let aiCategorizationStartTime = null; // Track when AI categorization started

// Global flag to track snapshot restoration state
let isRestoringSnapshot = false;

// Debug function to log AI state
function logAIState(context) {
  console.log(`🤖 AI State [${context}]:`, {
    isAICategorizing,
    aiCategorizedBookmarksCount: aiCategorizedBookmarks.size,
    startTime: aiCategorizationStartTime,
    timeSinceStart: aiCategorizationStartTime ? Date.now() - aiCategorizationStartTime : null
  });
}

// Initialize extension on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('BookmarkMind extension started');

  // Resume categorization if it was in progress
  try {
    const result = await chrome.storage.local.get('categorization_state');
    if (result.categorization_state) {
      console.log('🔄 Resuming interrupted categorization...');
      if (typeof Categorizer !== 'undefined') {
        const categorizer = new Categorizer();
        await categorizer.processNextBatch();
      }
    }
  } catch (_error) {
    console.error('_error checking for interrupted categorization:', _error);
  }
});

// Handle extension installation
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('BookmarkMind extension installed/updated');

  if (details.reason === 'install') {
    // First time installation
    await initializeExtension();
  } else if (details.reason === 'update') {
    // Extension updated
    console.log(`Updated from version ${details.previousVersion}`);
  }
});

/**
 * Initialize extension with default settings
 */
async function initializeExtension() {
  try {
    const defaultSettings = {
      apiKey: '',
      cerebrasApiKey: '',
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
      hierarchicalMode: true,
      maxCategoryDepth: 4,
      minCategories: 15,
      maxCategories: 50,
      lastSortTime: 0,
      autoSort: false,
      batchSize: 50,
      cleanupEmptyFolders: false
    };

    // Check if settings already exist
    const existing = await chrome.storage.sync.get(['bookmarkMindSettings']);

    if (!existing.bookmarkMindSettings) {
      await chrome.storage.sync.set({
        bookmarkMindSettings: defaultSettings
      });
      console.log('Initialized default settings');
    }

    // Migrate learning data from sync to local storage for backwards compatibility
    const existingSyncLearning = await chrome.storage.sync.get(['bookmarkMindLearning']);
    const existingLocalLearning = await chrome.storage.local.get(['bookmarkMindLearning']);

    if (existingSyncLearning.bookmarkMindLearning && !existingLocalLearning.bookmarkMindLearning) {
      // Migration: Copy sync data to local storage
      await chrome.storage.local.set({
        bookmarkMindLearning: existingSyncLearning.bookmarkMindLearning
      });
      console.log('Migrated learning data from sync to local storage');
    } else if (!existingLocalLearning.bookmarkMindLearning) {
      // Initialize learning data storage in local storage
      await chrome.storage.local.set({
        bookmarkMindLearning: {}
      });
      console.log('Initialized learning data storage in local storage');
    }
  } catch (_error) {
    console.error('_error initializing extension:', _error);
  }
}

// Handle messages from popup and options pages
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('Background received message:', message);

  // Handle async operations properly
  (async () => {
    switch (message.action) {
      case 'startCategorization':
        await handleCategorization(message.data, sendResponse);
        break;

      case 'startBulkCategorization':
        await handleBulkCategorization(message.data, sendResponse);
        break;

      case 'getStats':
        await handleGetStats(sendResponse);
        break;

      case 'exportBookmarks':
        await handleExportBookmarks(sendResponse);
        break;

      case 'getAllBookmarks':
        await handleGetAllBookmarks(sendResponse);
        break;

      case 'moveAllToBookmarkBar':
        await handleMoveAllToBookmarkBar(sendResponse);
        break;

      case 'testApiKey':
        await handleApiKeyTest(message.data, sendResponse);
        break; // Added break to prevent fallthrough
      case 'getAvailableCategories':
        await handleGetAvailableCategories(sendResponse);
        break;

      case 'recategorizeBookmark':
        await handleRecategorizeBookmark(message.data, sendResponse);
        break;

      case 'exportLearningData':
        await handleExportLearningData(sendResponse);
        break;

      case 'importLearningData':
        await handleImportLearningData(message.data, sendResponse);
        break;

      case 'clearLearningData':
        await handleClearLearningData(sendResponse);
        break;

      case 'getLearningStatistics':
        await handleGetLearningStatistics(sendResponse);
        break;

      case 'getSnapshots':
        await handleGetSnapshots(sendResponse);
        break;

      case 'getPerformanceDashboard':
        await handleGetPerformanceDashboard(sendResponse);
        break;

      case 'exportAnalyticsReport':
        await handleExportAnalyticsReport(message.data, sendResponse);
        break;

      case 'ping':
        // Simple heartbeat check
        sendResponse({
          success: true,
          message: 'Background script is running'
        });
        break;

      case 'CATEGORIZATION_ERROR':
        // Handle categorization errors from AI processor
        await handleCategorizationError(message, sendResponse);
        break;

      case 'startAICategorization':
        // Mark AI categorization as starting
        isAICategorizing = true;
        aiCategorizedBookmarks.clear();
        aiCategorizationStartTime = Date.now();

        // AGGRESSIVE: Completely disable bookmark move listener during AI categorization
        try {
          chrome.bookmarks.onMoved.removeListener(bookmarkMoveListener);
          console.log('🤖 Bookmark move listener DISABLED during AI categorization');
        } catch (_error) {
          console.warn('Failed to disable bookmark move listener:', _error);
        }

        console.log('🤖 AI Categorization started - learning completely disabled');
        logAIState('START');
        sendResponse({ success: true });
        break;

      case 'endAICategorization':
        // Mark AI categorization as ended
        isAICategorizing = false;
        console.log(
          `🤖 AI Categorization ended - learning re-enabled. ${aiCategorizedBookmarks.size} bookmarks were moved by AI`
        );
        logAIState('END');

        // AGGRESSIVE: Re-enable bookmark move listener after AI categorization with delay
        setTimeout(() => {
          try {
            // Remove listener first (in case it's still there)
            chrome.bookmarks.onMoved.removeListener(bookmarkMoveListener);
            // Add it back
            chrome.bookmarks.onMoved.addListener(bookmarkMoveListener);
            console.log('🤖 Bookmark move listener RE-ENABLED after AI categorization');
          } catch (_error) {
            console.warn('Failed to re-enable bookmark move listener:', _error);
          }

          console.log('🤖 Clearing AI-moved bookmarks set after delay');
          aiCategorizedBookmarks.clear();
          aiCategorizationStartTime = null;
          logAIState('CLEANUP');
        }, 15000); // Increased delay to 15 seconds to ensure all AI moves are complete

        sendResponse({ success: true });
        break;

      case 'markBookmarkAsAIMoved':
        // Mark a specific bookmark as moved by AI
        if (message.bookmarkId) {
          aiCategorizedBookmarks.add(message.bookmarkId);
          console.log(
            `🤖 Marked bookmark ${message.bookmarkId} as AI-moved (total: ${aiCategorizedBookmarks.size})`
          );
          logAIState('MARK_BOOKMARK');
        }
        sendResponse({ success: true });
        break;

      case 'startSnapshotRestore':
        // Disable bookmark move listener during restoration
        isRestoringSnapshot = true;
        try {
          chrome.bookmarks.onMoved.removeListener(bookmarkMoveListener);
          console.log('🔄 Bookmark move listener DISABLED during snapshot restore');
        } catch (_error) {
          console.warn('Failed to disable bookmark move listener:', _error);
        }
        sendResponse({ success: true });
        break;

      case 'endSnapshotRestore':
        // Re-enable bookmark move listener after restoration
        isRestoringSnapshot = false;
        setTimeout(() => {
          try {
            chrome.bookmarks.onMoved.removeListener(bookmarkMoveListener);
            chrome.bookmarks.onMoved.addListener(bookmarkMoveListener);
            console.log('🔄 Bookmark move listener RE-ENABLED after snapshot restore');
          } catch (_error) {
            console.warn('Failed to re-enable bookmark move listener:', _error);
          }
        }, 5000);
        sendResponse({ success: true });
        break;

      case 'restoreSnapshot':
        await handleRestoreSnapshot(message.data, sendResponse);
        break;

      case 'deleteSnapshot':
        await handleDeleteSnapshot(message.data, sendResponse);
        break;

      case 'getAnalytics':
        await handleGetAnalytics(sendResponse);
        break;

      case 'clearAnalytics':
        await handleClearAnalytics(sendResponse);
        break;

      case 'runSnapshotDiagnostics':
        await handleRunSnapshotDiagnostics(sendResponse);
        break;

      case 'getModelComparison':
        await handleGetModelComparison(sendResponse);
        break;

      case 'startABTest':
        await handleStartABTest(message.data, sendResponse);
        break;

      case 'recordModelPerformance':
        await handleRecordModelPerformance(message.data, sendResponse);
        break;

      case 'getCostReport':
        await handleGetCostReport(message.data, sendResponse);
        break;

      case 'setBudgetAlert':
        await handleSetBudgetAlert(message.data, sendResponse);
        break;

      case 'getModelRecommendation':
        await handleGetModelRecommendation(message.data, sendResponse);
        break;

      case 'setCustomModelConfig':
        await handleSetCustomModelConfig(message.data, sendResponse);
        break;

      case 'getCustomModelConfig':
        await handleGetCustomModelConfig(sendResponse);
        break;

      case 'clearQuotaState':
        await handleClearQuotaState(sendResponse);
        break;

      default:
        console.warn('Unknown message action:', message.action);
        sendResponse({ success: false, error: 'Unknown action' });
    }
  })();

  return true; // Keep message channel open for async response
});

// Alarm listener for batch processing
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'process_categorization_batch') {
    console.log('⏰ Alarm triggered: process_categorization_batch');

    // Disable learning during AI categorization
    isAICategorizing = true;

    const categorizer = new Categorizer(new AIProcessor(), {
      onMarkAsAIMoved: (bookmarkId) => {
        aiCategorizedBookmarks.add(bookmarkId);
        console.log(`🤖 Marked bookmark ${bookmarkId} as AI-moved (ALARM CALLBACK)`);
      }
    });
    await categorizer.processNextBatch();
  }
});

/**
 * Handle bookmark categorization request
 */
async function handleCategorization(data, sendResponse) {
  try {
    console.log('Starting categorization process...');

    // Check if Categorizer class is available
    if (typeof Categorizer === 'undefined') {
      throw new Error('Categorizer class not loaded. Please reload the extension.');
    }
    console.log('✓ Categorizer class available');

    // Check if other required classes are available
    if (typeof BookmarkService === 'undefined') {
      throw new Error('BookmarkService class not loaded. Please reload the extension.');
    }
    if (typeof AIProcessor === 'undefined') {
      throw new Error('AIProcessor class not loaded. Please reload the extension.');
    }
    if (typeof FolderManager === 'undefined') {
      throw new Error('FolderManager class not loaded. Please reload the extension.');
    }
    console.log('✓ All required classes available');

    // Test Chrome APIs
    if (!chrome.bookmarks) {
      throw new Error('Chrome bookmarks API not available');
    }
    if (!chrome.storage) {
      throw new Error('Chrome storage API not available');
    }
    console.log('✓ Chrome APIs available');

    // Create categorizer instance
    console.log('Creating categorizer instance...');
    const categorizer = new Categorizer(new AIProcessor(), {
      onMarkAsAIMoved: (bookmarkId) => {
        aiCategorizedBookmarks.add(bookmarkId);
        console.log(`🤖 Marked bookmark ${bookmarkId} as AI-moved (HANDLER CALLBACK)`);
      }
    });
    console.log('✓ Categorizer instance created');

    // Get and validate settings
    console.log('Loading settings...');
    const settings = await chrome.storage.sync.get(['bookmarkMindSettings']);
    console.log('Settings loaded:', settings);

    if (!settings.bookmarkMindSettings) {
      throw new Error('Extension settings not found. Please configure the extension first.');
    }

    if (!settings.bookmarkMindSettings.apiKey) {
      throw new Error('API key not configured. Please set up your Gemini API key in settings.');
    }
    console.log('✓ Settings validated');

    // Check if Gemini quota is exhausted before attempting categorization
    const aiProcessor = new AIProcessor();
    aiProcessor.setApiKey(
      settings.bookmarkMindSettings.apiKey,
      settings.bookmarkMindSettings.cerebrasApiKey || null,
      settings.bookmarkMindSettings.groqApiKey || null
    );

    const isQuotaExhausted = await aiProcessor._isQuotaExhausted();
    if (isQuotaExhausted) {
      const quotaMessage = await aiProcessor._getQuotaExhaustedMessage();
      throw new Error(quotaMessage);
    }

    // Initialize categorizer
    console.log('Initializing categorizer...');
    await categorizer.initialize(settings.bookmarkMindSettings);
    console.log('✓ Categorizer initialized');

    // Start categorization with progress updates
    console.log('Starting categorization process...');
    const results = await categorizer.categorizeAllBookmarks((progress) => {
      console.log('Progress update:', progress);
      // Send progress updates to popup (with better error handling)
      try {
        chrome.runtime
          .sendMessage({
            action: 'categorizationProgress',
            data: progress
          })
          .catch((_error) => {
            console.log('Progress message failed (popup likely closed):', _error.message);
          });
      } catch (_error) {
        console.log('Progress callback error:', _error.message);
      }
    }, data.forceReorganize);

    console.log('Categorization completed:', results);

    // Update last sort time and save generated categories
    const updatedSettings = {
      ...settings.bookmarkMindSettings,
      lastSortTime: Date.now(),
      lastGeneratedCategories: results.generatedCategories || []
    };
    await chrome.storage.sync.set({
      bookmarkMindSettings: updatedSettings
    });

    sendResponse({ success: true, data: results });
  } catch (_error) {
    console.error('Categorization _error:', _error);
    console.error('_error stack:', _error.stack);
    sendResponse({
      success: false,
      error: _error.message || 'Categorization failed'
    });
  }
}

/**
 * Handle bulk categorization request for selected bookmarks
 */
async function handleBulkCategorization(data, sendResponse) {
  try {
    console.log('Starting bulk categorization process...', data);

    // Validate input data
    if (!data.bookmarks || !Array.isArray(data.bookmarks) || data.bookmarks.length === 0) {
      throw new Error('No bookmarks provided for bulk categorization');
    }

    if (!data.selectedIds || !Array.isArray(data.selectedIds) || data.selectedIds.length === 0) {
      throw new Error('No bookmark IDs provided for bulk categorization');
    }

    console.log(`Processing ${data.bookmarks.length} selected bookmarks...`);

    // Check if required classes are available
    if (typeof Categorizer === 'undefined') {
      throw new Error('Categorizer class not loaded. Please reload the extension.');
    }
    if (typeof BookmarkService === 'undefined') {
      throw new Error('BookmarkService class not loaded. Please reload the extension.');
    }
    if (typeof AIProcessor === 'undefined') {
      throw new Error('AIProcessor class not loaded. Please reload the extension.');
    }
    if (typeof FolderManager === 'undefined') {
      throw new Error('FolderManager class not loaded. Please reload the extension.');
    }
    console.log('✓ All required classes available');

    // Test Chrome APIs
    if (!chrome.bookmarks) {
      throw new Error('Chrome bookmarks API not available');
    }
    if (!chrome.storage) {
      throw new Error('Chrome storage API not available');
    }
    console.log('✓ Chrome APIs available');

    // Get and validate settings
    console.log('Loading settings...');
    const settings = await chrome.storage.sync.get(['bookmarkMindSettings']);
    console.log('Settings loaded:', settings);

    if (!settings.bookmarkMindSettings) {
      throw new Error('Extension settings not found. Please configure the extension first.');
    }

    if (!settings.bookmarkMindSettings.apiKey) {
      throw new Error('API key not configured. Please set up your Gemini API key in settings.');
    }
    console.log('✓ Settings validated');

    // Create categorizer instance
    console.log('Creating categorizer instance...');
    const categorizer = new Categorizer();
    console.log('✓ Categorizer instance created');

    // Initialize categorizer
    console.log('Initializing categorizer...');
    await categorizer.initialize(settings.bookmarkMindSettings);
    console.log('✓ Categorizer initialized');

    // Process selected bookmarks with progress updates
    console.log('Starting bulk categorization process...');
    const results = await categorizer.categorizeBulkBookmarks(
      data.bookmarks,
      data.selectedIds,
      (progress) => {
        console.log('Bulk progress update:', progress);
        // Send progress updates to popup
        try {
          chrome.runtime
            .sendMessage({
              action: 'categorizationProgress',
              data: progress
            })
            .catch((_error) => {
              console.log('Progress message failed (popup likely closed):', _error.message);
            });
        } catch (_error) {
          console.log('Progress callback error:', _error.message);
        }
      }
    );

    console.log('Bulk categorization completed:', results);

    // Update last sort time
    const updatedSettings = {
      ...settings.bookmarkMindSettings,
      lastSortTime: Date.now()
    };
    await chrome.storage.sync.set({
      bookmarkMindSettings: updatedSettings
    });

    sendResponse({ success: true, data: results });
  } catch (_error) {
    console.error('Bulk categorization _error:', _error);
    console.error('_error stack:', _error.stack);
    sendResponse({
      success: false,
      error: _error.message || 'Bulk categorization failed'
    });
  }
}

/**
 * Handle API key test request
 */
async function handleApiKeyTest(data, sendResponse) {
  try {
    // Check if AIProcessor class is available
    if (typeof AIProcessor === 'undefined') {
      throw new Error('AIProcessor class not loaded. Please reload the extension.');
    }

    const aiProcessor = new AIProcessor();
    aiProcessor.setApiKey(data.apiKey, data.cerebrasApiKey || null, data.groqApiKey || null);

    const isValid = await aiProcessor.testApiKey();
    sendResponse({ success: true, valid: isValid });
  } catch (_error) {
    console.error('API key test _error:', _error);
    sendResponse({
      success: false,
      error: _error.message || 'API key test failed'
    });
  }
}

/**
 * Handle stats request
 */
async function handleGetStats(sendResponse) {
  try {
    console.log('Background: Getting stats...');

    // Test direct bookmark access first
    try {
      const tree = await chrome.bookmarks.getTree();
      console.log('Background: Direct bookmark access successful, tree length:', tree.length);
    } catch (directError) {
      console.error('Background: Direct bookmark access failed:', directError);
      sendResponse({
        success: false,
        error: `Cannot access bookmarks: ${directError.message}`
      });
      return;
    }

    // Check if Categorizer class is available
    if (typeof Categorizer === 'undefined') {
      throw new Error('Categorizer class not loaded. Please reload the extension.');
    }

    const categorizer = new Categorizer();
    const stats = await categorizer.getStats();

    console.log('Background stats calculated:', stats);
    sendResponse({ success: true, data: stats });
  } catch (_error) {
    console.error('Background stats _error:', _error);
    sendResponse({
      success: false,
      error: _error.message || 'Failed to get stats'
    });
  }
}

/**
 * Handle bookmark export request
 */
async function handleExportBookmarks(sendResponse) {
  try {
    // Check if FolderManager class is available
    if (typeof FolderManager === 'undefined') {
      throw new Error('FolderManager class not loaded. Please reload the extension.');
    }

    const folderManager = new FolderManager();
    const exportData = await folderManager.exportOrganization();

    sendResponse({ success: true, data: exportData });
  } catch (_error) {
    console.error('Export _error:', _error);
    sendResponse({
      success: false,
      error: _error.message || 'Export failed'
    });
  }
}

/**
 * Handle get snapshots request
 */
async function handleGetSnapshots(sendResponse) {
  try {
    console.log('Retrieving snapshots from storage...');

    const snapshotManager = new SnapshotManager();
    const snapshots = await snapshotManager.getSnapshots();

    console.log(`Retrieved ${snapshots.length} snapshots via SnapshotManager`);

    sendResponse({
      success: true,
      data: snapshots
    });
  } catch (_error) {
    console.error('Get snapshots _error:', _error);
    sendResponse({
      success: false,
      error: _error.message || 'Failed to retrieve snapshots from storage'
    });
  }
}

/**
 * Handle get performance dashboard request
 */
async function handleGetPerformanceDashboard(sendResponse) {
  try {
    if (typeof PerformanceMonitor === 'undefined') {
      throw new Error('PerformanceMonitor class not loaded');
    }

    const perfMonitor = new PerformanceMonitor();
    await perfMonitor.initialize();

    const dashboard = await perfMonitor.getPerformanceDashboard();

    sendResponse({
      success: true,
      data: dashboard
    });
  } catch (_error) {
    console.error('Get performance dashboard _error:', _error);
    sendResponse({
      success: false,
      error: _error.message || 'Failed to get performance dashboard'
    });
  }
}

/**
 * Handle export analytics report request
 */
async function handleExportAnalyticsReport(data, sendResponse) {
  try {
    if (typeof AnalyticsService === 'undefined') {
      throw new Error('AnalyticsService class not loaded');
    }

    const analyticsService = new AnalyticsService();
    const report = await analyticsService.exportAnalyticsReport(
      data.format || 'json',
      data.startDate || null,
      data.endDate || null
    );

    sendResponse({
      success: true,
      data: report
    });
  } catch (_error) {
    console.error('Export analytics report _error:', _error);
    sendResponse({
      success: false,
      error: _error.message || 'Failed to export analytics report'
    });
  }
}

/**
 * Handle restore snapshot request
 */
async function handleRestoreSnapshot(data, sendResponse) {
  try {
    if (typeof SnapshotManager === 'undefined') {
      throw new Error('SnapshotManager class not loaded. Please reload the extension.');
    }

    if (!data.snapshotId) {
      throw new Error('Snapshot ID is required');
    }

    const snapshotManager = new SnapshotManager();

    const results = await snapshotManager.restoreSnapshot(data.snapshotId, (progress) => {
      try {
        chrome.runtime
          .sendMessage({
            action: 'restoreProgress',
            data: progress
          })
          .catch(() => {});
      } catch (_error) {
        console.log('Progress callback error:', _error.message);
      }
    });

    sendResponse({ success: true, data: results });
  } catch (_error) {
    console.error('Restore snapshot _error:', _error);
    sendResponse({
      success: false,
      error: _error.message || 'Failed to restore snapshot'
    });
  }
}

/**
 * Handle delete snapshot request
 */
async function handleDeleteSnapshot(data, sendResponse) {
  try {
    if (typeof SnapshotManager === 'undefined') {
      throw new Error('SnapshotManager class not loaded. Please reload the extension.');
    }

    if (!data.snapshotId) {
      throw new Error('Snapshot ID is required');
    }

    const snapshotManager = new SnapshotManager();
    const success = await snapshotManager.deleteSnapshot(data.snapshotId);

    sendResponse({
      success: success,
      message: 'Snapshot deleted successfully'
    });
  } catch (_error) {
    console.error('Delete snapshot _error:', _error);
    sendResponse({
      success: false,
      error: _error.message || 'Failed to delete snapshot'
    });
  }
}

/**
 * Handle analytics request
 */
async function handleGetAnalytics(sendResponse) {
  try {
    if (typeof AnalyticsService === 'undefined') {
      throw new Error('AnalyticsService class not loaded. Please reload the extension.');
    }

    const analyticsService = new AnalyticsService();
    const report = await analyticsService.getAnalyticsReport();

    sendResponse({ success: true, data: report });
  } catch (_error) {
    console.error('Analytics _error:', _error);
    sendResponse({
      success: false,
      error: _error.message || 'Failed to get analytics'
    });
  }
}

/**
 * Handle clear analytics request
 */
async function handleClearAnalytics(sendResponse) {
  try {
    if (typeof AnalyticsService === 'undefined') {
      throw new Error('AnalyticsService class not loaded. Please reload the extension.');
    }

    const analyticsService = new AnalyticsService();
    await analyticsService.clearAnalytics();

    sendResponse({ success: true });
  } catch (_error) {
    console.error('Clear analytics _error:', _error);
    sendResponse({
      success: false,
      error: _error.message || 'Failed to clear analytics'
    });
  }
}

/**
 * Handle run snapshot diagnostics request
 */
async function handleRunSnapshotDiagnostics(sendResponse) {
  try {
    if (typeof SnapshotManager === 'undefined') {
      throw new Error('SnapshotManager class not loaded. Please reload the extension.');
    }

    const snapshotManager = new SnapshotManager();
    const diagnostics = await snapshotManager.runDiagnostics();

    sendResponse({ success: true, data: diagnostics });
  } catch (_error) {
    console.error('Snapshot diagnostics _error:', _error);
    sendResponse({
      success: false,
      error: _error.message || 'Failed to run snapshot diagnostics'
    });
  }
}

/**
 * Get all bookmarks
 */
async function handleGetAllBookmarks(sendResponse) {
  try {
    const bookmarkService = new BookmarkService();
    const bookmarks = await bookmarkService.getAllBookmarks();
    sendResponse({ success: true, data: bookmarks });
  } catch (_error) {
    console.error('_error getting all bookmarks:', _error);
    sendResponse({ success: false, error: _error.message });
  }
}

/**
 * Get available categories from folder structure
 */
async function handleGetAvailableCategories(sendResponse) {
  try {
    const tree = await chrome.bookmarks.getTree();
    const categories = new Set();

    // Extract folder paths recursively
    function extractFolders(node, path = '') {
      if (!node.url && node.id !== '0') {
        const folderPath = path ? `${path} > ${node.title}` : node.title;
        if (!['Bookmarks Bar', 'Other Bookmarks', 'Mobile Bookmarks'].includes(node.title)) {
          categories.add(folderPath);
        }

        if (node.children) {
          node.children.forEach((child) => extractFolders(child, folderPath));
        }
      }
    }

    tree[0].children.forEach((root) => {
      if (root.children) {
        root.children.forEach((child) => extractFolders(child));
      }
    });

    const categoryList = Array.from(categories).sort();
    sendResponse({ success: true, data: categoryList });
  } catch (_error) {
    console.error('_error getting categories:', _error);
    sendResponse({ success: false, error: _error.message });
  }
}

/**
 * Handle bookmark recategorization (manual user correction)
 */
async function handleRecategorizeBookmark(data, sendResponse) {
  try {
    const { bookmark, newCategory, oldCategory } = data;

    if (!bookmark || !newCategory) {
      throw new Error('Invalid recategorization data');
    }

    // Move bookmark to new category
    const bookmarkService = new BookmarkService();
    const folderId = await bookmarkService.findOrCreateFolderByPath(newCategory, '1');
    await bookmarkService.moveBookmark(bookmark.id, folderId);

    // Record correction for learning (MANUAL correction, not automatic)
    const learningService = new LearningService();
    await learningService.recordCorrection(bookmark, oldCategory, newCategory, true);

    console.log(
      `✅ Manual recategorization: "${bookmark.title}" from "${oldCategory}" to "${newCategory}"`
    );

    sendResponse({ success: true });
  } catch (_error) {
    console.error('_error recategorizing bookmark:', _error);
    sendResponse({ success: false, error: _error.message });
  }
}

/**
 * Export learning data
 */
async function handleExportLearningData(sendResponse) {
  try {
    const learningService = new LearningService();
    const exportData = await learningService.exportLearningData();
    sendResponse({ success: true, data: exportData });
  } catch (_error) {
    console.error('_error exporting learning data:', _error);
    sendResponse({ success: false, error: _error.message });
  }
}

/**
 * Import learning data
 */
async function handleImportLearningData(data, sendResponse) {
  try {
    const { learningData, merge } = data;
    const learningService = new LearningService();
    const result = await learningService.importLearningData(learningData, merge);
    sendResponse({ success: true, data: result });
  } catch (_error) {
    console.error('_error importing learning data:', _error);
    sendResponse({ success: false, error: _error.message });
  }
}

/**
 * Clear learning data
 */
async function handleClearLearningData(sendResponse) {
  try {
    const learningService = new LearningService();
    await learningService.clearLearningData();
    sendResponse({ success: true });
  } catch (_error) {
    console.error('_error clearing learning data:', _error);
    sendResponse({ success: false, error: _error.message });
  }
}

/**
 * Get learning statistics
 */
async function handleGetLearningStatistics(sendResponse) {
  try {
    const learningService = new LearningService();
    const statistics = await learningService.getStatistics();
    sendResponse({ success: true, data: statistics });
  } catch (_error) {
    console.error('_error getting learning statistics:', _error);
    sendResponse({ success: false, error: _error.message });
  }
}

/**
 * Handle categorization error notifications
 */
async function handleCategorizationError(message, sendResponse) {
  try {
    console.error('🚨 CATEGORIZATION _error RECEIVED:', message);

    // Log the error details
    const errorDetails = {
      message: message.message,
      batch: message.batch,
      totalBatches: message.totalBatches,
      timestamp: new Date().toISOString()
    };

    console.error('_error details:', errorDetails);

    // Forward error to popup/options page if they're listening
    try {
      chrome.runtime.sendMessage({
        type: 'CATEGORIZATION_ERROR_NOTIFICATION',
        error: errorDetails
      });
    } catch (forwardError) {
      console.log('Could not forward error to popup (likely closed):', forwardError.message);
    }

    // Store error in storage for later retrieval
    try {
      const errorLog = (await chrome.storage.local.get(['categorizationErrors'])) || {
        categorizationErrors: []
      };
      errorLog.categorizationErrors = errorLog.categorizationErrors || [];
      errorLog.categorizationErrors.push(errorDetails);

      // Keep only last 10 errors
      if (errorLog.categorizationErrors.length > 10) {
        errorLog.categorizationErrors = errorLog.categorizationErrors.slice(-10);
      }

      await chrome.storage.local.set({
        categorizationErrors: errorLog.categorizationErrors
      });
    } catch (storageError) {
      console.error('Failed to store _error log:', storageError);
    }

    sendResponse({ success: true, message: 'Error logged' });
  } catch (_error) {
    console.error('_error handling categorization error:', _error);
    sendResponse({ success: false, error: _error.message });
  }
}

// Handle bookmark changes for learning
const bookmarkMoveListener = async (id, moveInfo) => {
  try {
    await handleBookmarkMove(id, moveInfo);
  } catch (_error) {
    console.error('_error handling bookmark move:', _error);
  }
};

chrome.bookmarks.onMoved.addListener(bookmarkMoveListener);

/**
 * Handle bookmark movement and learn from user categorizations
 */
async function handleBookmarkMove(bookmarkId, moveInfo) {
  try {
    console.log(
      `📚 Learning: Bookmark ${bookmarkId} moved from ${moveInfo.oldParentId} to ${moveInfo.parentId}`
    );
    logAIState('BOOKMARK_MOVE');

    // CRITICAL: Only learn from MANUAL user moves, never from AI categorization
    // This prevents the AI from training on its own output, which would create feedback loops

    // MULTIPLE LAYERS OF PROTECTION AGAINST AI LEARNING:

    // Layer 0: Skip learning if snapshot restoration is in progress
    if (isRestoringSnapshot) {
      console.log(
        '📚 ❌ BLOCKED (Layer 0): Snapshot restoration in progress - preventing learning'
      );
      return;
    }

    // Layer 1: Skip learning if AI categorization is in progress (global flag)
    if (isAICategorizing) {
      console.log(
        '📚 ❌ BLOCKED (Layer 1): AI categorization in progress - only learning from manual user moves'
      );
      return;
    }

    // Layer 2: Skip learning if this specific bookmark was moved by AI (bookmark-level tracking)
    if (aiCategorizedBookmarks.has(bookmarkId)) {
      console.log(
        `📚 ❌ BLOCKED (Layer 2): Bookmark ${bookmarkId} was moved by AI - only learning from manual user moves`
      );
      return;
    }

    // Layer 3: Skip learning if AI categorization happened recently (time-based protection)
    if (aiCategorizationStartTime && Date.now() - aiCategorizationStartTime < 30000) {
      console.log(
        `📚 ❌ BLOCKED (Layer 3): AI categorization happened recently (${
          Date.now() - aiCategorizationStartTime
        }ms ago) - preventing learning`
      );
      return;
    }

    // Layer 4: Skip learning if there are any AI-moved bookmarks still tracked (batch protection)
    if (aiCategorizedBookmarks.size > 0) {
      console.log(
        `📚 ❌ BLOCKED (Layer 4): ${aiCategorizedBookmarks.size} AI-moved bookmarks still tracked - preventing learning`
      );
      return;
    }

    // Layer 5: Check for AI metadata marker in Chrome storage (persistent metadata check)
    try {
      const metadata = await chrome.storage.local.get([`ai_moved_${bookmarkId}`]);
      if (metadata[`ai_moved_${bookmarkId}`]) {
        const moveAge = Date.now() - metadata[`ai_moved_${bookmarkId}`];
        if (moveAge < 60000) {
          // Within last minute
          console.log(
            `📚 ❌ BLOCKED (Layer 5): Bookmark ${bookmarkId} has AI metadata marker (${moveAge}ms old) - preventing learning`
          );
          // Clean up old metadata
          await chrome.storage.local.remove([`ai_moved_${bookmarkId}`]);
          return;
        }
        // Clean up expired metadata
        await chrome.storage.local.remove([`ai_moved_${bookmarkId}`]);
      }
    } catch (metadataError) {
      console.warn('Error checking AI metadata:', metadataError);
    }

    // Get bookmark details
    const bookmark = await chrome.bookmarks.get(bookmarkId);
    if (!bookmark || !bookmark[0] || !bookmark[0].url) {
      console.log('📚 Skipping: Not a bookmark (folder or invalid)');
      return;
    }

    const bookmarkData = bookmark[0];

    // Get old and new folder information
    const oldFolder = await getFolderPath(moveInfo.oldParentId);
    const newFolder = await getFolderPath(moveInfo.parentId);

    console.log(`📚 Move details: "${bookmarkData.title}" from "${oldFolder}" to "${newFolder}"`);

    // Layer 6: Final safety check - if we got here during AI categorization, something is wrong
    if (isAICategorizing) {
      console.error(
        '📚 🚨 CRITICAL ERROR (Layer 6): Learning function called during AI categorization despite safeguards!'
      );
      return;
    }

    // Skip learning if moved to Bookmark Bar (user preparing for AI reorganization)
    if (moveInfo.parentId === '1') {
      console.log('📚 Skipping: Moved to Bookmark Bar (likely for AI reorganization)');
      return;
    }

    // Skip learning if moved from Bookmark Bar (AI categorization result)
    if (moveInfo.oldParentId === '1') {
      console.log('📚 Skipping: Moved from Bookmark Bar (likely AI categorization result)');
      return;
    }

    // Skip if both folders are root folders (not meaningful categorization)
    if (
      ['1', '2', '3'].includes(moveInfo.oldParentId) &&
      ['1', '2', '3'].includes(moveInfo.parentId)
    ) {
      console.log('📚 Skipping: Move between root folders');
      return;
    }

    // Skip if new folder is a root folder (except Bookmark Bar which we already handled)
    if (['2', '3'].includes(moveInfo.parentId)) {
      console.log('📚 Skipping: Moved to root folder (Other Bookmarks/Mobile)');
      return;
    }

    // Record manual correction using LearningService
    const learningService = new LearningService();
    await learningService.recordCorrection(
      bookmarkData,
      oldFolder,
      newFolder,
      true // isManual = true for user-initiated moves
    );

    console.log(
      `📚 ✅ MANUAL LEARNING SUCCESS: Learned from USER move: "${bookmarkData.title}" from "${oldFolder}" to "${newFolder}"`
    );

    // Send notification to options page about learning
    try {
      chrome.runtime.sendMessage({
        type: 'LEARNING_DATA_UPDATED',
        count: 1,
        category: newFolder,
        source: 'MANUAL_USER_MOVE'
      });
    } catch (_error) {
      console.warn('Failed to notify about learning update:', error);
    }
  } catch (_error) {
    console.error('_error in handleBookmarkMove:', _error);
  }
}

/**
 * Get the full folder path for a folder ID
 */
async function getFolderPath(folderId) {
  try {
    if (folderId === '0') return 'Root';
    if (folderId === '1') return 'Bookmarks Bar';
    if (folderId === '2') return 'Other Bookmarks';
    if (folderId === '3') return 'Mobile Bookmarks';

    const folder = await chrome.bookmarks.get(folderId);
    if (!folder || !folder[0]) return 'Unknown';

    const folderData = folder[0];

    // Build path by traversing up the hierarchy
    const pathParts = [folderData.title];
    let currentParentId = folderData.parentId;

    while (currentParentId && !['0', '1', '2', '3'].includes(currentParentId)) {
      const parent = await chrome.bookmarks.get(currentParentId);
      if (parent?.[0]) {
        pathParts.unshift(parent[0].title);
        currentParentId = parent[0].parentId;
      } else {
        break;
      }
    }

    return pathParts.join(' > ');
  } catch (_error) {
    console.error('_error getting folder path:', _error);
    return 'Unknown';
  }
}

/**
 * Handle model comparison dashboard request
 */
async function handleGetModelComparison(sendResponse) {
  try {
    const modelComparisonService = new ModelComparisonService();
    const dashboard = await modelComparisonService.getComparisonDashboard();
    sendResponse({ success: true, data: dashboard });
  } catch (_error) {
    console.error('_error getting model comparison:', _error);
    sendResponse({ success: false, error: _error.message });
  }
}

/**
 * Handle A/B test initiation
 */
async function handleStartABTest(data, sendResponse) {
  try {
    const { modelA, modelB, bookmarks } = data;

    if (!bookmarks || bookmarks.length === 0) {
      throw new Error('No bookmarks provided for A/B testing');
    }

    // Get settings
    const result = await chrome.storage.sync.get(['bookmarkMindSettings']);
    const settings = result.bookmarkMindSettings || {};

    if (!settings.apiKey) {
      throw new Error('API key not configured');
    }

    // Initialize AI processor
    const aiProcessor = new AIProcessor();
    aiProcessor.setApiKey(settings.apiKey, settings.cerebrasApiKey, settings.groqApiKey);

    // Process with both models
    const startTimeA = Date.now();
    const resultsA = await processWithSpecificModel(modelA, bookmarks, aiProcessor, settings);
    resultsA.time = Date.now() - startTimeA;

    const startTimeB = Date.now();
    const resultsB = await processWithSpecificModel(modelB, bookmarks, aiProcessor, settings);
    resultsB.time = Date.now() - startTimeB;

    // Record comparison with full metrics
    const modelComparisonService = new ModelComparisonService();

    // Calculate costs
    const costA = modelComparisonService._calculateCost({
      model: modelA,
      inputTokens: resultsA.metrics?.inputTokens || 0,
      outputTokens: resultsA.metrics?.outputTokens || 0
    });

    const costB = modelComparisonService._calculateCost({
      model: modelB,
      inputTokens: resultsB.metrics?.inputTokens || 0,
      outputTokens: resultsB.metrics?.outputTokens || 0
    });

    await modelComparisonService.recordABTest({
      modelA,
      modelB,
      bookmarkSample: bookmarks.length,
      resultsA,
      resultsB,
      speedA: resultsA.time,
      speedB: resultsB.time,
      accuracyA: resultsA.success ? resultsA.metrics?.successRate : 0,
      accuracyB: resultsB.success ? resultsB.metrics?.successRate : 0,
      costA,
      costB
    });

    // Record performance metrics for both models
    if (resultsA.metrics) {
      resultsA.metrics.responseTime = resultsA.time;
      await modelComparisonService.recordModelPerformance(resultsA.metrics);
      await modelComparisonService.trackCost(resultsA.metrics);
    }

    if (resultsB.metrics) {
      resultsB.metrics.responseTime = resultsB.time;
      await modelComparisonService.recordModelPerformance(resultsB.metrics);
      await modelComparisonService.trackCost(resultsB.metrics);
    }

    sendResponse({
      success: true,
      data: {
        modelA,
        modelB,
        resultsA,
        resultsB
      }
    });
  } catch (_error) {
    console.error('_error in A/B test:', _error);
    sendResponse({ success: false, error: _error.message });
  }
}

/**
 * Process bookmarks with a specific model
 * @param {string} modelName - Model name to use
 * @param {Array} bookmarks - Bookmarks to process
 * @param {AIProcessor} aiProcessor - AI processor instance
 * @param {Object} settings - Settings object
 * @returns {Promise<Object>} Results with categories, success, and metrics
 */
async function processWithSpecificModel(modelName, bookmarks, aiProcessor, settings) {
  try {
    // Determine provider and process accordingly
    let provider = 'gemini';
    if (
      modelName.includes('llama') ||
      modelName.includes('qwen') ||
      modelName.includes('gpt-oss')
    ) {
      if (
        settings.cerebrasApiKey &&
        !modelName.includes('versatile') &&
        !modelName.includes('instant')
      ) {
        provider = 'cerebras';
      } else if (settings.groqApiKey) {
        provider = 'groq';
      }
    }

    // Build the prompt for categorization
    const prompt = await aiProcessor._buildPrompt(bookmarks, [], {});

    let result;
    let inputTokens = 0;
    let outputTokens = 0;

    if (provider === 'gemini') {
      result = await aiProcessor._processWithGemini(bookmarks, [], {}, modelName);
    } else if (provider === 'cerebras') {
      result = await aiProcessor._processWithCerebras(prompt, bookmarks, modelName);
    } else if (provider === 'groq') {
      result = await aiProcessor._processWithGroq(prompt, bookmarks, modelName);
    }

    // Extract categories from results
    const categories = [...new Set(result.map((r) => r.category).filter(Boolean))];

    // Estimate token counts (rough approximation)
    const promptText = JSON.stringify(bookmarks);
    inputTokens = Math.ceil(promptText.length / 4);
    outputTokens = Math.ceil(JSON.stringify(result).length / 4);

    return {
      categories,
      results: result,
      success: true,
      metrics: {
        model: modelName,
        provider,
        successRate: result.length / bookmarks.length,
        responseTime: 0, // Will be set by caller
        inputTokens,
        outputTokens,
        categoriesGenerated: categories.length,
        bookmarkType: 'general'
      }
    };
  } catch (_error) {
    console.error(`_error processing with ${modelName}:`, _error);
    return {
      categories: [],
      results: [],
      success: false,
      error: _error.message,
      metrics: {
        model: modelName,
        provider: 'unknown',
        successRate: 0,
        responseTime: 0,
        inputTokens: 0,
        outputTokens: 0,
        categoriesGenerated: 0,
        errorType: _error.message
      }
    };
  }
}

/**
 * Handle recording model performance
 */
async function handleRecordModelPerformance(data, sendResponse) {
  try {
    const modelComparisonService = new ModelComparisonService();
    await modelComparisonService.recordModelPerformance(data.metrics);
    await modelComparisonService.trackCost(data.metrics);
    sendResponse({ success: true });
  } catch (_error) {
    console.error('_error recording model performance:', _error);
    sendResponse({ success: false, error: _error.message });
  }
}

/**
 * Handle cost report request
 */
async function handleGetCostReport(data, sendResponse) {
  try {
    const modelComparisonService = new ModelComparisonService();
    const report = await modelComparisonService.getCostReport(data.period || 'all');
    sendResponse({ success: true, data: report });
  } catch (_error) {
    console.error('_error getting cost report:', _error);
    sendResponse({ success: false, error: _error.message });
  }
}

/**
 * Handle setting budget alert
 */
async function handleSetBudgetAlert(data, sendResponse) {
  try {
    const modelComparisonService = new ModelComparisonService();
    await modelComparisonService.setBudgetAlert(data.budget);
    sendResponse({ success: true });
  } catch (_error) {
    console.error('_error setting budget alert:', _error);
    sendResponse({ success: false, error: _error.message });
  }
}

/**
 * Handle model recommendation request
 */
async function handleGetModelRecommendation(data, sendResponse) {
  try {
    const modelComparisonService = new ModelComparisonService();
    const recommendation = await modelComparisonService.getRecommendedModel(
      data.bookmarkType,
      data.userHistory
    );
    sendResponse({ success: true, data: recommendation });
  } catch (_error) {
    console.error('_error getting model recommendation:', _error);
    sendResponse({ success: false, error: _error.message });
  }
}

/**
 * Handle setting custom model configuration
 */
async function handleSetCustomModelConfig(data, sendResponse) {
  try {
    await chrome.storage.sync.set({ customModelConfig: data.config });
    sendResponse({ success: true });
  } catch (_error) {
    console.error('_error setting custom model config:', _error);
    sendResponse({ success: false, error: _error.message });
  }
}

/**
 * Handle getting custom model configuration
 */
async function handleGetCustomModelConfig(sendResponse) {
  try {
    const result = await chrome.storage.sync.get(['customModelConfig']);
    sendResponse({ success: true, data: result.customModelConfig || null });
  } catch (_error) {
    console.error('_error getting custom model config:', _error);
    sendResponse({ success: false, error: _error.message });
  }
}

// Cleanup on extension shutdown
chrome.runtime.onSuspend.addListener(() => {
  console.log('BookmarkMind extension suspending');
});

console.log('BookmarkMind background script loaded');

/**
 * Handle move all to bookmark bar request
 */
async function handleMoveAllToBookmarkBar(sendResponse) {
  try {
    // Check if BookmarkService class is available
    if (typeof BookmarkService === 'undefined') {
      throw new Error('BookmarkService class not loaded. Please reload the extension.');
    }

    const bookmarkService = new BookmarkService();

    // Execute move operation
    const result = await bookmarkService.moveAllToBookmarkBar((progress) => {
      // Send progress updates to popup
      try {
        chrome.runtime
          .sendMessage({
            action: 'categorizationProgress', // Reusing existing progress listener in popup
            data: progress
          })
          .catch(() => {});
      } catch (_error) {
        console.log('Progress callback error:', _error.message);
      }
    });

    sendResponse({ success: true, ...result });
  } catch (_error) {
    console.error('Move all to bookmark bar _error:', _error);
    sendResponse({
      success: false,
      error: _error.message || 'Move operation failed'
    });
  }
}

/**
 * Handle clear quota state request (for manual retry)
 */
async function handleClearQuotaState(sendResponse) {
  try {
    if (typeof AIProcessor === 'undefined') {
      throw new Error('AIProcessor class not loaded. Please reload the extension.');
    }

    const aiProcessor = new AIProcessor();
    await aiProcessor._clearQuotaExhaustedState();

    sendResponse({
      success: true,
      message: 'Quota state cleared. You can now retry categorization.'
    });
  } catch (_error) {
    console.error('Error clearing quota state:', _error);
    sendResponse({
      success: false,
      error: _error.message || 'Failed to clear quota state'
    });
  }
}

/**
 * BookmarkMind - Options Page Script
 * Handles settings page functionality and user preferences
 */

class OptionsController {
  constructor() {
    this.settings = {};
    this.stats = {};
    this.isApiKeyVisible = false;
    this.isCerebrasApiKeyVisible = false;
    this.isGroqApiKeyVisible = false;

    this.initializeElements();
    this.attachEventListeners();
    this.loadSettings();
    this.loadStats();
    this.loadLearningData();
    this.loadPerformanceData();

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'LEARNING_DATA_UPDATED') {
        console.log('📚 Learning data updated, refreshing display...');
        this.loadLearningData();
        this.showToast(`Learned ${message.count} new patterns from bookmark move`, 'success');
      }
    });
  }

  /**
   * Initialize DOM element references
   */
  initializeElements() {
    // Model comparison elements
    this.viewModelComparison = document.getElementById('viewModelComparison');

    // Gemini API Key elements
    this.apiKeyInput = document.getElementById('apiKey');
    this.toggleApiKeyBtn = document.getElementById('toggleApiKey');
    this.clearApiKeyBtn = document.getElementById('clearApiKey');
    this.testGeminiKeyBtn = document.getElementById('testGeminiKey');
    this.saveGeminiKeyBtn = document.getElementById('saveGeminiKey');
    this.apiKeyStatus = document.getElementById('apiKeyStatus');

    // Cerebras API Key elements
    this.cerebrasApiKeyInput = document.getElementById('cerebrasApiKey');
    this.toggleCerebrasApiKeyBtn = document.getElementById('toggleCerebrasApiKey');
    this.clearCerebrasApiKeyBtn = document.getElementById('clearCerebrasApiKey');
    this.testCerebrasKeyBtn = document.getElementById('testCerebrasKey');
    this.saveCerebrasKeyBtn = document.getElementById('saveCerebrasKey');
    this.cerebrasApiKeyStatus = document.getElementById('cerebrasApiKeyStatus');

    // Groq API Key elements
    this.groqApiKeyInput = document.getElementById('groqApiKey');
    this.toggleGroqApiKeyBtn = document.getElementById('toggleGroqApiKey');
    this.clearGroqApiKeyBtn = document.getElementById('clearGroqApiKey');
    this.testGroqKeyBtn = document.getElementById('testGroqKey');
    this.saveGroqKeyBtn = document.getElementById('saveGroqKey');
    this.groqApiKeyStatus = document.getElementById('groqApiKeyStatus');

    // Categories elements
    this.categoriesList = document.getElementById('categoriesList');
    this.newCategoryInput = document.getElementById('newCategoryInput');
    this.addCategoryBtn = document.getElementById('addCategoryBtn');

    // Settings elements
    this.batchSizeSelect = document.getElementById('batchSize');
    this.cleanupEmptyFoldersCheckbox = document.getElementById('cleanupEmptyFolders');
    this.maxCategoryDepthSlider = document.getElementById('maxCategoryDepth');
    this.maxDepthValueDisplay = document.getElementById('maxDepthValue');
    this.minBookmarksThresholdSlider = document.getElementById('minBookmarksThreshold');
    this.minThresholdValueDisplay = document.getElementById('minThresholdValue');

    // Advanced settings elements
    this.preserveExistingFoldersCheckbox = document.getElementById('preserveExistingFolders');
    this.mergeSimilarFoldersCheckbox = document.getElementById('mergeSimilarFolders');
    this.aiConfidenceThresholdSlider = document.getElementById('aiConfidenceThreshold');
    this.confidenceValueDisplay = document.getElementById('confidenceValue');
    this.aiProviderSelect = document.getElementById('aiProvider');
    this.enableFallbackProvidersCheckbox = document.getElementById('enableFallbackProviders');
    this.enableLearningCheckbox = document.getElementById('enableLearning');
    this.learningWeightSlider = document.getElementById('learningWeight');
    this.learningWeightValueDisplay = document.getElementById('learningWeightValue');
    this.retryAttemptsSelect = document.getElementById('retryAttempts');
    this.requestTimeoutSelect = document.getElementById('requestTimeout');
    this.enableCachingCheckbox = document.getElementById('enableCaching');
    this.cacheExpirationSelect = document.getElementById('cacheExpiration');
    this.autoSnapshotCheckbox = document.getElementById('autoSnapshot');
    this.maxSnapshotsSelect = document.getElementById('maxSnapshots');
    this.showProgressNotificationsCheckbox = document.getElementById('showProgressNotifications');
    this.showDetailedLogsCheckbox = document.getElementById('showDetailedLogs');
    this.themeSelect = document.getElementById('theme');
    this.minCategoriesSlider = document.getElementById('minCategories');
    this.minCategoriesValueDisplay = document.getElementById('minCategoriesValue');
    this.maxCategoriesSlider = document.getElementById('maxCategories');
    this.maxCategoriesValueDisplay = document.getElementById('maxCategoriesValue');
    this.hierarchicalModeCheckbox = document.getElementById('hierarchicalMode');
    this.saveAdvancedSettingsBtn = document.getElementById('saveAdvancedSettings');
    this.resetAdvancedSettingsBtn = document.getElementById('resetAdvancedSettings');

    // Stats elements
    this.totalBookmarksCount = document.getElementById('totalBookmarksCount');
    this.organizedBookmarksCount = document.getElementById('organizedBookmarksCount');
    this.categoriesCount = document.getElementById('categoriesCount');
    this.learningPatternsCount = document.getElementById('learningPatternsCount');
    this.lastSortDate = document.getElementById('lastSortDate');

    // Data management elements
    this.consolidateFoldersBtn = document.getElementById('consolidateFolders');
    this.exportDataBtn = document.getElementById('exportData');
    this.clearLearningDataBtn = document.getElementById('clearLearningData');
    this.resetSettingsBtn = document.getElementById('resetSettings');

    // Learning data elements
    this.totalLearningPatterns = document.getElementById('totalLearningPatterns');
    this.lastLearningUpdate = document.getElementById('lastLearningUpdate');
    this.learningPatternsList = document.getElementById('learningPatternsList');
    this.noPatternsMessage = document.getElementById('noPatternsMessage');
    this.refreshLearningDataBtn = document.getElementById('refreshLearningData');
    this.exportLearningDataBtn = document.getElementById('exportLearningData');
    this.importLearningDataBtn = document.getElementById('importLearningData');

    // Performance monitoring elements
    this.avgCategorizationTime = document.getElementById('avgCategorizationTime');
    this.performanceSuccessRate = document.getElementById('performanceSuccessRate');
    this.totalApiCalls = document.getElementById('totalApiCalls');
    this.memoryUsage = document.getElementById('memoryUsage');
    this.providerComparisonChart = document.getElementById('providerComparisonChart');
    this.avgBatchSize = document.getElementById('avgBatchSize');
    this.avgBatchTime = document.getElementById('avgBatchTime');
    this.avgTimePerItem = document.getElementById('avgTimePerItem');
    this.efficiencyScore = document.getElementById('efficiencyScore');
    this.performanceHistoryChart = document.getElementById('performanceHistoryChart');
    this.performanceCanvas = document.getElementById('performanceCanvas');
    this.insightsContainer = document.getElementById('insightsContainer');
    this.exportStartDate = document.getElementById('exportStartDate');
    this.exportEndDate = document.getElementById('exportEndDate');
    this.setLast30Days = document.getElementById('setLast30Days');
    this.setAllTime = document.getElementById('setAllTime');
    this.exportReportJSON = document.getElementById('exportReportJSON');
    this.exportReportCSV = document.getElementById('exportReportCSV');
    this.refreshPerformanceData = document.getElementById('refreshPerformanceData');

    // Toast notification
    this.toast = document.getElementById('toast');

    // Performance monitoring chart
    this.performanceChart = null;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Model comparison events
    if (this.viewModelComparison) {
      this.viewModelComparison.addEventListener('click', () => {
        window.location.href = 'model-comparison.html';
      });
    }

    // Gemini API Key events
    this.apiKeyInput.addEventListener('input', () => this.onApiKeyChange());
    this.toggleApiKeyBtn.addEventListener('click', () => this.toggleApiKeyVisibility());
    this.clearApiKeyBtn.addEventListener('click', () => this.clearApiKey());
    this.testGeminiKeyBtn.addEventListener('click', () => this.testGeminiKey());
    this.saveGeminiKeyBtn.addEventListener('click', () => this.saveGeminiKey());

    // Cerebras API Key events
    this.cerebrasApiKeyInput.addEventListener('input', () => this.onCerebrasApiKeyChange());
    this.toggleCerebrasApiKeyBtn.addEventListener('click', () =>
      this.toggleCerebrasApiKeyVisibility()
    );
    this.clearCerebrasApiKeyBtn.addEventListener('click', () => this.clearCerebrasApiKey());
    this.testCerebrasKeyBtn.addEventListener('click', () => this.testCerebrasKey());
    this.saveCerebrasKeyBtn.addEventListener('click', () => this.saveCerebrasKey());

    // Groq API Key events
    this.groqApiKeyInput.addEventListener('input', () => this.onGroqApiKeyChange());
    this.toggleGroqApiKeyBtn.addEventListener('click', () => this.toggleGroqApiKeyVisibility());
    this.clearGroqApiKeyBtn.addEventListener('click', () => this.clearGroqApiKey());
    this.testGroqKeyBtn.addEventListener('click', () => this.testGroqKey());
    this.saveGroqKeyBtn.addEventListener('click', () => this.saveGroqKey());

    // Categories events
    this.newCategoryInput.addEventListener('input', () => this.onNewCategoryChange());
    this.newCategoryInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.addCategory();
    });
    this.addCategoryBtn.addEventListener('click', () => this.addCategory());

    // Settings events
    this.batchSizeSelect.addEventListener('change', () => this.saveSettings());
    this.cleanupEmptyFoldersCheckbox.addEventListener('change', () => this.saveSettings());
    this.maxCategoryDepthSlider.addEventListener('input', () => this.onMaxDepthChange());
    this.maxCategoryDepthSlider.addEventListener('change', () => this.saveSettings());
    this.minBookmarksThresholdSlider.addEventListener('input', () => this.onMinThresholdChange());
    this.minBookmarksThresholdSlider.addEventListener('change', () => this.saveSettings());

    // Advanced settings events
    if (this.aiConfidenceThresholdSlider) {
      this.aiConfidenceThresholdSlider.addEventListener('input', () =>
        this.onConfidenceThresholdChange()
      );
      this.aiConfidenceThresholdSlider.addEventListener('change', () => this.saveSettings());
    }
    if (this.learningWeightSlider) {
      this.learningWeightSlider.addEventListener('input', () => this.onLearningWeightChange());
      this.learningWeightSlider.addEventListener('change', () => this.saveSettings());
    }
    if (this.minCategoriesSlider) {
      this.minCategoriesSlider.addEventListener('input', () => this.onMinCategoriesChange());
      this.minCategoriesSlider.addEventListener('change', () => this.saveSettings());
    }
    if (this.maxCategoriesSlider) {
      this.maxCategoriesSlider.addEventListener('input', () => this.onMaxCategoriesChange());
      this.maxCategoriesSlider.addEventListener('change', () => this.saveSettings());
    }
    if (this.saveAdvancedSettingsBtn) {
      this.saveAdvancedSettingsBtn.addEventListener('click', () => this.saveSettings());
    }
    if (this.resetAdvancedSettingsBtn) {
      this.resetAdvancedSettingsBtn.addEventListener('click', () => this.resetAdvancedSettings());
    }

    // Data management events
    this.consolidateFoldersBtn.addEventListener('click', () => this.consolidateFolders());
    this.exportDataBtn.addEventListener('click', () => this.exportAllData());
    this.clearLearningDataBtn.addEventListener('click', () => this.clearLearningData());
    this.resetSettingsBtn.addEventListener('click', () => this.resetSettings());

    // Learning data events
    this.refreshLearningDataBtn.addEventListener('click', () => this.loadLearningData());
    if (this.exportLearningDataBtn) {
      this.exportLearningDataBtn.addEventListener('click', () => this.exportLearningData());
    }
    if (this.importLearningDataBtn) {
      this.importLearningDataBtn.addEventListener('click', () => this.importLearningData());
    }

    // Performance monitoring events
    if (this.refreshPerformanceData) {
      this.refreshPerformanceData.addEventListener('click', () => this.loadPerformanceData());
    }
    if (this.setLast30Days) {
      this.setLast30Days.addEventListener('click', () => this.setDateRangeLast30Days());
    }
    if (this.setAllTime) {
      this.setAllTime.addEventListener('click', () => this.setDateRangeAllTime());
    }
    if (this.exportReportJSON) {
      this.exportReportJSON.addEventListener('click', () => this.exportReport('json'));
    }
    if (this.exportReportCSV) {
      this.exportReportCSV.addEventListener('click', () => this.exportReport('csv'));
    }
  }

  /**
   * Load user settings from storage
   */
  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['bookmarkMindSettings']);
      this.settings = result.bookmarkMindSettings || this.getDefaultSettings();
      this.updateSettingsUI();
    } catch (_error) {
      console.error('_error loading settings:', _error);
      this.showToast('Failed to load settings', 'error');
    }
  }

  /**
   * Load statistics
   */
  async loadStats() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getStats'
      });
      if (response.success) {
        this.stats = response.data;
        this.updateStatsUI();
      }
    } catch (_error) {
      console.error('_error loading stats:', _error);
    }
  }

  /**
   * Get default settings
   */
  getDefaultSettings() {
    return {
      apiKey: '',
      cerebrasApiKey: '',
      groqApiKey: '',
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
      cleanupEmptyFolders: false,
      maxCategoryDepth: 2,
      minBookmarksThreshold: 3,
      // Advanced settings
      preserveExistingFolders: true,
      mergeSimilarFolders: false,
      aiConfidenceThreshold: 70,
      aiProvider: 'auto',
      enableFallbackProviders: true,
      enableLearning: true,
      learningWeight: 50,
      retryAttempts: 2,
      requestTimeout: 30000,
      enableCaching: true,
      cacheExpiration: 2592000000, // 30 days
      autoSnapshot: true,
      maxSnapshots: 5,
      showProgressNotifications: true,
      showDetailedLogs: false,
      theme: 'auto',
      minCategories: 15,
      maxCategories: 50,
      hierarchicalMode: true
    };
  }

  /**
   * Update settings UI with current values
   */
  updateSettingsUI() {
    // Gemini API Key (show masked or empty)
    if (this.settings.apiKey) {
      this.apiKeyInput.value = '••••••••••••••••••••••••••••••••••••••••';
      this.apiKeyInput.dataset.hasKey = 'true';
      this.apiKeyInput.type = 'password';
    } else {
      this.apiKeyInput.value = '';
      this.apiKeyInput.dataset.hasKey = 'false';
      this.apiKeyInput.type = 'password';
    }

    // Cerebras API Key (show masked or empty)
    if (this.settings.cerebrasApiKey) {
      this.cerebrasApiKeyInput.value = '••••••••••••••••••••••••••••••••••••••••';
      this.cerebrasApiKeyInput.dataset.hasKey = 'true';
      this.cerebrasApiKeyInput.type = 'password';
    } else {
      this.cerebrasApiKeyInput.value = '';
      this.cerebrasApiKeyInput.dataset.hasKey = 'false';
      this.cerebrasApiKeyInput.type = 'password';
    }

    // Groq API Key (show masked or empty)
    if (this.settings.groqApiKey) {
      this.groqApiKeyInput.value = '••••••••••••••••••••••••••••••••••••••••';
      this.groqApiKeyInput.dataset.hasKey = 'true';
      this.groqApiKeyInput.type = 'password';
    } else {
      this.groqApiKeyInput.value = '';
      this.groqApiKeyInput.dataset.hasKey = 'false';
      this.groqApiKeyInput.type = 'password';
    }

    // Categories
    this.renderCategories();

    // Basic settings
    this.batchSizeSelect.value = this.settings.batchSize || 50;
    this.cleanupEmptyFoldersCheckbox.checked = this.settings.cleanupEmptyFolders !== false;
    this.maxCategoryDepthSlider.value = this.settings.maxCategoryDepth || 2;
    this.maxDepthValueDisplay.textContent = this.settings.maxCategoryDepth || 2;
    this.minBookmarksThresholdSlider.value = this.settings.minBookmarksThreshold || 3;
    this.minThresholdValueDisplay.textContent = this.settings.minBookmarksThreshold || 3;

    // Advanced settings - Folder Management
    if (this.preserveExistingFoldersCheckbox) {
      this.preserveExistingFoldersCheckbox.checked =
        this.settings.preserveExistingFolders !== false;
    }
    if (this.mergeSimilarFoldersCheckbox) {
      this.mergeSimilarFoldersCheckbox.checked = this.settings.mergeSimilarFolders === true;
    }

    // Advanced settings - AI Behavior
    if (this.aiConfidenceThresholdSlider) {
      this.aiConfidenceThresholdSlider.value = this.settings.aiConfidenceThreshold || 70;
      this.confidenceValueDisplay.textContent = this.settings.aiConfidenceThreshold || 70;
    }
    if (this.aiProviderSelect) {
      this.aiProviderSelect.value = this.settings.aiProvider || 'auto';
    }
    if (this.enableFallbackProvidersCheckbox) {
      this.enableFallbackProvidersCheckbox.checked =
        this.settings.enableFallbackProviders !== false;
    }

    // Advanced settings - Learning & Adaptation
    if (this.enableLearningCheckbox) {
      this.enableLearningCheckbox.checked = this.settings.enableLearning !== false;
    }
    if (this.learningWeightSlider) {
      this.learningWeightSlider.value = this.settings.learningWeight || 50;
      this.learningWeightValueDisplay.textContent = this.settings.learningWeight || 50;
    }

    // Advanced settings - Performance & Optimization
    if (this.retryAttemptsSelect) {
      this.retryAttemptsSelect.value = this.settings.retryAttempts || 2;
    }
    if (this.requestTimeoutSelect) {
      this.requestTimeoutSelect.value = this.settings.requestTimeout || 30000;
    }
    if (this.enableCachingCheckbox) {
      this.enableCachingCheckbox.checked = this.settings.enableCaching !== false;
    }
    if (this.cacheExpirationSelect) {
      this.cacheExpirationSelect.value = this.settings.cacheExpiration || 2592000000;
    }

    // Advanced settings - Snapshot & Backup
    if (this.autoSnapshotCheckbox) {
      this.autoSnapshotCheckbox.checked = this.settings.autoSnapshot !== false;
    }
    if (this.maxSnapshotsSelect) {
      this.maxSnapshotsSelect.value = this.settings.maxSnapshots || 5;
    }

    // Advanced settings - UI & Notifications
    if (this.showProgressNotificationsCheckbox) {
      this.showProgressNotificationsCheckbox.checked =
        this.settings.showProgressNotifications !== false;
    }
    if (this.showDetailedLogsCheckbox) {
      this.showDetailedLogsCheckbox.checked = this.settings.showDetailedLogs === true;
    }
    if (this.themeSelect) {
      this.themeSelect.value = this.settings.theme || 'auto';
    }

    // Advanced settings - Category Generation
    if (this.minCategoriesSlider) {
      this.minCategoriesSlider.value = this.settings.minCategories || 15;
      this.minCategoriesValueDisplay.textContent = this.settings.minCategories || 15;
    }
    if (this.maxCategoriesSlider) {
      this.maxCategoriesSlider.value = this.settings.maxCategories || 50;
      this.maxCategoriesValueDisplay.textContent = this.settings.maxCategories || 50;
    }
    if (this.hierarchicalModeCheckbox) {
      this.hierarchicalModeCheckbox.checked = this.settings.hierarchicalMode !== false;
    }

    setTimeout(() => {
      this.updateGeminiButtonStates();
      this.updateCerebrasButtonStates();
      this.updateGroqButtonStates();
    }, 100);
  }

  /**
   * Update statistics UI
   */
  updateStatsUI() {
    this.totalBookmarksCount.textContent = this.stats.totalBookmarks || 0;
    this.organizedBookmarksCount.textContent =
      (this.stats.totalBookmarks || 0) - (this.stats.uncategorized || 0);
    this.categoriesCount.textContent = this.stats.categories || 0;
    this.learningPatternsCount.textContent = this.stats.learningPatterns || 0;

    if (this.stats.lastSortTime) {
      const date = new Date(this.stats.lastSortTime);
      this.lastSortDate.textContent = date.toLocaleString();
    } else {
      this.lastSortDate.textContent = 'Never';
    }
  }

  /**
   * Load and display learning data
   */
  async loadLearningData() {
    try {
      console.log('📚 Loading learning data from LearningService...');

      // Get learning statistics
      const response = await chrome.runtime.sendMessage({
        action: 'getLearningStatistics'
      });

      if (response?.success) {
        const stats = response.data;
        console.log('📚 Loaded learning statistics:', stats);
        this.displayLearningStatistics(stats);
      } else {
        throw new Error('Failed to load learning statistics');
      }
    } catch (_error) {
      console.error('_error loading learning data:', _error);
      this.showToast('Failed to load learning data', 'error');
    }
  }

  /**
   * Display learning statistics in the UI
   */
  displayLearningStatistics(stats) {
    // Update summary
    this.totalLearningPatterns.textContent = stats.totalPatterns || 0;

    // Update last modified timestamp
    if (stats.lastUpdated) {
      const date = new Date(stats.lastUpdated);
      this.lastLearningUpdate.textContent = date.toLocaleString();
    } else {
      this.lastLearningUpdate.textContent = 'Never';
    }

    // Update learning patterns count in stats section
    this.learningPatternsCount.textContent = stats.totalPatterns || 0;

    // Clear existing patterns
    this.learningPatternsList.innerHTML = '';

    if (stats.totalPatterns === 0) {
      // Show no patterns message
      const noPatterns = document.createElement('div');
      noPatterns.className = 'no-patterns';
      noPatterns.innerHTML = `
        <p>No learning patterns collected yet. The extension will learn from your manual bookmark corrections and categorizations.</p>
        <p><strong>How it works:</strong> When you manually recategorize bookmarks using the "Recategorize Bookmarks" feature in the popup, the extension learns these patterns and applies them to future categorizations.</p>
        <p><strong>Note:</strong> The system does NOT learn from automatic AI categorization to prevent feedback loops.</p>
      `;
      this.learningPatternsList.appendChild(noPatterns);
    } else {
      // Show pattern statistics by type
      const statsContainer = document.createElement('div');
      statsContainer.className = 'pattern-stats';
      statsContainer.innerHTML = `
        <h4>Pattern Statistics</h4>
        <div class="stat-row">
          <span class="stat-label">Total Patterns:</span>
          <span class="stat-value">${stats.totalPatterns}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Total Corrections:</span>
          <span class="stat-value">${stats.totalCorrections || 0}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Domain Patterns:</span>
          <span class="stat-value">${stats.patternsByType?.domain || 0}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Keyword Patterns:</span>
          <span class="stat-value">${stats.patternsByType?.keyword || 0}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">URL Patterns:</span>
          <span class="stat-value">${stats.patternsByType?.url_pattern || 0}</span>
        </div>
      `;

      if (stats.mostCorrectedCategory) {
        statsContainer.innerHTML += `
          <div class="stat-row">
            <span class="stat-label">Most Corrected Category:</span>
            <span class="stat-value">${stats.mostCorrectedCategory}</span>
          </div>
        `;
      }

      this.learningPatternsList.appendChild(statsContainer);

      // Show category distribution
      if (stats.categoryDistribution && Object.keys(stats.categoryDistribution).length > 0) {
        const distContainer = document.createElement('div');
        distContainer.className = 'category-distribution';
        distContainer.innerHTML = '<h4>Category Distribution</h4>';

        const sortedCategories = Object.entries(stats.categoryDistribution)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);

        sortedCategories.forEach(([category, count]) => {
          const catRow = document.createElement('div');
          catRow.className = 'category-row';
          catRow.innerHTML = `
            <span class="category-name">${category}</span>
            <span class="category-count">${count} corrections</span>
          `;
          distContainer.appendChild(catRow);
        });

        this.learningPatternsList.appendChild(distContainer);
      }
    }
  }

  /**
   * Export learning data
   */
  async exportLearningData() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'exportLearningData'
      });

      if (response?.success) {
        const dataStr = JSON.stringify(response.data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bookmarkmind-learning-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast('Learning data exported successfully', 'success');
      } else {
        throw new Error('Failed to export learning data');
      }
    } catch (_error) {
      console.error('_error exporting learning data:', _error);
      this.showToast('Failed to export learning data', 'error');
    }
  }

  /**
   * Import learning data
   */
  async importLearningData() {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';

      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const importedData = JSON.parse(event.target.result);

            const merge = confirm(
              'Merge with existing learning data? Click OK to merge, Cancel to replace.'
            );

            const response = await chrome.runtime.sendMessage({
              action: 'importLearningData',
              data: {
                learningData: importedData,
                merge: merge
              }
            });

            if (response?.success) {
              this.showToast(`Imported ${response.data.patternsCount} patterns`, 'success');
              this.loadLearningData();
              this.loadStats();
            } else {
              throw new Error('Failed to import learning data');
            }
          } catch (_error) {
            console.error('_error importing learning data:', _error);
            this.showToast('Failed to import learning data: Invalid file format', 'error');
          }
        };
        reader.readAsText(file);
      };

      input.click();
    } catch (_error) {
      console.error('_error importing learning data:', _error);
      this.showToast('Failed to import learning data', 'error');
    }
  }

  /**
   * Render categories list
   */
  renderCategories() {
    this.categoriesList.innerHTML = '';

    this.settings.categories.forEach((category, index) => {
      const categoryItem = document.createElement('div');
      categoryItem.className = 'category-item';
      categoryItem.innerHTML = `
        <span class="category-name">${this.escapeHtml(category)}</span>
        <div class="category-actions">
          <button class="category-btn edit" title="Edit category" data-index="${index}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 17.25V21H6.75L17.81 9.94L14.06 6.19L3 17.25ZM20.71 7.04C21.1 6.65 21.1 6.02 20.71 5.63L18.37 3.29C17.98 2.9 17.35 2.9 16.96 3.29L15.13 5.12L18.88 8.87L20.71 7.04Z" fill="currentColor"/>
            </svg>
          </button>
          <button class="category-btn delete" title="Delete category" data-index="${index}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM19 4H15.5L14.5 3H9.5L8.5 4H5V6H19V4Z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      `;

      // Attach event listeners for category actions
      const editBtn = categoryItem.querySelector('.edit');
      const deleteBtn = categoryItem.querySelector('.delete');

      editBtn.addEventListener('click', () => this.editCategory(index));
      deleteBtn.addEventListener('click', () => this.deleteCategory(index));

      this.categoriesList.appendChild(categoryItem);
    });
  }

  /**
   * Handle Gemini API key input change
   */
  onApiKeyChange() {
    this.updateGeminiButtonStates();
  }

  /**
   * Update Gemini button states
   */
  updateGeminiButtonStates() {
    const value = this.apiKeyInput.value.trim();
    const hasValue = value.length > 0;
    const isPlaceholder = value.startsWith('••••');
    const hasExistingKey = this.apiKeyInput.dataset.hasKey === 'true';
    const isValidFormat = value.startsWith('AIza') && value.length >= 35;

    let shouldEnable = false;

    if (isPlaceholder && hasExistingKey) {
      shouldEnable = false;
    } else if (hasValue && !isPlaceholder) {
      shouldEnable = isValidFormat;
    }

    this.testGeminiKeyBtn.disabled = !shouldEnable;
    this.saveGeminiKeyBtn.disabled = !shouldEnable;

    if (hasValue && !isPlaceholder && !isValidFormat) {
      this.showApiKeyStatus('API key should start with "AIza" and be ~39 characters long', 'error');
    } else if (!isPlaceholder && hasValue && isValidFormat) {
      this.hideApiKeyStatus();
    }
  }

  /**
   * Clear Gemini API key input
   */
  clearApiKey() {
    this.apiKeyInput.value = '';
    this.apiKeyInput.type = 'password';
    this.apiKeyInput.dataset.hasKey = 'false';
    this.isApiKeyVisible = false;
    this.hideApiKeyStatus();
    this.updateGeminiButtonStates();
    this.apiKeyInput.focus();
    console.log('Gemini API key input cleared');
  }

  /**
   * Clear Cerebras API key input
   */
  clearCerebrasApiKey() {
    this.cerebrasApiKeyInput.value = '';
    this.cerebrasApiKeyInput.type = 'password';
    this.cerebrasApiKeyInput.dataset.hasKey = 'false';
    this.isCerebrasApiKeyVisible = false;
    this.hideCerebrasApiKeyStatus();
    this.updateCerebrasButtonStates();
    this.cerebrasApiKeyInput.focus();
    console.log('Cerebras API key input cleared');
  }

  /**
   * Toggle Gemini API key visibility
   */
  toggleApiKeyVisibility() {
    const eyeIconOpen = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 4.5C7 4.5 2.73 7.61 1 12C2.73 16.39 7 19.5 12 19.5C17 19.5 21.27 16.39 23 12C21.27 7.61 17 4.5 12 4.5ZM12 17C9.24 17 7 14.76 7 12C7 9.24 9.24 7 12 7C14.76 7 17 9.24 17 12C17 14.76 14.76 17 12 17ZM12 9C10.34 9 9 10.34 9 12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12C15 10.34 13.66 9 12 9Z" fill="currentColor"/>
      </svg>
    `;
    const eyeIconClosed = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 7C12.55 7 13 7.45 13 8C13 8.55 12.55 9 12 9C11.45 9 11 8.55 11 8C11 7.45 11.45 7 12 7ZM2 12C2 12 5.5 5 12 5C18.5 5 22 12 22 12C22 12 18.5 19 12 19C5.5 19 2 12 2 12ZM12 17C15.87 17 19.5 13.87 19.5 12C19.5 10.13 15.87 7 12 7C8.13 7 4.5 10.13 4.5 12C4.5 13.87 8.13 17 12 17Z" fill="currentColor"/>
        <path d="M3 3L21 21" stroke="currentColor" stroke-width="2"/>
      </svg>
    `;

    this.isApiKeyVisible = !this.isApiKeyVisible;

    if (this.isApiKeyVisible) {
      if (this.settings.apiKey) {
        this.apiKeyInput.value = this.settings.apiKey;
      }
      this.apiKeyInput.type = 'text';
      this.toggleApiKeyBtn.innerHTML = eyeIconClosed;
    } else {
      if (this.settings.apiKey) {
        this.apiKeyInput.value = '••••••••••••••••••••••••••••••••••••••••';
      }
      this.apiKeyInput.type = 'password';
      this.toggleApiKeyBtn.innerHTML = eyeIconOpen;
    }
    this.updateGeminiButtonStates();
  }

  /**
   * Toggle Cerebras API key visibility
   */
  toggleCerebrasApiKeyVisibility() {
    const eyeIconOpen = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 4.5C7 4.5 2.73 7.61 1 12C2.73 16.39 7 19.5 12 19.5C17 19.5 21.27 16.39 23 12C21.27 7.61 17 4.5 12 4.5ZM12 17C9.24 17 7 14.76 7 12C7 9.24 9.24 7 12 7C14.76 7 17 9.24 17 12C17 14.76 14.76 17 12 17ZM12 9C10.34 9 9 10.34 9 12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12C15 10.34 13.66 9 12 9Z" fill="currentColor"/>
      </svg>
    `;
    const eyeIconClosed = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 7C12.55 7 13 7.45 13 8C13 8.55 12.55 9 12 9C11.45 9 11 8.55 11 8C11 7.45 11.45 7 12 7ZM2 12C2 12 5.5 5 12 5C18.5 5 22 12 22 12C22 12 18.5 19 12 19C5.5 19 2 12 2 12ZM12 17C15.87 17 19.5 13.87 19.5 12C19.5 10.13 15.87 7 12 7C8.13 7 4.5 10.13 4.5 12C4.5 13.87 8.13 17 12 17Z" fill="currentColor"/>
        <path d="M3 3L21 21" stroke="currentColor" stroke-width="2"/>
      </svg>
    `;

    this.isCerebrasApiKeyVisible = !this.isCerebrasApiKeyVisible;

    if (this.isCerebrasApiKeyVisible) {
      if (this.settings.cerebrasApiKey) {
        this.cerebrasApiKeyInput.value = this.settings.cerebrasApiKey;
      }
      this.cerebrasApiKeyInput.type = 'text';
      this.toggleCerebrasApiKeyBtn.innerHTML = eyeIconClosed;
    } else {
      if (this.settings.cerebrasApiKey) {
        this.cerebrasApiKeyInput.value = '••••••••••••••••••••••••••••••••••••••••';
      }
      this.cerebrasApiKeyInput.type = 'password';
      this.toggleCerebrasApiKeyBtn.innerHTML = eyeIconOpen;
    }
    this.updateCerebrasButtonStates();
  }

  /**
   * Test Gemini API key and auto-save if valid
   */
  async testGeminiKey() {
    const apiKey = this.apiKeyInput.value.trim();
    if (!apiKey || apiKey.startsWith('••••')) return;

    this.showApiKeyStatus('Testing Gemini API key...', 'loading');
    this.testGeminiKeyBtn.disabled = true;

    try {
      console.log('Testing Gemini API key:', `${apiKey.substring(0, 10)}...`);

      const messagePromise = chrome.runtime.sendMessage({
        action: 'testApiKey',
        data: { apiKey }
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('API key test timeout after 15 seconds')), 15000);
      });

      const response = await Promise.race([messagePromise, timeoutPromise]);

      console.log('Gemini API key test response:', response);

      if (response?.success && response.valid) {
        this.showApiKeyStatus('✓ Gemini API key is valid! Saving...', 'success');

        this.settings.apiKey = apiKey;
        await chrome.storage.sync.set({
          bookmarkMindSettings: this.settings
        });
        console.log('✓ Gemini API key automatically saved');

        this.showToast('Gemini API key validated and saved!', 'success');

        setTimeout(() => {
          this.apiKeyInput.value = '••••••••••••••••••••••••••••••••••••••••';
          this.apiKeyInput.type = 'password';
          this.apiKeyInput.dataset.hasKey = 'true';
          this.isApiKeyVisible = false;
          this.hideApiKeyStatus();
          this.updateGeminiButtonStates();
        }, 2000);
      } else if (response && !response.success) {
        console.error('Gemini API key test failed:', response._error);
        this.showApiKeyStatus(`Test failed: ${response.error}`, 'error');
      } else {
        this.showApiKeyStatus('Invalid API key. Please check your key.', 'error');
      }
    } catch (_error) {
      console.error('Gemini API key test _error:', _error);
      this.showApiKeyStatus(`Failed to test API key: ${_error.message}`, 'error');
    } finally {
      this.testGeminiKeyBtn.disabled = false;
    }
  }

  /**
   * Save Gemini API key manually
   */
  async saveGeminiKey() {
    const apiKey = this.apiKeyInput.value.trim();
    if (!apiKey || apiKey.startsWith('••••')) return;

    if (!apiKey.startsWith('AIza') || apiKey.length < 35) {
      this.showApiKeyStatus('Invalid API key format. Key should start with "AIza"', 'error');
      return;
    }

    this.showApiKeyStatus('Saving Gemini API key...', 'loading');
    this.saveGeminiKeyBtn.disabled = true;

    try {
      this.settings.apiKey = apiKey;
      await chrome.storage.sync.set({
        bookmarkMindSettings: this.settings
      });

      this.showApiKeyStatus('Gemini API key saved successfully!', 'success');

      setTimeout(() => {
        this.apiKeyInput.value = '••••••••••••••••••••••••••••••••••••••••';
        this.apiKeyInput.type = 'password';
        this.apiKeyInput.dataset.hasKey = 'true';
        this.isApiKeyVisible = false;
        this.hideApiKeyStatus();
        this.updateGeminiButtonStates();
      }, 2000);

      this.showToast('Gemini API key saved successfully', 'success');
    } catch (_error) {
      console.error('Failed to save Gemini API key:', _error);
      this.showApiKeyStatus('Failed to save API key', 'error');
      this.saveGeminiKeyBtn.disabled = false;
    }
  }

  /**
   * Handle Cerebras API key input change
   */
  onCerebrasApiKeyChange() {
    this.updateCerebrasButtonStates();
  }

  /**
   * Update Cerebras button states
   */
  updateCerebrasButtonStates() {
    const value = this.cerebrasApiKeyInput.value.trim();
    const hasValue = value.length > 0;
    const isPlaceholder = value.startsWith('••••');
    const isValidFormat = value.startsWith('csk-') && value.length >= 10;
    const shouldEnable = hasValue && !isPlaceholder && isValidFormat;

    this.testCerebrasKeyBtn.disabled = !shouldEnable;
    this.saveCerebrasKeyBtn.disabled = !shouldEnable;

    if (hasValue && !isPlaceholder && !isValidFormat) {
      this.showCerebrasApiKeyStatus('API key should start with "csk-"', 'error');
    } else if (!isPlaceholder && hasValue && isValidFormat) {
      this.hideCerebrasApiKeyStatus();
    }
  }

  /**
   * Test Cerebras API key and auto-save if valid
   */
  async testCerebrasKey() {
    const apiKey = this.cerebrasApiKeyInput.value.trim();
    if (!apiKey || apiKey.startsWith('••••')) return;

    this.showCerebrasApiKeyStatus('Testing Cerebras API key...', 'loading');
    this.testCerebrasKeyBtn.disabled = true;

    try {
      console.log('Testing Cerebras API key:', `${apiKey.substring(0, 10)}...`);

      const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama3.1-8b',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10
        })
      });

      console.log('Cerebras API test response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Cerebras API test successful:', data);
        this.showCerebrasApiKeyStatus('✓ Cerebras API key is valid! Saving...', 'success');

        this.settings.cerebrasApiKey = apiKey;
        await chrome.storage.sync.set({
          bookmarkMindSettings: this.settings
        });
        console.log('✓ Cerebras API key automatically saved');

        this.showToast('Cerebras API key validated and saved!', 'success');

        setTimeout(() => {
          this.cerebrasApiKeyInput.value = '••••••••••••••••••••••••••••••••••••••••';
          this.cerebrasApiKeyInput.type = 'password';
          this.cerebrasApiKeyInput.dataset.hasKey = 'true';
          this.isCerebrasApiKeyVisible = false;
          this.hideCerebrasApiKeyStatus();
          this.updateCerebrasButtonStates();
        }, 2000);
      } else {
        const errorData = await response.text();
        console.error('Cerebras API test failed:', response.status, errorData);
        this.showCerebrasApiKeyStatus(
          `Test failed: ${response.status} ${response.statusText}`,
          'error'
        );
      }
    } catch (_error) {
      console.error('Cerebras API key test _error:', _error);
      this.showCerebrasApiKeyStatus(`Failed to test API key: ${_error.message}`, 'error');
    } finally {
      this.testCerebrasKeyBtn.disabled = false;
    }
  }

  /**
   * Save Cerebras API key manually
   */
  async saveCerebrasKey() {
    const apiKey = this.cerebrasApiKeyInput.value.trim();
    if (!apiKey || apiKey.startsWith('••••')) return;

    if (!apiKey.startsWith('csk-') || apiKey.length < 10) {
      this.showCerebrasApiKeyStatus(
        'Invalid API key format. Key should start with "csk-"',
        'error'
      );
      return;
    }

    this.showCerebrasApiKeyStatus('Saving Cerebras API key...', 'loading');
    this.saveCerebrasKeyBtn.disabled = true;

    try {
      this.settings.cerebrasApiKey = apiKey;
      await chrome.storage.sync.set({
        bookmarkMindSettings: this.settings
      });

      this.showCerebrasApiKeyStatus('Cerebras API key saved successfully!', 'success');

      setTimeout(() => {
        this.cerebrasApiKeyInput.value = '••••••••••••••••••••••••••••••••••••••••';
        this.cerebrasApiKeyInput.type = 'password';
        this.cerebrasApiKeyInput.dataset.hasKey = 'true';
        this.isCerebrasApiKeyVisible = false;
        this.hideCerebrasApiKeyStatus();
        this.updateCerebrasButtonStates();
      }, 2000);

      this.showToast('Cerebras API key saved successfully', 'success');
    } catch (_error) {
      console.error('Failed to save Cerebras API key:', _error);
      this.showCerebrasApiKeyStatus('Failed to save API key', 'error');
      this.saveCerebrasKeyBtn.disabled = false;
    }
  }

  /**
   * Show Cerebras API key status message
   */
  showCerebrasApiKeyStatus(message, type) {
    this.cerebrasApiKeyStatus.classList.remove('hidden', 'success', 'error', 'loading');
    this.cerebrasApiKeyStatus.classList.add(type);

    const icon = this.cerebrasApiKeyStatus.querySelector('.status-icon');
    const text = this.cerebrasApiKeyStatus.querySelector('.status-text');

    text.textContent = message;

    if (type === 'success') {
      icon.textContent = '✓';
    } else if (type === 'error') {
      icon.textContent = '✗';
    } else if (type === 'loading') {
      icon.textContent = '⟳';
    }
  }

  /**
   * Hide Cerebras API key status message
   */
  hideCerebrasApiKeyStatus() {
    this.cerebrasApiKeyStatus.classList.add('hidden');
  }

  /**
   * Show/hide API key status
   */
  showApiKeyStatus(message, type) {
    this.apiKeyStatus.className = `status-indicator ${type}`;
    this.apiKeyStatus.querySelector('.status-text').textContent = message;
    this.apiKeyStatus.classList.remove('hidden');
  }

  hideApiKeyStatus() {
    this.apiKeyStatus.classList.add('hidden');
  }

  /**
   * Handle Groq API key input change
   */
  onGroqApiKeyChange() {
    this.updateGroqButtonStates();
  }

  /**
   * Update Groq button states
   */
  updateGroqButtonStates() {
    const value = this.groqApiKeyInput.value.trim();
    const hasValue = value.length > 0;
    const isPlaceholder = value.startsWith('••••');
    const isValidFormat = value.startsWith('gsk_') && value.length >= 10;
    const shouldEnable = hasValue && !isPlaceholder && isValidFormat;

    this.testGroqKeyBtn.disabled = !shouldEnable;
    this.saveGroqKeyBtn.disabled = !shouldEnable;

    if (hasValue && !isPlaceholder && !isValidFormat) {
      this.showGroqApiKeyStatus('Invalid format. Groq API keys should start with "gsk_"', 'error');
    } else {
      this.hideGroqApiKeyStatus();
    }
  }

  /**
   * Clear Groq API key
   */
  clearGroqApiKey() {
    this.groqApiKeyInput.value = '';
    this.groqApiKeyInput.type = 'password';
    this.groqApiKeyInput.dataset.hasKey = 'false';
    this.groqApiKeyInput.placeholder = 'Enter your Groq API key (starts with gsk_...)';
    this.isGroqApiKeyVisible = false;
    this.updateGroqButtonStates();
  }

  /**
   * Toggle Groq API key visibility
   */
  toggleGroqApiKeyVisibility() {
    if (
      this.groqApiKeyInput.dataset.hasKey === 'true' &&
      this.groqApiKeyInput.value.startsWith('••••')
    ) {
      this.showToast('Please clear the key first to enter a new one', 'info');
      return;
    }

    this.isGroqApiKeyVisible = !this.isGroqApiKeyVisible;
    this.groqApiKeyInput.type = this.isGroqApiKeyVisible ? 'text' : 'password';

    const eyeIcon = this.toggleGroqApiKeyBtn.querySelector('svg path');
    if (this.isGroqApiKeyVisible) {
      eyeIcon.setAttribute(
        'd',
        'M12 7C14.76 7 17 9.24 17 12C17 14.76 14.76 17 12 17C9.24 17 7 14.76 7 12C7 9.24 9.24 7 12 7ZM2 12C2 12 5 5 12 5C19 5 22 12 22 12C22 12 19 19 12 19C5 19 2 12 2 12Z'
      );
    } else {
      eyeIcon.setAttribute(
        'd',
        'M12 4.5C7 4.5 2.73 7.61 1 12C2.73 16.39 7 19.5 12 19.5C17 19.5 21.27 16.39 23 12C21.27 7.61 17 4.5 12 4.5ZM12 17C9.24 17 7 14.76 7 12C7 9.24 9.24 7 12 7C14.76 7 17 9.24 17 12C17 14.76 14.76 17 12 17ZM12 9C10.34 9 9 10.34 9 12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12C15 10.34 13.66 9 12 9Z'
      );
    }

    this.updateGroqButtonStates();
  }

  /**
   * Test Groq API key
   */
  async testGroqKey() {
    const apiKey = this.groqApiKeyInput.value.trim();
    if (!apiKey || apiKey.startsWith('••••')) return;

    this.showGroqApiKeyStatus('Testing Groq API key...', 'loading');
    this.testGroqKeyBtn.disabled = true;

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: 'Test' }],
          max_tokens: 5
        })
      });

      if (response.ok) {
        this.showGroqApiKeyStatus('Groq API key is valid!', 'success');
        setTimeout(() => {
          this.hideGroqApiKeyStatus();
          this.updateGroqButtonStates();
        }, 3000);
        this.showToast('Groq API key validated successfully', 'success');
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || `Error ${response.status}`;
        this.showGroqApiKeyStatus(`Invalid API key: ${errorMsg}`, 'error');
        this.showToast(`Groq API key validation failed: ${errorMsg}`, 'error');
      }
    } catch (_error) {
      console.error('Groq API test _error:', _error);
      this.showGroqApiKeyStatus('Network error. Please check your connection.', 'error');
      this.showToast('Failed to test Groq API key', 'error');
    } finally {
      this.testGroqKeyBtn.disabled = false;
    }
  }

  /**
   * Save Groq API key
   */
  async saveGroqKey() {
    const apiKey = this.groqApiKeyInput.value.trim();
    if (!apiKey || apiKey.startsWith('••••')) return;

    if (!apiKey.startsWith('gsk_') || apiKey.length < 10) {
      this.showGroqApiKeyStatus('Invalid API key format. Key should start with "gsk_"', 'error');
      return;
    }

    this.showGroqApiKeyStatus('Saving Groq API key...', 'loading');
    this.saveGroqKeyBtn.disabled = true;

    try {
      this.settings.groqApiKey = apiKey;
      await chrome.storage.sync.set({
        bookmarkMindSettings: this.settings
      });

      this.showGroqApiKeyStatus('Groq API key saved successfully!', 'success');

      setTimeout(() => {
        this.groqApiKeyInput.value = '••••••••••••••••••••••••••••••••••••••••';
        this.groqApiKeyInput.type = 'password';
        this.groqApiKeyInput.dataset.hasKey = 'true';
        this.isGroqApiKeyVisible = false;
        this.hideGroqApiKeyStatus();
        this.updateGroqButtonStates();
      }, 2000);

      this.showToast('Groq API key saved successfully', 'success');
    } catch (_error) {
      console.error('Failed to save Groq API key:', _error);
      this.showGroqApiKeyStatus('Failed to save API key', 'error');
      this.saveGroqKeyBtn.disabled = false;
    }
  }

  /**
   * Show Groq API key status message
   */
  showGroqApiKeyStatus(message, type) {
    this.groqApiKeyStatus.classList.remove('hidden', 'success', 'error', 'loading');
    this.groqApiKeyStatus.classList.add(type);

    const icon = this.groqApiKeyStatus.querySelector('.status-icon');
    const text = this.groqApiKeyStatus.querySelector('.status-text');

    text.textContent = message;

    if (type === 'success') {
      icon.textContent = '✓';
    } else if (type === 'error') {
      icon.textContent = '✗';
    } else if (type === 'loading') {
      icon.textContent = '⟳';
    }
  }

  /**
   * Hide Groq API key status message
   */
  hideGroqApiKeyStatus() {
    this.groqApiKeyStatus.classList.add('hidden');
  }

  /**
   * Handle new category input change
   */
  onNewCategoryChange() {
    const value = this.newCategoryInput.value.trim();
    this.addCategoryBtn.disabled = !value || this.settings.categories.includes(value);
  }

  /**
   * Add new category
   */
  addCategory() {
    const categoryName = this.newCategoryInput.value.trim();
    if (!categoryName || this.settings.categories.includes(categoryName)) return;

    this.settings.categories.push(categoryName);
    this.newCategoryInput.value = '';
    this.addCategoryBtn.disabled = true;

    this.renderCategories();
    this.saveSettings();
    this.showToast(`Category "${categoryName}" added!`, 'success');
  }

  /**
   * Edit category
   */
  editCategory(index) {
    const currentName = this.settings.categories[index];
    const newName = prompt('Edit category name:', currentName);

    if (newName?.trim() && newName !== currentName) {
      const trimmedName = newName.trim();

      // Check for duplicates
      if (this.settings.categories.includes(trimmedName)) {
        this.showToast('Category already exists!', 'error');
        return;
      }

      this.settings.categories[index] = trimmedName;
      this.renderCategories();
      this.saveSettings();
      this.showToast(`Category renamed to "${trimmedName}"`, 'success');
    }
  }

  /**
   * Delete category
   */
  deleteCategory(index) {
    const categoryName = this.settings.categories[index];

    if (confirm(`Are you sure you want to delete the category "${categoryName}"?`)) {
      this.settings.categories.splice(index, 1);
      this.renderCategories();
      this.saveSettings();
      this.showToast(`Category "${categoryName}" deleted`, 'success');
    }
  }

  /**
   * Handle max depth slider change
   */
  onMaxDepthChange() {
    const value = Number.parseInt(this.maxCategoryDepthSlider.value);
    this.maxDepthValueDisplay.textContent = value;
    this.settings.maxCategoryDepth = value;
  }

  /**
   * Handle min bookmarks threshold slider change
   */
  onMinThresholdChange() {
    const value = Number.parseInt(this.minBookmarksThresholdSlider.value);
    this.minThresholdValueDisplay.textContent = value;
    this.settings.minBookmarksThreshold = value;
  }

  /**
   * Handle AI confidence threshold slider change
   */
  onConfidenceThresholdChange() {
    if (this.aiConfidenceThresholdSlider && this.confidenceValueDisplay) {
      const value = Number.parseInt(this.aiConfidenceThresholdSlider.value);
      this.confidenceValueDisplay.textContent = value;
      this.settings.aiConfidenceThreshold = value;
    }
  }

  /**
   * Handle learning weight slider change
   */
  onLearningWeightChange() {
    if (this.learningWeightSlider && this.learningWeightValueDisplay) {
      const value = Number.parseInt(this.learningWeightSlider.value);
      this.learningWeightValueDisplay.textContent = value;
      this.settings.learningWeight = value;
    }
  }

  /**
   * Handle min categories slider change
   */
  onMinCategoriesChange() {
    if (this.minCategoriesSlider && this.minCategoriesValueDisplay) {
      const value = Number.parseInt(this.minCategoriesSlider.value);
      this.minCategoriesValueDisplay.textContent = value;
      this.settings.minCategories = value;
    }
  }

  /**
   * Handle max categories slider change
   */
  onMaxCategoriesChange() {
    if (this.maxCategoriesSlider && this.maxCategoriesValueDisplay) {
      const value = Number.parseInt(this.maxCategoriesSlider.value);
      this.maxCategoriesValueDisplay.textContent = value;
      this.settings.maxCategories = value;
    }
  }

  /**
   * Save all settings
   */
  async saveSettings() {
    try {
      // Update basic settings from UI
      this.settings.batchSize = Number.parseInt(this.batchSizeSelect.value);
      this.settings.cleanupEmptyFolders = this.cleanupEmptyFoldersCheckbox.checked;
      this.settings.maxCategoryDepth = Number.parseInt(this.maxCategoryDepthSlider.value);
      this.settings.minBookmarksThreshold = Number.parseInt(this.minBookmarksThresholdSlider.value);

      // Update advanced settings from UI
      if (this.preserveExistingFoldersCheckbox) {
        this.settings.preserveExistingFolders = this.preserveExistingFoldersCheckbox.checked;
      }
      if (this.mergeSimilarFoldersCheckbox) {
        this.settings.mergeSimilarFolders = this.mergeSimilarFoldersCheckbox.checked;
      }
      if (this.aiConfidenceThresholdSlider) {
        this.settings.aiConfidenceThreshold = Number.parseInt(
          this.aiConfidenceThresholdSlider.value
        );
      }
      if (this.aiProviderSelect) {
        this.settings.aiProvider = this.aiProviderSelect.value;
      }
      if (this.enableFallbackProvidersCheckbox) {
        this.settings.enableFallbackProviders = this.enableFallbackProvidersCheckbox.checked;
      }
      if (this.enableLearningCheckbox) {
        this.settings.enableLearning = this.enableLearningCheckbox.checked;
      }
      if (this.learningWeightSlider) {
        this.settings.learningWeight = Number.parseInt(this.learningWeightSlider.value);
      }
      if (this.retryAttemptsSelect) {
        this.settings.retryAttempts = Number.parseInt(this.retryAttemptsSelect.value);
      }
      if (this.requestTimeoutSelect) {
        this.settings.requestTimeout = Number.parseInt(this.requestTimeoutSelect.value);
      }
      if (this.enableCachingCheckbox) {
        this.settings.enableCaching = this.enableCachingCheckbox.checked;
      }
      if (this.cacheExpirationSelect) {
        this.settings.cacheExpiration = Number.parseInt(this.cacheExpirationSelect.value);
      }
      if (this.autoSnapshotCheckbox) {
        this.settings.autoSnapshot = this.autoSnapshotCheckbox.checked;
      }
      if (this.maxSnapshotsSelect) {
        this.settings.maxSnapshots = Number.parseInt(this.maxSnapshotsSelect.value);
      }
      if (this.showProgressNotificationsCheckbox) {
        this.settings.showProgressNotifications = this.showProgressNotificationsCheckbox.checked;
      }
      if (this.showDetailedLogsCheckbox) {
        this.settings.showDetailedLogs = this.showDetailedLogsCheckbox.checked;
      }
      if (this.themeSelect) {
        this.settings.theme = this.themeSelect.value;
      }
      if (this.minCategoriesSlider) {
        this.settings.minCategories = Number.parseInt(this.minCategoriesSlider.value);
      }
      if (this.maxCategoriesSlider) {
        this.settings.maxCategories = Number.parseInt(this.maxCategoriesSlider.value);
      }
      if (this.hierarchicalModeCheckbox) {
        this.settings.hierarchicalMode = this.hierarchicalModeCheckbox.checked;
      }

      await chrome.storage.sync.set({
        bookmarkMindSettings: this.settings
      });

      this.showToast('Settings saved successfully', 'success');
      console.log('Settings saved:', this.settings);
    } catch (_error) {
      console.error('_error saving settings:', _error);
      this.showToast('Failed to save settings', 'error');
    }
  }

  /**
   * Reset advanced settings to defaults
   */
  async resetAdvancedSettings() {
    try {
      const confirmed = confirm(
        'This will reset all advanced settings to their default values. ' +
          'Your API keys and categories will not be affected.\n\n' +
          'Do you want to continue?'
      );

      if (!confirmed) {
        return;
      }

      const defaults = this.getDefaultSettings();

      // Keep API keys and categories
      this.settings = {
        ...defaults,
        apiKey: this.settings.apiKey,
        cerebrasApiKey: this.settings.cerebrasApiKey,
        groqApiKey: this.settings.groqApiKey,
        categories: this.settings.categories,
        lastSortTime: this.settings.lastSortTime
      };

      await chrome.storage.sync.set({
        bookmarkMindSettings: this.settings
      });

      this.updateSettingsUI();
      this.showToast('Advanced settings reset to defaults', 'success');
    } catch (_error) {
      console.error('_error resetting advanced settings:', _error);
      this.showToast('Failed to reset settings', 'error');
    }
  }

  /**
   * Consolidate sparse folders (less than 3 bookmarks)
   */
  async consolidateFolders() {
    try {
      // Show confirmation dialog
      const threshold = this.settings.minBookmarksThreshold || 3;
      const confirmed = confirm(
        `This will move bookmarks from folders with less than ${threshold} bookmarks to their parent folders. Empty folders will also be removed. This action cannot be undone.\n\nDo you want to continue?`
      );

      if (!confirmed) {
        return;
      }

      // Disable button and show loading state
      this.consolidateFoldersBtn.disabled = true;
      this.consolidateFoldersBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2V6L16 2L12 2Z" fill="currentColor">
            <animateTransform attributeName="transform" attributeType="XML" type="rotate" dur="1s" from="0 12 12" to="360 12 12" repeatCount="indefinite"/>
          </path>
        </svg>
        Processing...
      `;

      // Send consolidation request to background script
      const response = await chrome.runtime.sendMessage({
        action: 'consolidateFolders',
        data: {
          minThreshold: this.settings.minBookmarksThreshold || 3
        }
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Consolidation failed');
      }

      const preview = response.data;

      if (preview.totalFoldersToRemove === 0) {
        this.showToast('No sparse folders found to consolidate', 'info');
        return;
      }

      // Show preview and confirm
      const previewMessage = `Found ${preview.sparseFolders.length} sparse folders and ${preview.emptyFolders.length} empty folders.\nThis will move ${preview.totalBookmarksToMove} bookmarks and remove ${preview.totalFoldersToRemove} folders.\n\nSparse folders:\n${preview.sparseFolders
        .map((f) => `• ${f.name} (${f.bookmarkCount} bookmarks)`)
        .join('\n')}\n\nContinue with consolidation?`;

      const finalConfirm = confirm(previewMessage);
      if (!finalConfirm) {
        return;
      }

      // Perform consolidation
      const consolidateResponse = await chrome.runtime.sendMessage({
        action: 'performConsolidation',
        data: {
          minThreshold: this.settings.minBookmarksThreshold || 3
        }
      });

      if (!consolidateResponse || !consolidateResponse.success) {
        throw new Error(consolidateResponse?.error || 'Consolidation failed');
      }

      const results = consolidateResponse.data;

      // Show success message
      const successMessage = `Consolidation completed!\n\n📊 Results:\n• Folders processed: ${results.foldersProcessed}\n• Bookmarks moved: ${results.bookmarksMoved}\n• Folders removed: ${results.foldersRemoved}\n\nYour bookmark structure has been optimized!`;

      this.showToast('Folder consolidation completed successfully!', 'success');
      alert(successMessage);

      // Refresh stats
      await this.loadStats();
    } catch (_error) {
      console.error('_error consolidating folders:', _error);
      this.showToast(`Consolidation failed: ${_error.message}`, 'error');
    } finally {
      // Restore button state
      this.consolidateFoldersBtn.disabled = false;
      this.consolidateFoldersBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 4H4C2.89 4 2 4.89 2 6V18C2 19.11 2.89 20 4 20H20C21.11 20 22 19.11 22 18V8C22 6.89 21.11 6 20 6H12L10 4Z" fill="currentColor"/>
          <path d="M8 12L10 14L16 8" stroke="currentColor" stroke-width="2" fill="none"/>
        </svg>
        Consolidate Sparse Folders
      `;
    }
  }

  /**
   * Export all extension data (settings + learning)
   */
  async exportAllData() {
    try {
      const allData = await chrome.storage.sync.get(null);

      // Get learning data from LearningService
      const learningResponse = await chrome.runtime.sendMessage({
        action: 'exportLearningData'
      });

      const exportData = {
        exportDate: new Date().toISOString(),
        version: '1.0.0',
        settings: allData.bookmarkMindSettings || {},
        learningData: learningResponse.success ? learningResponse.data : {}
      };

      // Remove sensitive data
      if (exportData.settings.apiKey) {
        exportData.settings.apiKey = '[REDACTED]';
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bookmarkmind-full-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.showToast('Settings and learning data exported successfully!', 'success');
    } catch (_error) {
      console.error('Export _error:', _error);
      this.showToast('Failed to export data', 'error');
    }
  }

  /**
   * Clear learning data
   */
  async clearLearningData() {
    if (
      confirm(
        "Are you sure you want to clear all learning data? This will reset the AI's learned preferences."
      )
    ) {
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'clearLearningData'
        });

        if (response?.success) {
          this.showToast('Learning data cleared', 'success');
          this.loadStats(); // Refresh stats
          this.loadLearningData(); // Refresh learning data display
        } else {
          throw new Error('Failed to clear learning data');
        }
      } catch (_error) {
        console.error('_error clearing learning data:', _error);
        this.showToast('Failed to clear learning data', 'error');
      }
    }
  }

  /**
   * Reset all settings
   */
  async resetSettings() {
    if (
      confirm(
        'Are you sure you want to reset all settings to defaults? This will clear your API key and custom categories.'
      )
    ) {
      try {
        const defaultSettings = this.getDefaultSettings();
        await chrome.storage.sync.set({
          bookmarkMindSettings: defaultSettings,
          bookmarkMindLearning: {}
        });

        this.settings = defaultSettings;
        this.updateSettingsUI();
        this.showToast('Settings reset to defaults', 'success');
        this.loadStats(); // Refresh stats
      } catch (_error) {
        console.error('_error resetting settings:', _error);
        this.showToast('Failed to reset settings', 'error');
      }
    }
  }

  /**
   * Load and display performance data
   */
  async loadPerformanceData() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getPerformanceDashboard'
      });

      if (response?.success) {
        const dashboard = response.data;
        this.displayPerformanceDashboard(dashboard);
      } else {
        console.warn('Failed to load performance data');
      }
    } catch (_error) {
      console.error('_error loading performance data:', _error);
    }
  }

  /**
   * Display performance dashboard data
   */
  displayPerformanceDashboard(dashboard) {
    // Update overview cards
    if (this.avgCategorizationTime) {
      this.avgCategorizationTime.textContent = dashboard.overview.avgCategorizationTime || '-';
    }
    if (this.performanceSuccessRate) {
      this.performanceSuccessRate.textContent = `${dashboard.overview.successRate}%`;
    }
    if (this.totalApiCalls) {
      this.totalApiCalls.textContent = dashboard.overview.totalProcessed || 0;
    }
    if (this.memoryUsage && dashboard.currentMemory) {
      this.memoryUsage.textContent = dashboard.currentMemory.usedMB || '-';
    }

    // Display provider comparison
    this.displayProviderComparison(dashboard.providerComparison);

    // Display batch efficiency
    if (dashboard.batchEfficiency) {
      if (this.avgBatchSize) {
        this.avgBatchSize.textContent = dashboard.batchEfficiency.avgBatchSize || '-';
      }
      if (this.avgBatchTime) {
        this.avgBatchTime.textContent = dashboard.batchEfficiency.avgBatchTime || '-';
      }
      if (this.avgTimePerItem) {
        this.avgTimePerItem.textContent = dashboard.batchEfficiency.avgTimePerItem || '-';
      }
      if (this.efficiencyScore) {
        this.efficiencyScore.textContent = dashboard.batchEfficiency.efficiencyScore || '-';
      }
    }

    // Display performance history graph
    this.displayPerformanceHistory(dashboard.performanceHistory);

    // Display AI insights
    this.displayInsights(dashboard.insights);
  }

  /**
   * Display provider comparison chart
   */
  displayProviderComparison(providerData) {
    if (!this.providerComparisonChart || !providerData) return;

    const providers = Object.keys(providerData);
    if (providers.length === 0) {
      this.providerComparisonChart.innerHTML =
        '<div class="loading-state">No provider data available yet</div>';
      return;
    }

    // Find fastest and slowest providers
    const sortedProviders = providers.sort(
      (a, b) => providerData[a].avgResponseTime - providerData[b].avgResponseTime
    );
    const fastest = sortedProviders[0];
    const slowest = sortedProviders[sortedProviders.length - 1];

    // Create provider cards
    const html = `
      <div class="provider-comparison-grid">
        ${providers
          .map((provider) => {
            const data = providerData[provider];
            const isFastest = provider === fastest && providers.length > 1;
            const isSlowest = provider === slowest && providers.length > 1;

            return `
            <div class="provider-card">
              <div class="provider-card-header">
                <span class="provider-name">${provider}</span>
                ${isFastest ? '<span class="provider-badge fastest">Fastest</span>' : ''}
                ${isSlowest ? '<span class="provider-badge slowest">Slowest</span>' : ''}
              </div>
              <div class="provider-stats">
                <div class="provider-stat-row">
                  <span class="provider-stat-label">Avg Response:</span>
                  <span class="provider-stat-value">${data.avgResponseTime}ms</span>
                </div>
                <div class="provider-stat-row">
                  <span class="provider-stat-label">Success Rate:</span>
                  <span class="provider-stat-value">${data.successRate}%</span>
                </div>
                <div class="provider-stat-row">
                  <span class="provider-stat-label">Total Calls:</span>
                  <span class="provider-stat-value">${data.totalCalls}</span>
                </div>
                <div class="provider-stat-row">
                  <span class="provider-stat-label">Last 24h:</span>
                  <span class="provider-stat-value">${
                    data.recentPerformance.last24h.calls
                  } calls</span>
                </div>
              </div>
            </div>
          `;
          })
          .join('')}
      </div>
    `;

    this.providerComparisonChart.innerHTML = html;
  }

  /**
   * Display performance history graph
   */
  displayPerformanceHistory(historyData) {
    if (!this.performanceCanvas || !historyData || historyData.length === 0) {
      if (this.performanceHistoryChart) {
        this.performanceHistoryChart.innerHTML =
          '<div class="loading-state">No performance history available yet</div>';
      }
      return;
    }

    const ctx = this.performanceCanvas.getContext('2d');
    const canvas = this.performanceCanvas;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = 250;

    // Prepare data
    const dates = historyData.map((d) =>
      new Date(d.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })
    );
    const times = historyData.map((d) => d.avgCategorizationTime);
    const maxTime = Math.max(...times, 100);
    const padding = 40;
    const graphWidth = canvas.width - padding * 2;
    const graphHeight = canvas.height - padding * 2;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid lines
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding + (graphHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(canvas.width - padding, y);
      ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = '#5f6368';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();

    // Draw line graph
    if (times.length > 0) {
      ctx.strokeStyle = '#1a73e8';
      ctx.lineWidth = 2;
      ctx.beginPath();

      times.forEach((time, index) => {
        const x = padding + (graphWidth / (times.length - 1 || 1)) * index;
        const y = canvas.height - padding - (time / maxTime) * graphHeight;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // Draw points
      ctx.fillStyle = '#1a73e8';
      times.forEach((time, index) => {
        const x = padding + (graphWidth / (times.length - 1 || 1)) * index;
        const y = canvas.height - padding - (time / maxTime) * graphHeight;

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Draw labels
    ctx.fillStyle = '#5f6368';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';

    // X-axis labels (dates) - show every other label if too many
    const labelInterval = dates.length > 10 ? 2 : 1;
    dates.forEach((date, index) => {
      if (index % labelInterval === 0 || index === dates.length - 1) {
        const x = padding + (graphWidth / (dates.length - 1 || 1)) * index;
        ctx.save();
        ctx.translate(x, canvas.height - padding + 20);
        ctx.rotate(-Math.PI / 4);
        ctx.fillText(date, 0, 0);
        ctx.restore();
      }
    });

    // Y-axis labels (time in ms)
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const y = padding + (graphHeight / 5) * i;
      const value = Math.round(maxTime - (maxTime / 5) * i);
      ctx.fillText(`${value}ms`, padding - 10, y + 4);
    }
  }

  /**
   * Display AI insights and recommendations
   */
  displayInsights(insights) {
    if (!this.insightsContainer || !insights) return;

    const allInsights = [...(insights.recommendations || []), ...(insights.warnings || [])];

    if (allInsights.length === 0) {
      this.insightsContainer.innerHTML =
        '<div class="loading-state">No insights available yet. Complete some categorizations to get recommendations.</div>';
      return;
    }

    const html = allInsights
      .map((insight) => {
        const type =
          insight.type === 'error_rate' ||
          insight.type === 'performance_decline' ||
          insight.type === 'memory_usage'
            ? 'warning'
            : insight.priority === 'info'
              ? 'info'
              : 'recommendation';

        const icon = type === 'warning' ? '⚠️' : type === 'info' ? '✓' : '💡';

        return `
        <div class="insight-card ${type}">
          <div class="insight-icon">${icon}</div>
          <div class="insight-content">
            <div class="insight-title">${this.escapeHtml(insight.title)}</div>
            <div class="insight-description">${this.escapeHtml(insight.description)}</div>
            <div class="insight-action">→ ${this.escapeHtml(insight.action)}</div>
          </div>
        </div>
      `;
      })
      .join('');

    this.insightsContainer.innerHTML = html;
  }

  /**
   * Set date range to last 30 days
   */
  setDateRangeLast30Days() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);

    if (this.exportEndDate) {
      this.exportEndDate.valueAsDate = end;
    }
    if (this.exportStartDate) {
      this.exportStartDate.valueAsDate = start;
    }
  }

  /**
   * Set date range to all time
   */
  setDateRangeAllTime() {
    if (this.exportStartDate) {
      this.exportStartDate.value = '';
    }
    if (this.exportEndDate) {
      this.exportEndDate.value = '';
    }
  }

  /**
   * Export analytics report
   */
  async exportReport(format) {
    try {
      const startDate = this.exportStartDate?.value
        ? new Date(this.exportStartDate.value).getTime()
        : null;
      const endDate = this.exportEndDate?.value
        ? new Date(this.exportEndDate.value).getTime()
        : null;

      const response = await chrome.runtime.sendMessage({
        action: 'exportAnalyticsReport',
        data: {
          format: format,
          startDate: startDate,
          endDate: endDate
        }
      });

      if (response?.success) {
        const exportData = response.data;
        const dateStr = new Date().toISOString().slice(0, 10);

        if (format === 'csv') {
          const blob = new Blob([exportData.data], {
            type: 'text/csv'
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `bookmarkmind-analytics-${dateStr}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } else {
          const dataStr = JSON.stringify(exportData.data, null, 2);
          const blob = new Blob([dataStr], {
            type: 'application/json'
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `bookmarkmind-analytics-${dateStr}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }

        this.showToast(`Analytics report exported as ${format.toUpperCase()}`, 'success');
      } else {
        throw new Error('Failed to export report');
      }
    } catch (_error) {
      console.error('_error exporting report:', _error);
      this.showToast('Failed to export analytics report', 'error');
    }
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'success') {
    this.toast.className = `toast ${type}`;
    this.toast.querySelector('.toast-message').textContent = message;
    this.toast.classList.add('show');

    setTimeout(() => {
      this.toast.classList.remove('show');
    }, 3000);
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize options page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.optionsController = new OptionsController();
});

import { ModelComparisonService } from '../../ai/modelComparisonService.js';
import { BenchmarkService } from '../../analytics/benchmarkService.js';
/**
 * BookmarkMind - Model Comparison Dashboard
 * Handles AI model performance comparison, A/B testing, cost tracking, and optimization
 */

class ModelComparisonController {
  constructor() {
    this.dashboard = null;
    this.costReport = null;
    this.currentTab = 'overview';

    this.initializeElements();
    this.attachEventListeners();
    this.loadDashboard();
  }

  /**
   * Initialize DOM element references
   */
  initializeElements() {
    // Tab buttons
    this.tabBtns = document.querySelectorAll('.tab-btn');
    this.tabContents = document.querySelectorAll('.tab-content');

    // Back button
    this.backToSettings = document.getElementById('backToSettings');

    // Overview elements
    this.totalModelsTracked = document.getElementById('totalModelsTracked');
    this.totalCostDisplay = document.getElementById('totalCostDisplay');
    this.bestModelDisplay = document.getElementById('bestModelDisplay');
    this.totalABTests = document.getElementById('totalABTests');
    this.recommendedModel = document.getElementById('recommendedModel');
    this.recommendationConfidence = document.getElementById('recommendationConfidence');
    this.recommendationReason = document.getElementById('recommendationReason');
    this.recSuccessRate = document.getElementById('recSuccessRate');
    this.recAvgSpeed = document.getElementById('recAvgSpeed');
    this.recAvgCost = document.getElementById('recAvgCost');

    // Performance elements
    this.performanceTableBody = document.getElementById('performanceTableBody');

    // Cost tracking elements
    this.budgetAlertEnabled = document.getElementById('budgetAlertEnabled');
    this.dailyBudget = document.getElementById('dailyBudget');
    this.weeklyBudget = document.getElementById('weeklyBudget');
    this.monthlyBudget = document.getElementById('monthlyBudget');
    this.alertThreshold = document.getElementById('alertThreshold');
    this.saveBudgetBtn = document.getElementById('saveBudgetBtn');
    this.budgetStatusContainer = document.getElementById('budgetStatusContainer');
    this.budgetStatusContent = document.getElementById('budgetStatusContent');
    this.costReportPeriod = document.getElementById('costReportPeriod');
    this.refreshCostReport = document.getElementById('refreshCostReport');
    this.costReportContent = document.getElementById('costReportContent');

    // A/B test elements
    this.modelASelect = document.getElementById('modelASelect');
    this.modelBSelect = document.getElementById('modelBSelect');
    this.abtestSampleSize = document.getElementById('abtestSampleSize');
    this.startABTestBtn = document.getElementById('startABTestBtn');
    this.abtestResults = document.getElementById('abtestResults');
    this.previousTestsList = document.getElementById('previousTestsList');

    // Benchmark elements
    this.runBenchmarkBtn = document.getElementById('runBenchmarkBtn');
    this.clearBenchmarkHistoryBtn = document.getElementById('clearBenchmarkHistoryBtn');
    this.benchmarkProgress = document.getElementById('benchmarkProgress');
    this.benchmarkProgressFill = document.getElementById('benchmarkProgressFill');
    this.benchmarkProgressText = document.getElementById('benchmarkProgressText');
    this.benchmarkResults = document.getElementById('benchmarkResults');
    this.benchmarkAccuracy = document.getElementById('benchmarkAccuracy');
    this.benchmarkSpeed = document.getElementById('benchmarkSpeed');
    this.benchmarkCost = document.getElementById('benchmarkCost');
    this.benchmarkTests = document.getElementById('benchmarkTests');
    this.bestBenchmarkModel = document.getElementById('bestBenchmarkModel');
    this.bestBenchmarkMetrics = document.getElementById('bestBenchmarkMetrics');
    this.benchmarkTableBody = document.getElementById('benchmarkTableBody');
    this.benchmarkRecommendationsList = document.getElementById('benchmarkRecommendationsList');
    this.benchmarkHistoryLimit = document.getElementById('benchmarkHistoryLimit');
    this.refreshBenchmarkHistory = document.getElementById('refreshBenchmarkHistory');
    this.benchmarkHistoryList = document.getElementById('benchmarkHistoryList');

    // Model config elements
    this.temperature = document.getElementById('temperature');
    this.temperatureValue = document.getElementById('temperatureValue');
    this.topP = document.getElementById('topP');
    this.topPValue = document.getElementById('topPValue');
    this.maxTokens = document.getElementById('maxTokens');
    this.batchSizeMode = document.getElementById('batchSizeMode');
    this.customBatchSize = document.getElementById('customBatchSize');
    this.saveModelConfigBtn = document.getElementById('saveModelConfigBtn');
    this.resetModelConfigBtn = document.getElementById('resetModelConfigBtn');

    // Initialize benchmark service
    this.benchmarkService = new BenchmarkService();
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Tab navigation
    this.tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // Back button
    this.backToSettings.addEventListener('click', () => {
      window.location.href = 'options.html';
    });

    // Budget tracking
    this.saveBudgetBtn.addEventListener('click', () => this.saveBudgetSettings());
    this.refreshCostReport.addEventListener('click', () => this.loadCostReport());
    this.costReportPeriod.addEventListener('change', () => this.loadCostReport());

    // A/B testing
    this.startABTestBtn.addEventListener('click', () => this.startABTest());

    // Benchmark
    this.runBenchmarkBtn.addEventListener('click', () => this.runBenchmark());
    this.clearBenchmarkHistoryBtn.addEventListener('click', () => this.clearBenchmarkHistory());
    this.refreshBenchmarkHistory.addEventListener('click', () => this.loadBenchmarkHistory());
    this.benchmarkHistoryLimit.addEventListener('change', () => this.loadBenchmarkHistory());

    // Model configuration
    this.temperature.addEventListener('input', () => {
      this.temperatureValue.textContent = this.temperature.value;
    });
    this.topP.addEventListener('input', () => {
      this.topPValue.textContent = this.topP.value;
    });
    this.batchSizeMode.addEventListener('change', () => {
      if (this.batchSizeMode.value === 'custom') {
        this.customBatchSize.classList.remove('hidden');
      } else {
        this.customBatchSize.classList.add('hidden');
      }
    });
    this.saveModelConfigBtn.addEventListener('click', () => this.saveModelConfig());
    this.resetModelConfigBtn.addEventListener('click', () => this.resetModelConfig());
  }

  /**
   * Switch between tabs
   */
  switchTab(tabName) {
    this.currentTab = tabName;

    // Update tab buttons
    this.tabBtns.forEach((btn) => {
      if (btn.dataset.tab === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update tab contents
    this.tabContents.forEach((content) => {
      if (content.id === `${tabName}-tab`) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });

    // Load data for specific tabs
    if (tabName === 'costs') {
      this.loadCostReport();
    } else if (tabName === 'config') {
      this.loadModelConfig();
    } else if (tabName === 'benchmark') {
      this.loadBenchmarkHistory();
    }
  }

  /**
   * Load dashboard data
   */
  async loadDashboard() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getModelComparison'
      });

      if (response?.success) {
        this.dashboard = response.data;
        this.updateOverview();
        this.updatePerformanceTable();
        this.updatePreviousABTests();
      }
    } catch (_error) {
      console.error('_error loading dashboard:', _error);
      this.showError('Failed to load dashboard data');
    }
  }

  /**
   * Update overview tab
   */
  updateOverview() {
    // Summary cards
    this.totalModelsTracked.textContent = this.dashboard.overview.totalModelsTracked;
    this.totalCostDisplay.textContent = `$${this.dashboard.overview.totalCost}`;
    this.totalABTests.textContent = this.dashboard.overview.totalTests;

    // Best model
    if (this.dashboard.modelComparison.length > 0) {
      const bestModel = this.dashboard.modelComparison[0];
      this.bestModelDisplay.textContent = bestModel.model;
    }

    // Recommendation
    const rec = this.dashboard.recommendations.general;
    if (rec) {
      this.recommendedModel.textContent = rec.model;
      this.recommendationConfidence.textContent = rec.confidence;
      this.recommendationConfidence.className = `confidence-badge ${rec.confidence}`;
      this.recommendationReason.textContent = rec.reason;

      if (rec.metrics) {
        this.recSuccessRate.textContent = `${rec.metrics.successRate}%`;
        this.recAvgSpeed.textContent = `${rec.metrics.avgSpeed}ms`;
        this.recAvgCost.textContent = `$${rec.metrics.avgCost}`;
      }
    }
  }

  /**
   * Update performance table
   */
  updatePerformanceTable() {
    this.performanceTableBody.innerHTML = '';

    if (this.dashboard.modelComparison.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML =
        '<td colspan="7" class="loading">No performance data available yet. Run some categorizations to collect data.</td>';
      this.performanceTableBody.appendChild(row);
      return;
    }

    this.dashboard.modelComparison.forEach((model) => {
      const row = document.createElement('tr');

      const successRateClass =
        model.successRate >= 90 ? 'high' : model.successRate >= 70 ? 'medium' : 'low';

      row.innerHTML = `
        <td><strong>${model.model}</strong></td>
        <td>${model.provider}</td>
        <td><span class="success-rate ${successRateClass}">${model.successRate}%</span></td>
        <td>${model.avgSpeed}ms</td>
        <td>$${model.totalCost}</td>
        <td>${model.totalCalls}</td>
        <td>$${model.avgCostPerCall}</td>
      `;

      this.performanceTableBody.appendChild(row);
    });
  }

  /**
   * Load cost report
   */
  async loadCostReport() {
    try {
      const period = this.costReportPeriod.value;
      const response = await chrome.runtime.sendMessage({
        action: 'getCostReport',
        data: { period }
      });

      if (response?.success) {
        this.costReport = response.data;
        this.updateCostReport();
        this.updateBudgetStatus();
      }
    } catch (_error) {
      console.error('_error loading cost report:', _error);
    }
  }

  /**
   * Update cost report display
   */
  updateCostReport() {
    const report = this.costReport;

    let html = `
      <div class="cost-summary">
        <div class="metric">
          <span class="metric-label">Total Cost:</span>
          <span class="metric-value">$${report.totalCost}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Total Tokens:</span>
          <span class="metric-value">${report.totalTokens.toLocaleString()}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Total Calls:</span>
          <span class="metric-value">${report.totalCalls}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Avg Cost/Call:</span>
          <span class="metric-value">$${report.avgCostPerCall}</span>
        </div>
      </div>
    `;

    // By provider
    if (Object.keys(report.byProvider).length > 0) {
      html += '<h4 style="margin-top: 20px;">By Provider</h4>';
      html += '<div class="provider-costs">';
      for (const [provider, data] of Object.entries(report.byProvider)) {
        html += `
          <div class="provider-cost">
            <strong>${provider}</strong>: $${data.cost.toFixed(4)}
            (${data.tokens.toLocaleString()} tokens, ${data.calls} calls)
          </div>
        `;
      }
      html += '</div>';
    }

    this.costReportContent.innerHTML = html;
  }

  /**
   * Update budget status
   */
  updateBudgetStatus() {
    if (
      !this.costReport ||
      !this.costReport.budgetStatus ||
      !this.costReport.budgetStatus.enabled
    ) {
      this.budgetStatusContent.innerHTML = '<p>Configure budget alerts above to track usage.</p>';
      return;
    }

    const status = this.costReport.budgetStatus;
    let html = '';

    // Daily
    if (status.daily) {
      const fillClass =
        status.daily.percentage >= 100 ? 'danger' : status.daily.percentage >= 80 ? 'warning' : '';
      html += `
        <div class="budget-period">
          <h4>Daily Budget</h4>
          <div class="budget-bar">
            <div class="budget-fill ${fillClass}" style="width: ${Math.min(
              status.daily.percentage,
              100
            )}%"></div>
          </div>
          <div class="budget-details">
            <span>$${status.daily.spent} / $${status.daily.limit}</span>
            <span>${status.daily.percentage}%</span>
          </div>
        </div>
      `;
    }

    // Weekly
    if (status.weekly) {
      const fillClass =
        status.weekly.percentage >= 100
          ? 'danger'
          : status.weekly.percentage >= 80
            ? 'warning'
            : '';
      html += `
        <div class="budget-period">
          <h4>Weekly Budget</h4>
          <div class="budget-bar">
            <div class="budget-fill ${fillClass}" style="width: ${Math.min(
              status.weekly.percentage,
              100
            )}%"></div>
          </div>
          <div class="budget-details">
            <span>$${status.weekly.spent} / $${status.weekly.limit}</span>
            <span>${status.weekly.percentage}%</span>
          </div>
        </div>
      `;
    }

    // Monthly
    if (status.monthly) {
      const fillClass =
        status.monthly.percentage >= 100
          ? 'danger'
          : status.monthly.percentage >= 80
            ? 'warning'
            : '';
      html += `
        <div class="budget-period">
          <h4>Monthly Budget</h4>
          <div class="budget-bar">
            <div class="budget-fill ${fillClass}" style="width: ${Math.min(
              status.monthly.percentage,
              100
            )}%"></div>
          </div>
          <div class="budget-details">
            <span>$${status.monthly.spent} / $${status.monthly.limit}</span>
            <span>${status.monthly.percentage}%</span>
          </div>
        </div>
      `;
    }

    this.budgetStatusContent.innerHTML = html;
  }

  /**
   * Save budget settings
   */
  async saveBudgetSettings() {
    try {
      const budget = {
        enabled: this.budgetAlertEnabled.checked,
        dailyLimit: this.dailyBudget.value ? Number.parseFloat(this.dailyBudget.value) : null,
        weeklyLimit: this.weeklyBudget.value ? Number.parseFloat(this.weeklyBudget.value) : null,
        monthlyLimit: this.monthlyBudget.value ? Number.parseFloat(this.monthlyBudget.value) : null,
        alertThreshold: Number.parseInt(this.alertThreshold.value) / 100
      };

      const response = await chrome.runtime.sendMessage({
        action: 'setBudgetAlert',
        data: { budget }
      });

      if (response?.success) {
        this.showSuccess('Budget settings saved successfully');
        this.loadCostReport();
      }
    } catch (_error) {
      console.error('_error saving budget settings:', _error);
      this.showError('Failed to save budget settings');
    }
  }

  /**
   * Start A/B test
   */
  async startABTest() {
    try {
      const modelA = this.modelASelect.value;
      const modelB = this.modelBSelect.value;
      const sampleSize = Number.parseInt(this.abtestSampleSize.value);

      if (modelA === modelB) {
        this.showError('Please select different models for comparison');
        return;
      }

      if (sampleSize < 1 || sampleSize > 50) {
        this.showError('Sample size must be between 1 and 50');
        return;
      }

      this.startABTestBtn.disabled = true;
      this.startABTestBtn.textContent = 'Running test...';

      // Hide previous results
      this.abtestResults.classList.add('hidden');

      // Get sample bookmarks
      const bookmarksResponse = await chrome.runtime.sendMessage({
        action: 'getAllBookmarks'
      });

      if (!bookmarksResponse || !bookmarksResponse.success) {
        throw new Error('Failed to get bookmarks');
      }

      const allBookmarks = bookmarksResponse.data || [];
      if (allBookmarks.length === 0) {
        throw new Error('No bookmarks found. Please add some bookmarks first.');
      }

      // Take random sample
      const bookmarks = this._getRandomSample(allBookmarks, sampleSize);

      this.startABTestBtn.textContent = `Processing ${bookmarks.length} bookmarks...`;

      // Run A/B test
      const response = await chrome.runtime.sendMessage({
        action: 'startABTest',
        data: { modelA, modelB, bookmarks }
      });

      if (response?.success) {
        this.displayABTestResults(response.data);
        this.showSuccess(`A/B test completed! Processed ${bookmarks.length} bookmarks.`);
      } else {
        throw new Error(response.error || 'Failed to run A/B test');
      }
    } catch (_error) {
      console.error('_error in A/B test:', _error);
      this.showError(`Failed to run A/B test: ${_error.message}`);
    } finally {
      this.startABTestBtn.disabled = false;
      this.startABTestBtn.textContent = 'Start A/B Test';
    }
  }

  /**
   * Get random sample from array
   * @private
   */
  _getRandomSample(array, size) {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(size, array.length));
  }

  /**
   * Display A/B test results
   */
  displayABTestResults(data) {
    this.abtestResults.classList.remove('hidden');

    document.getElementById('modelAName').textContent = data.modelA;
    document.getElementById('modelBName').textContent = data.modelB;

    // Update metrics from actual results
    const resultsA = data.resultsA;
    const resultsB = data.resultsB;

    // Model A metrics
    const successRateA =
      resultsA.success && resultsA.metrics ? Math.round(resultsA.metrics.successRate * 100) : 0;
    document.getElementById('modelASuccessRate').textContent = `${successRateA}%`;
    document.getElementById('modelASpeed').textContent = `${resultsA.time}ms`;

    // Calculate cost for Model A
    const costA = this._estimateCost(data.modelA, resultsA.metrics);
    document.getElementById('modelACost').textContent = `$${costA.toFixed(6)}`;

    // Model B metrics
    const successRateB =
      resultsB.success && resultsB.metrics ? Math.round(resultsB.metrics.successRate * 100) : 0;
    document.getElementById('modelBSuccessRate').textContent = `${successRateB}%`;
    document.getElementById('modelBSpeed').textContent = `${resultsB.time}ms`;

    // Calculate cost for Model B
    const costB = this._estimateCost(data.modelB, resultsB.metrics);
    document.getElementById('modelBCost').textContent = `$${costB.toFixed(6)}`;

    // Reload dashboard to show updated stats
    this.loadDashboard();
  }

  /**
   * Estimate cost for a model based on token usage
   * @private
   */
  /**
   * Estimate cost for a model based on token usage
   * @private
   */
  _estimateCost(_model, metrics) {
    if (!metrics) return 0;

    // Cost estimation is disabled as per user request to remove hardcoded values.
    // API does not provide cost data.
    return 0;
  }

  /**
   * Update previous A/B tests list
   */
  updatePreviousABTests() {
    if (
      !this.dashboard ||
      !this.dashboard.abTestSummary ||
      this.dashboard.abTestSummary.totalTests === 0
    ) {
      this.previousTestsList.innerHTML = '<p>No A/B tests run yet.</p>';
      return;
    }

    const summary = this.dashboard.abTestSummary;
    let html = `<p><strong>${summary.totalTests}</strong> tests run`;

    if (summary.testsWithPreference > 0) {
      html += `, <strong>${summary.testsWithPreference}</strong> with user preferences</p>`;

      if (summary.preferences && Object.keys(summary.preferences).length > 0) {
        html += '<h4>Model Preferences:</h4><ul>';
        for (const [model, count] of Object.entries(summary.preferences)) {
          html += `<li>${model}: ${count} times</li>`;
        }
        html += '</ul>';
      }
    } else {
      html += '</p>';
    }

    this.previousTestsList.innerHTML = html;
  }

  /**
   * Load model configuration
   */
  async loadModelConfig() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getCustomModelConfig'
      });

      if (response?.success && response.data) {
        const config = response.data;
        this.temperature.value = config.temperature || 1.0;
        this.temperatureValue.textContent = this.temperature.value;
        this.topP.value = config.top_p || 0.95;
        this.topPValue.textContent = this.topP.value;
        this.maxTokens.value = config.max_tokens || 2048;

        if (config.batchSizeMode) {
          this.batchSizeMode.value = config.batchSizeMode;
          if (config.batchSizeMode === 'custom' && config.customBatchSize) {
            this.customBatchSize.value = config.customBatchSize;
            this.customBatchSize.classList.remove('hidden');
          }
        }
      }
    } catch (_error) {
      console.error('_error loading model config:', _error);
    }
  }

  /**
   * Save model configuration
   */
  async saveModelConfig() {
    try {
      const config = {
        temperature: Number.parseFloat(this.temperature.value),
        top_p: Number.parseFloat(this.topP.value),
        max_tokens: Number.parseInt(this.maxTokens.value),
        batchSizeMode: this.batchSizeMode.value,
        customBatchSize:
          this.batchSizeMode.value === 'custom' ? Number.parseInt(this.customBatchSize.value) : null
      };

      const response = await chrome.runtime.sendMessage({
        action: 'setCustomModelConfig',
        data: { config }
      });

      if (response?.success) {
        this.showSuccess('Model configuration saved successfully');
      }
    } catch (_error) {
      console.error('_error saving model config:', _error);
      this.showError('Failed to save model configuration');
    }
  }

  /**
   * Reset model configuration to defaults
   */
  resetModelConfig() {
    this.temperature.value = 1.0;
    this.temperatureValue.textContent = '1.0';
    this.topP.value = 0.95;
    this.topPValue.textContent = '0.95';
    this.maxTokens.value = 2048;
    this.batchSizeMode.value = 'auto';
    this.customBatchSize.classList.add('hidden');

    this.showSuccess('Model configuration reset to defaults');
  }

  /**
   * Run benchmark suite
   */
  async runBenchmark() {
    /* global BenchmarkService */
    try {
      // Get selected options
      const selectedCategories = Array.from(
        document.querySelectorAll('.benchmark-category:checked')
      ).map((cb) => cb.value);
      const selectedProviders = Array.from(
        document.querySelectorAll('.benchmark-provider:checked')
      ).map((cb) => cb.value);
      const batchSize = Number.parseInt(document.getElementById('benchmarkBatchSize').value);

      if (selectedCategories.length === 0) {
        this.showError('Please select at least one test category');
        return;
      }

      if (selectedProviders.length === 0) {
        this.showError('Please select at least one provider to test');
        return;
      }

      // Show progress
      this.runBenchmarkBtn.disabled = true;
      this.benchmarkProgress.classList.remove('hidden');
      this.benchmarkProgressFill.style.width = '0%';
      this.benchmarkProgressText.textContent = 'Starting benchmark suite...';

      // Simulate progress updates
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress = Math.min(progress + 5, 90);
        this.benchmarkProgressFill.style.width = `${progress}%`;
      }, 1000);

      // Run benchmark
      const results = await this.benchmarkService.runBenchmarkSuite({
        providers: selectedProviders,
        testCategories: selectedCategories,
        batchSize: batchSize
      });

      clearInterval(progressInterval);
      this.benchmarkProgressFill.style.width = '100%';
      this.benchmarkProgressText.textContent = 'Benchmark complete!';

      // Display results
      this.displayBenchmarkResults(results);

      setTimeout(() => {
        this.benchmarkProgress.classList.add('hidden');
      }, 2000);
    } catch (_error) {
      console.error('_error running benchmark:', _error);
      this.showError(`Failed to run benchmark: ${_error.message}`);
      this.benchmarkProgress.classList.add('hidden');
    } finally {
      this.runBenchmarkBtn.disabled = false;
    }
  }

  /**
   * Display benchmark results
   */
  displayBenchmarkResults(results) {
    this.benchmarkResults.classList.remove('hidden');

    // Summary metrics
    this.benchmarkAccuracy.textContent = `${results.summary.averageAccuracy.toFixed(1)}%`;
    this.benchmarkSpeed.textContent = `${results.summary.averageSpeed.toFixed(0)}ms`;
    this.benchmarkCost.textContent = `$${results.summary.totalCost.toFixed(4)}`;
    this.benchmarkTests.textContent = results.summary.totalTests;

    // Generate report
    const report = this.benchmarkService.generateReport(results);

    // Best model
    if (report.bestModel) {
      this.bestBenchmarkModel.textContent = `${report.bestModel.provider} / ${report.bestModel.model}`;
      this.bestBenchmarkMetrics.textContent = `${report.bestModel.successRate.toFixed(
        1
      )}% accuracy, ${report.bestModel.averageSpeed.toFixed(
        0
      )}ms avg, $${report.bestModel.totalCost.toFixed(4)} cost`;
    }

    // Comparison table
    this.benchmarkTableBody.innerHTML = '';
    report.comparison.forEach((model) => {
      const row = document.createElement('tr');
      const successClass =
        Number.parseFloat(model.successRate) >= 90
          ? 'high'
          : Number.parseFloat(model.successRate) >= 70
            ? 'medium'
            : 'low';

      row.innerHTML = `
        <td>${model.provider}</td>
        <td><strong>${model.model}</strong></td>
        <td><span class="success-rate ${successClass}">${model.successRate}%</span></td>
        <td>${model.averageSpeed}ms</td>
        <td>$${model.totalCost}</td>
        <td>${model.folderConsistency}%</td>
        <td><strong>${model.score}</strong></td>
      `;
      this.benchmarkTableBody.appendChild(row);
    });

    // Recommendations
    this.benchmarkRecommendationsList.innerHTML = '';
    report.recommendations.forEach((rec) => {
      const recDiv = document.createElement('div');
      recDiv.className = 'recommendation-item';

      const icon =
        rec.type === 'best_overall'
          ? '🏆'
          : rec.type === 'fastest'
            ? '⚡'
            : rec.type === 'cheapest'
              ? '💰'
              : rec.type === 'accurate'
                ? '🎯'
                : '📊';

      recDiv.innerHTML = `
        <div class="rec-icon">${icon}</div>
        <div class="rec-content">
          <strong>${rec.message}</strong>
          <p>${rec.details}</p>
        </div>
      `;
      this.benchmarkRecommendationsList.appendChild(recDiv);
    });

    // Refresh history
    this.loadBenchmarkHistory();
  }

  /**
   * Load benchmark history
   */
  async loadBenchmarkHistory() {
    try {
      const limit = Number.parseInt(this.benchmarkHistoryLimit.value);
      const history = await this.benchmarkService.getHistory(limit);

      if (history.length === 0) {
        this.benchmarkHistoryList.innerHTML =
          '<p>No benchmark history available. Run a benchmark to get started.</p>';
        return;
      }

      let html = '<div class="history-items">';
      history.forEach((result, index) => {
        const date = new Date(result.timestamp).toLocaleString();
        const bestModel = this.benchmarkService.generateReport(result).bestModel;

        html += `
          <div class="history-item">
            <div class="history-header">
              <strong>Benchmark #${history.length - index}</strong>
              <span class="history-date">${date}</span>
            </div>
            <div class="history-stats">
              <span>Tests: ${result.summary.totalTests}</span>
              <span>Accuracy: ${result.summary.averageAccuracy.toFixed(1)}%</span>
              <span>Speed: ${result.summary.averageSpeed.toFixed(0)}ms</span>
              <span>Cost: $${result.summary.totalCost.toFixed(4)}</span>
            </div>
            ${
              bestModel
                ? `<div class="history-best">Best: ${bestModel.provider}/${bestModel.model}</div>`
                : ''
            }
          </div>
        `;
      });
      html += '</div>';

      this.benchmarkHistoryList.innerHTML = html;
    } catch (_error) {
      console.error('_error loading benchmark history:', _error);
      this.benchmarkHistoryList.innerHTML = '<p>Error loading history</p>';
    }
  }

  /**
   * Clear benchmark history
   */
  async clearBenchmarkHistory() {
    if (!confirm('Are you sure you want to clear all benchmark history?')) {
      return;
    }

    try {
      await this.benchmarkService.clearHistory();
      this.loadBenchmarkHistory();
      this.showSuccess('Benchmark history cleared');
    } catch (_error) {
      console.error('_error clearing history:', _error);
      this.showError('Failed to clear benchmark history');
    }
  }

  /**
   * Show success message
   */
  showSuccess(message) {
    // Could implement a toast notification system
    alert(message);
  }

  /**
   * Show error message
   */
  showError(message) {
    alert(`Error: ${message}`);
  }
}

// Initialize controller when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new ModelComparisonController();
});

/**
 * BookmarkMind - Model Comparison Service
 * Tracks AI model performance, handles A/B testing, cost tracking, and model recommendations
 */

export class ModelComparisonService {
  constructor() {
    this.storageKey = 'bookmarkMindModelComparison';
    this.costTrackingKey = 'bookmarkMindCostTracking';
  }

  /**
   * Initialize model comparison data
   */
  async initialize() {
    const existing = await this._getModelData();
    if (!existing || !existing.version) {
      await this._resetModelData();
    }
  }

  /**
   * Record model performance metrics
   * @param {Object} metrics - Performance metrics
   */
  async recordModelPerformance(metrics) {
    const data = await this._getModelData();
    const timestamp = Date.now();

    const performance = {
      timestamp,
      model: metrics.model,
      provider: metrics.provider,
      bookmarkType: metrics.bookmarkType || 'unknown',
      successRate: metrics.successRate || 0,
      responseTime: metrics.responseTime || 0,
      inputTokens: metrics.inputTokens || 0,
      outputTokens: metrics.outputTokens || 0,
      totalTokens: (metrics.inputTokens || 0) + (metrics.outputTokens || 0),
      cost: this._calculateCost(metrics),
      batchSize: metrics.batchSize || 1,
      categoriesGenerated: metrics.categoriesGenerated || 0,
      accuracy: metrics.accuracy || null,
      errorType: metrics.errorType || null
    };

    // Add to performance history
    if (!data.modelPerformance[metrics.model]) {
      data.modelPerformance[metrics.model] = [];
    }
    data.modelPerformance[metrics.model].push(performance);

    // Keep only last 1000 records per model
    if (data.modelPerformance[metrics.model].length > 1000) {
      data.modelPerformance[metrics.model] = data.modelPerformance[metrics.model].slice(-1000);
    }

    // Update aggregate stats
    this._updateAggregateStats(data, performance);

    await this._saveModelData(data);
  }

  /**
   * Record A/B test comparison
   * @param {Object} comparison - A/B test results
   */
  async recordABTest(comparison) {
    const data = await this._getModelData();

    const test = {
      timestamp: Date.now(),
      modelA: comparison.modelA,
      modelB: comparison.modelB,
      bookmarkSample: comparison.bookmarkSample,
      resultsA: comparison.resultsA,
      resultsB: comparison.resultsB,
      userPreference: comparison.userPreference || null,
      accuracyA: comparison.accuracyA || null,
      accuracyB: comparison.accuracyB || null,
      speedA: comparison.speedA || null,
      speedB: comparison.speedB || null,
      costA: comparison.costA || null,
      costB: comparison.costB || null
    };

    data.abTests.push(test);

    // Keep only last 100 A/B tests
    if (data.abTests.length > 100) {
      data.abTests = data.abTests.slice(-100);
    }

    await this._saveModelData(data);
  }

  /**
   * Track API cost
   * @param {Object} costData - Cost information
   */
  async trackCost(costData) {
    const costTracking = await this._getCostTracking();
    const timestamp = Date.now();

    const cost = {
      timestamp,
      model: costData.model,
      provider: costData.provider,
      inputTokens: costData.inputTokens || 0,
      outputTokens: costData.outputTokens || 0,
      totalTokens: (costData.inputTokens || 0) + (costData.outputTokens || 0),
      estimatedCost: this._calculateCost(costData)
    };

    // Add to history
    costTracking.costHistory.push(cost);

    // Update totals
    costTracking.totalInputTokens += cost.inputTokens;
    costTracking.totalOutputTokens += cost.outputTokens;
    costTracking.totalCost += cost.estimatedCost;

    // Update by provider
    if (!costTracking.byProvider[cost.provider]) {
      costTracking.byProvider[cost.provider] = {
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0
      };
    }
    costTracking.byProvider[cost.provider].inputTokens += cost.inputTokens;
    costTracking.byProvider[cost.provider].outputTokens += cost.outputTokens;
    costTracking.byProvider[cost.provider].totalCost += cost.estimatedCost;

    // Keep only last 10000 cost records
    if (costTracking.costHistory.length > 10000) {
      costTracking.costHistory = costTracking.costHistory.slice(-10000);
    }

    await this._saveCostTracking(costTracking);

    // Check budget alerts
    await this._checkBudgetAlerts(costTracking);
  }

  /**
   * Get recommended model for bookmark type
   * @param {string} bookmarkType - Type of bookmark content
   * @param {Array} userHistory - User's categorization history
   * @returns {Promise<Object>} Recommended model and reason
   */
  async getRecommendedModel(bookmarkType = 'general', _userHistory = []) {
    const data = await this._getModelData();
    const _costTracking = await this._getCostTracking();

    // Calculate scores for each model
    const modelScores = {};

    for (const [modelName, performances] of Object.entries(data.modelPerformance)) {
      if (performances.length === 0) continue;

      // Filter by bookmark type if enough data
      const relevantPerf = performances.filter(
        (p) => p.bookmarkType === bookmarkType || bookmarkType === 'general'
      );

      if (relevantPerf.length === 0) continue;

      // Calculate average metrics
      const avgSuccessRate =
        relevantPerf.reduce((sum, p) => sum + p.successRate, 0) / relevantPerf.length;
      const avgSpeed =
        relevantPerf.reduce((sum, p) => sum + p.responseTime, 0) / relevantPerf.length;
      const avgCost = relevantPerf.reduce((sum, p) => sum + p.cost, 0) / relevantPerf.length;
      const totalUsage = relevantPerf.length;

      // Weighted score: success rate (50%), speed (30%), cost (20%)
      const speedScore = Math.max(0, 1 - avgSpeed / 30000); // Normalize to 30s max
      const costScore = Math.max(0, 1 - avgCost / 0.01); // Normalize to $0.01 max

      const score = avgSuccessRate * 0.5 + speedScore * 0.3 + costScore * 0.2;

      modelScores[modelName] = {
        score,
        avgSuccessRate,
        avgSpeed,
        avgCost,
        totalUsage,
        provider: relevantPerf[0].provider
      };
    }

    // Sort by score
    const sortedModels = Object.entries(modelScores).sort((a, b) => b[1].score - a[1].score);

    if (sortedModels.length === 0) {
      // No history, return default recommendation
      return {
        model: 'gemini-2.5-flash',
        provider: 'gemini',
        reason: 'Default recommendation (no performance history)',
        confidence: 'low'
      };
    }

    const [bestModel, metrics] = sortedModels[0];

    // Determine reason
    let reason = 'Best overall performance';
    if (metrics.avgSuccessRate >= 0.95) {
      reason = 'Highest success rate';
    } else if (metrics.avgSpeed < 2000) {
      reason = 'Fastest response time';
    } else if (metrics.avgCost < 0.001) {
      reason = 'Most cost-effective';
    }

    // Determine confidence based on sample size
    let confidence = 'low';
    if (metrics.totalUsage >= 50) confidence = 'high';
    else if (metrics.totalUsage >= 20) confidence = 'medium';

    return {
      model: bestModel,
      provider: metrics.provider,
      reason,
      confidence,
      metrics: {
        successRate: Math.round(metrics.avgSuccessRate * 100),
        avgSpeed: Math.round(metrics.avgSpeed),
        avgCost: metrics.avgCost.toFixed(4),
        totalUsage: metrics.totalUsage
      }
    };
  }

  /**
   * Get model comparison dashboard data
   * @returns {Promise<Object>} Dashboard data
   */
  async getComparisonDashboard() {
    const data = await this._getModelData();
    const costTracking = await this._getCostTracking();

    const dashboard = {
      overview: {
        totalModelsTracked: Object.keys(data.modelPerformance).length,
        totalTests: data.abTests.length,
        totalCost: costTracking.totalCost.toFixed(4),
        totalTokens: costTracking.totalInputTokens + costTracking.totalOutputTokens
      },
      modelComparison: [],
      costBreakdown: {
        byProvider: costTracking.byProvider,
        recent: this._getRecentCosts(costTracking.costHistory)
      },
      recommendations: {},
      abTestSummary: this._summarizeABTests(data.abTests)
    };

    // Build model comparison data
    for (const [modelName, performances] of Object.entries(data.modelPerformance)) {
      if (performances.length === 0) continue;

      const stats = this._calculateModelStats(performances);
      dashboard.modelComparison.push({
        model: modelName,
        provider: performances[0].provider,
        ...stats
      });
    }

    // Sort by success rate
    dashboard.modelComparison.sort((a, b) => b.successRate - a.successRate);

    // Get recommendations for common bookmark types
    const bookmarkTypes = ['general', 'technical', 'news', 'shopping', 'social'];
    for (const type of bookmarkTypes) {
      dashboard.recommendations[type] = await this.getRecommendedModel(type);
    }

    return dashboard;
  }

  /**
   * Get cost tracking report
   * @param {string} period - Time period ('day', 'week', 'month', 'all')
   * @returns {Promise<Object>} Cost report
   */
  async getCostReport(period = 'all') {
    const costTracking = await this._getCostTracking();
    const now = Date.now();

    const periodMs = {
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      all: Number.POSITIVE_INFINITY
    };

    const startTime = now - (periodMs[period] || Number.POSITIVE_INFINITY);
    const periodCosts = costTracking.costHistory.filter((c) => c.timestamp >= startTime);

    const totalCost = periodCosts.reduce((sum, c) => sum + c.estimatedCost, 0);
    const totalTokens = periodCosts.reduce((sum, c) => sum + c.totalTokens, 0);

    // Group by provider
    const byProvider = {};
    for (const cost of periodCosts) {
      if (!byProvider[cost.provider]) {
        byProvider[cost.provider] = {
          cost: 0,
          tokens: 0,
          calls: 0
        };
      }
      byProvider[cost.provider].cost += cost.estimatedCost;
      byProvider[cost.provider].tokens += cost.totalTokens;
      byProvider[cost.provider].calls++;
    }

    // Group by day for trending
    const byDay = {};
    for (const cost of periodCosts) {
      const day = new Date(cost.timestamp).toISOString().split('T')[0];
      if (!byDay[day]) {
        byDay[day] = { cost: 0, tokens: 0, calls: 0 };
      }
      byDay[day].cost += cost.estimatedCost;
      byDay[day].tokens += cost.totalTokens;
      byDay[day].calls++;
    }

    return {
      period,
      totalCost: totalCost.toFixed(4),
      totalTokens,
      totalCalls: periodCosts.length,
      avgCostPerCall: periodCosts.length > 0 ? (totalCost / periodCosts.length).toFixed(6) : 0,
      byProvider,
      byDay,
      budgetStatus: this._getBudgetStatus(costTracking)
    };
  }

  /**
   * Set budget alert threshold
   * @param {Object} budget - Budget configuration
   */
  async setBudgetAlert(budget) {
    const costTracking = await this._getCostTracking();

    costTracking.budgetAlert = {
      enabled: budget.enabled !== false,
      dailyLimit: budget.dailyLimit || null,
      weeklyLimit: budget.weeklyLimit || null,
      monthlyLimit: budget.monthlyLimit || null,
      alertThreshold: budget.alertThreshold || 0.8
    };

    await this._saveCostTracking(costTracking);
  }

  /**
   * Calculate cost based on token usage and model pricing
   * @param {Object} data - Usage data with model, inputTokens, outputTokens
   * @returns {number} Estimated cost in USD
   * @private
   */
  _calculateCost(data) {
    const pricing = {
      // Gemini pricing
      'gemini-2.5-pro': { input: 1.25, output: 5.0 },
      'gemini-2.5-flash-preview-09-2025': { input: 0.075, output: 0.3 },
      'gemini-2.5-flash': { input: 0.075, output: 0.3 },
      'gemini-2.5-flash-image': { input: 0.0375, output: 0.15 },
      'gemini-2.0-flash': { input: 0.0375, output: 0.15 },
      'gemini-2.5-flash-lite-preview-09-2025': {
        input: 0.02,
        output: 0.08
      },
      'gemini-2.5-flash-lite': { input: 0.02, output: 0.08 },

      // Cerebras pricing
      'gpt-oss-120b': { input: 0.6, output: 0.6 },
      'llama-3.3-70b': { input: 0.6, output: 0.6 },
      'qwen-3-32b': { input: 0.1, output: 0.1 },
      'llama3.1-8b': { input: 0.1, output: 0.1 },

      // Groq pricing (free tier)
      'openai/gpt-oss-120b': { input: 0.0, output: 0.0 },
      'llama-3.3-70b-versatile': { input: 0.0, output: 0.0 },
      'qwen/qwen3-32b': { input: 0.0, output: 0.0 },
      'openai/gpt-oss-20b': { input: 0.0, output: 0.0 },
      'llama-3.1-8b-instant': { input: 0.0, output: 0.0 }
    };

    const modelPricing = pricing[data.model] || { input: 0.1, output: 0.3 };
    const inputTokens = data.inputTokens || 0;
    const outputTokens = data.outputTokens || 0;

    // Cost per 1M tokens
    const inputCost = (inputTokens / 1000000) * modelPricing.input;
    const outputCost = (outputTokens / 1000000) * modelPricing.output;

    return inputCost + outputCost;
  }

  /**
   * Update aggregate statistics
   * @private
   */
  _updateAggregateStats(data, performance) {
    const modelName = performance.model;

    if (!data.aggregateStats[modelName]) {
      data.aggregateStats[modelName] = {
        totalCalls: 0,
        successfulCalls: 0,
        totalResponseTime: 0,
        totalCost: 0,
        totalTokens: 0
      };
    }

    const stats = data.aggregateStats[modelName];
    stats.totalCalls++;
    if (performance.successRate > 0.5) stats.successfulCalls++;
    stats.totalResponseTime += performance.responseTime;
    stats.totalCost += performance.cost;
    stats.totalTokens += performance.totalTokens;
  }

  /**
   * Calculate model statistics
   * @private
   */
  _calculateModelStats(performances) {
    const totalCalls = performances.length;
    const _successfulCalls = performances.filter((p) => p.successRate >= 0.5).length;
    const avgResponseTime = performances.reduce((sum, p) => sum + p.responseTime, 0) / totalCalls;
    const totalCost = performances.reduce((sum, p) => sum + p.cost, 0);
    const avgSuccessRate = performances.reduce((sum, p) => sum + p.successRate, 0) / totalCalls;

    return {
      totalCalls,
      successRate: Math.round(avgSuccessRate * 100),
      avgSpeed: Math.round(avgResponseTime),
      totalCost: totalCost.toFixed(4),
      avgCostPerCall: (totalCost / totalCalls).toFixed(6)
    };
  }

  /**
   * Get recent costs for trending
   * @private
   */
  _getRecentCosts(costHistory) {
    const now = Date.now();
    const last7Days = now - 7 * 24 * 60 * 60 * 1000;

    return costHistory.filter((c) => c.timestamp >= last7Days).slice(-50);
  }

  /**
   * Summarize A/B test results
   * @private
   */
  _summarizeABTests(abTests) {
    if (abTests.length === 0) {
      return { totalTests: 0, preferences: {} };
    }

    const preferences = {};
    let totalPreferences = 0;

    for (const test of abTests) {
      if (test.userPreference) {
        preferences[test.userPreference] = (preferences[test.userPreference] || 0) + 1;
        totalPreferences++;
      }
    }

    return {
      totalTests: abTests.length,
      testsWithPreference: totalPreferences,
      preferences
    };
  }

  /**
   * Check budget alerts
   * @private
   */
  async _checkBudgetAlerts(costTracking) {
    if (!costTracking.budgetAlert || !costTracking.budgetAlert.enabled) {
      return;
    }

    const now = Date.now();
    const threshold = costTracking.budgetAlert.alertThreshold;

    // Check daily limit
    if (costTracking.budgetAlert.dailyLimit) {
      const dayStart = new Date(now).setHours(0, 0, 0, 0);
      const todayCosts = costTracking.costHistory.filter((c) => c.timestamp >= dayStart);
      const todayTotal = todayCosts.reduce((sum, c) => sum + c.estimatedCost, 0);

      if (todayTotal >= costTracking.budgetAlert.dailyLimit * threshold) {
        await this._sendBudgetAlert('daily', todayTotal, costTracking.budgetAlert.dailyLimit);
      }
    }

    // Check weekly limit
    if (costTracking.budgetAlert.weeklyLimit) {
      const weekStart = now - 7 * 24 * 60 * 60 * 1000;
      const weekCosts = costTracking.costHistory.filter((c) => c.timestamp >= weekStart);
      const weekTotal = weekCosts.reduce((sum, c) => sum + c.estimatedCost, 0);

      if (weekTotal >= costTracking.budgetAlert.weeklyLimit * threshold) {
        await this._sendBudgetAlert('weekly', weekTotal, costTracking.budgetAlert.weeklyLimit);
      }
    }

    // Check monthly limit
    if (costTracking.budgetAlert.monthlyLimit) {
      const monthStart = now - 30 * 24 * 60 * 60 * 1000;
      const monthCosts = costTracking.costHistory.filter((c) => c.timestamp >= monthStart);
      const monthTotal = monthCosts.reduce((sum, c) => sum + c.estimatedCost, 0);

      if (monthTotal >= costTracking.budgetAlert.monthlyLimit * threshold) {
        await this._sendBudgetAlert('monthly', monthTotal, costTracking.budgetAlert.monthlyLimit);
      }
    }
  }

  /**
   * Send budget alert notification
   * @private
   */
  async _sendBudgetAlert(period, current, limit) {
    const percentage = Math.round((current / limit) * 100);
    console.warn(
      `⚠️ Budget Alert: ${period} spending at ${percentage}% ($${current.toFixed(
        4
      )} / $${limit.toFixed(2)})`
    );

    // Send message to background script for notification
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        await chrome.runtime.sendMessage({
          type: 'BUDGET_ALERT',
          period,
          current: current.toFixed(4),
          limit: limit.toFixed(2),
          percentage
        });
      } catch (_error) {
        console.error('Failed to send budget alert:', _error);
      }
    }
  }

  /**
   * Get budget status
   * @private
   */
  _getBudgetStatus(costTracking) {
    if (!costTracking.budgetAlert || !costTracking.budgetAlert.enabled) {
      return { enabled: false };
    }

    const now = Date.now();
    const status = { enabled: true, alerts: [] };

    // Daily status
    if (costTracking.budgetAlert.dailyLimit) {
      const dayStart = new Date(now).setHours(0, 0, 0, 0);
      const todayCosts = costTracking.costHistory.filter((c) => c.timestamp >= dayStart);
      const todayTotal = todayCosts.reduce((sum, c) => sum + c.estimatedCost, 0);
      const percentage = (todayTotal / costTracking.budgetAlert.dailyLimit) * 100;

      status.daily = {
        spent: todayTotal.toFixed(4),
        limit: costTracking.budgetAlert.dailyLimit.toFixed(2),
        percentage: Math.round(percentage),
        remaining: (costTracking.budgetAlert.dailyLimit - todayTotal).toFixed(4)
      };
    }

    // Weekly status
    if (costTracking.budgetAlert.weeklyLimit) {
      const weekStart = now - 7 * 24 * 60 * 60 * 1000;
      const weekCosts = costTracking.costHistory.filter((c) => c.timestamp >= weekStart);
      const weekTotal = weekCosts.reduce((sum, c) => sum + c.estimatedCost, 0);
      const percentage = (weekTotal / costTracking.budgetAlert.weeklyLimit) * 100;

      status.weekly = {
        spent: weekTotal.toFixed(4),
        limit: costTracking.budgetAlert.weeklyLimit.toFixed(2),
        percentage: Math.round(percentage),
        remaining: (costTracking.budgetAlert.weeklyLimit - weekTotal).toFixed(4)
      };
    }

    // Monthly status
    if (costTracking.budgetAlert.monthlyLimit) {
      const monthStart = now - 30 * 24 * 60 * 60 * 1000;
      const monthCosts = costTracking.costHistory.filter((c) => c.timestamp >= monthStart);
      const monthTotal = monthCosts.reduce((sum, c) => sum + c.estimatedCost, 0);
      const percentage = (monthTotal / costTracking.budgetAlert.monthlyLimit) * 100;

      status.monthly = {
        spent: monthTotal.toFixed(4),
        limit: costTracking.budgetAlert.monthlyLimit.toFixed(2),
        percentage: Math.round(percentage),
        remaining: (costTracking.budgetAlert.monthlyLimit - monthTotal).toFixed(4)
      };
    }

    return status;
  }

  /**
   * Get model data from storage
   * @private
   */
  async _getModelData() {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      return result[this.storageKey] || this._getDefaultModelData();
    } catch (_error) {
      console.error('_error getting model data:', _error);
      return this._getDefaultModelData();
    }
  }

  /**
   * Save model data to storage
   * @private
   */
  async _saveModelData(data) {
    try {
      data.lastUpdated = Date.now();
      await chrome.storage.local.set({ [this.storageKey]: data });
    } catch (_error) {
      console.error('_error saving model data:', _error);
    }
  }

  /**
   * Reset model data to defaults
   * @private
   */
  async _resetModelData() {
    const defaults = this._getDefaultModelData();
    defaults.firstUsed = Date.now();
    await this._saveModelData(defaults);
  }

  /**
   * Get default model data structure
   * @private
   */
  _getDefaultModelData() {
    return {
      version: '1.0',
      firstUsed: Date.now(),
      lastUpdated: Date.now(),
      modelPerformance: {},
      aggregateStats: {},
      abTests: []
    };
  }

  /**
   * Get cost tracking from storage
   * @private
   */
  async _getCostTracking() {
    try {
      const result = await chrome.storage.local.get([this.costTrackingKey]);
      return result[this.costTrackingKey] || this._getDefaultCostTracking();
    } catch (_error) {
      console.error('_error getting cost tracking:', _error);
      return this._getDefaultCostTracking();
    }
  }

  /**
   * Save cost tracking to storage
   * @private
   */
  async _saveCostTracking(data) {
    try {
      data.lastUpdated = Date.now();
      await chrome.storage.local.set({ [this.costTrackingKey]: data });
    } catch (_error) {
      console.error('_error saving cost tracking:', _error);
    }
  }

  /**
   * Get default cost tracking structure
   * @private
   */
  _getDefaultCostTracking() {
    return {
      version: '1.0',
      firstTracked: Date.now(),
      lastUpdated: Date.now(),
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      costHistory: [],
      byProvider: {},
      budgetAlert: {
        enabled: false,
        dailyLimit: null,
        weeklyLimit: null,
        monthlyLimit: null,
        alertThreshold: 0.8
      }
    };
  }
}

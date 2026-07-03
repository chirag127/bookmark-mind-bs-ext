/**
 * BookmarkMind - Performance Monitor
 * Tracks and analyzes system performance metrics
 */

export class PerformanceMonitor {
  constructor() {
    this.storageKey = 'bookmarkMindPerformance';
    this.maxHistoryPoints = 100;
    this.analyticsService = null;
    this.rateLimitStorageKey = 'bookmarkMindRateLimits';
    this.rateLimitWindowMs = 60000;
    this.requestQueue = [];
  }

  /**
   * Initialize performance monitor
   */
  async initialize() {
    if (typeof AnalyticsService !== 'undefined') {
      this.analyticsService = new AnalyticsService();
    }
    await this._cleanupOldRateLimitData();
  }

  /**
   * Record memory usage snapshot
   */
  async recordMemoryUsage() {
    if (performance.memory) {
      const memory = {
        timestamp: Date.now(),
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
      };

      const perfData = await this._getPerformanceData();
      perfData.memoryHistory.push(memory);

      if (perfData.memoryHistory.length > this.maxHistoryPoints) {
        perfData.memoryHistory = perfData.memoryHistory.slice(-this.maxHistoryPoints);
      }

      await this._savePerformanceData(perfData);
      return memory;
    }
    return null;
  }

  /**
   * Get current memory usage
   */
  getCurrentMemoryUsage() {
    if (performance.memory) {
      return {
        usedMB: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
        totalMB: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
        limitMB: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024),
        usagePercent: Math.round(
          (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100
        )
      };
    }
    return null;
  }

  /**
   * Get performance dashboard data
   */
  async getPerformanceDashboard() {
    if (!this.analyticsService) {
      await this.initialize();
    }

    const analytics = await this.analyticsService.exportAnalytics();
    const perfData = await this._getPerformanceData();
    const insights = await this.analyticsService.getPerformanceInsights();

    // Calculate metrics
    const dashboard = {
      overview: {
        avgCategorizationTime: this._calculateAvgCategorizationTime(analytics.sessions),
        totalProcessed: analytics.totalCategorizations,
        successRate: this._calculateSuccessRate(
          analytics.totalCategorizations,
          analytics.totalCategorizations + analytics.totalErrors
        ),
        lastUpdated: Date.now()
      },
      providerComparison: this._getProviderComparison(analytics.apiByProvider, analytics.apiCalls),
      batchEfficiency: this._getBatchEfficiency(analytics.apiCalls),
      memoryStats: this._getMemoryStats(perfData.memoryHistory),
      performanceHistory: this._getPerformanceHistory(analytics.sessions),
      insights: insights,
      currentMemory: this.getCurrentMemoryUsage(),
      rateLimits: await this.getRateLimitDashboard()
    };

    return dashboard;
  }

  /**
   * Calculate average categorization time
   * @private
   */
  _calculateAvgCategorizationTime(sessions) {
    if (sessions.length === 0) return 0;
    const recentSessions = sessions.slice(-20);
    const total = recentSessions.reduce((sum, s) => sum + (s.avgTimePerBookmark || 0), 0);
    return Math.round(total / recentSessions.length);
  }

  /**
   * Calculate success rate
   * @private
   */
  _calculateSuccessRate(successful, total) {
    if (total === 0) return 100;
    return Math.round((successful / total) * 100);
  }

  /**
   * Get provider comparison data
   * @private
   */
  _getProviderComparison(apiByProvider, apiCalls) {
    const comparison = {};
    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;
    const last7d = now - 7 * 24 * 60 * 60 * 1000;

    for (const [provider, data] of Object.entries(apiByProvider)) {
      const providerCalls = apiCalls.filter((c) => c.provider === provider);
      const recentCalls = providerCalls.filter((c) => c.timestamp >= last24h);
      const weekCalls = providerCalls.filter((c) => c.timestamp >= last7d);

      comparison[provider] = {
        totalCalls: data.total,
        successRate: Math.round((data.successful / data.total) * 100),
        avgResponseTime: data.avgResponseTime || 0,
        recentPerformance: {
          last24h: this._calculateProviderMetrics(recentCalls),
          last7d: this._calculateProviderMetrics(weekCalls)
        },
        totalTokens: data.totalTokens
      };
    }

    return comparison;
  }

  /**
   * Calculate provider metrics for a set of calls
   * @private
   */
  _calculateProviderMetrics(calls) {
    if (calls.length === 0) {
      return { calls: 0, avgResponseTime: 0, successRate: 100 };
    }

    const successful = calls.filter((c) => c.success).length;
    const totalResponseTime = calls.reduce((sum, c) => sum + c.responseTime, 0);

    return {
      calls: calls.length,
      avgResponseTime: Math.round(totalResponseTime / calls.length),
      successRate: Math.round((successful / calls.length) * 100)
    };
  }

  /**
   * Get batch processing efficiency metrics
   * @private
   */
  _getBatchEfficiency(apiCalls) {
    const batchCalls = apiCalls.filter((c) => c.batchSize && c.batchSize > 1);

    if (batchCalls.length === 0) {
      return {
        avgBatchSize: 0,
        avgBatchTime: 0,
        avgTimePerItem: 0,
        totalBatches: 0,
        efficiencyScore: 0
      };
    }

    const totalBatchSize = batchCalls.reduce((sum, c) => sum + c.batchSize, 0);
    const totalBatchTime = batchCalls.reduce((sum, c) => sum + c.responseTime, 0);
    const avgBatchSize = totalBatchSize / batchCalls.length;
    const avgBatchTime = totalBatchTime / batchCalls.length;
    const avgTimePerItem = avgBatchSize > 0 ? avgBatchTime / avgBatchSize : 0;

    // Calculate efficiency score (higher is better)
    // Based on: larger batches with lower per-item time
    const efficiencyScore =
      avgBatchSize > 0 && avgTimePerItem > 0
        ? Math.round((avgBatchSize / avgTimePerItem) * 1000)
        : 0;

    return {
      avgBatchSize: Math.round(avgBatchSize),
      avgBatchTime: Math.round(avgBatchTime),
      avgTimePerItem: Math.round(avgTimePerItem),
      totalBatches: batchCalls.length,
      efficiencyScore: efficiencyScore
    };
  }

  /**
   * Get memory statistics
   * @private
   */
  _getMemoryStats(memoryHistory) {
    if (memoryHistory.length === 0) {
      return {
        current: null,
        average: 0,
        peak: 0,
        trend: 'stable'
      };
    }

    const recent = memoryHistory.slice(-1)[0];
    const avgUsed =
      memoryHistory.reduce((sum, m) => sum + m.usedJSHeapSize, 0) / memoryHistory.length;
    const peakUsed = Math.max(...memoryHistory.map((m) => m.usedJSHeapSize));

    // Calculate trend
    let trend = 'stable';
    if (memoryHistory.length >= 10) {
      const firstHalf = memoryHistory.slice(0, Math.floor(memoryHistory.length / 2));
      const secondHalf = memoryHistory.slice(Math.floor(memoryHistory.length / 2));

      const avgFirst = firstHalf.reduce((sum, m) => sum + m.usedJSHeapSize, 0) / firstHalf.length;
      const avgSecond =
        secondHalf.reduce((sum, m) => sum + m.usedJSHeapSize, 0) / secondHalf.length;

      if (avgSecond > avgFirst * 1.2) {
        trend = 'increasing';
      } else if (avgSecond < avgFirst * 0.8) {
        trend = 'decreasing';
      }
    }

    return {
      current: recent
        ? {
            usedMB: Math.round(recent.usedJSHeapSize / 1024 / 1024),
            totalMB: Math.round(recent.totalJSHeapSize / 1024 / 1024),
            limitMB: Math.round(recent.jsHeapSizeLimit / 1024 / 1024),
            timestamp: recent.timestamp
          }
        : null,
      averageMB: Math.round(avgUsed / 1024 / 1024),
      peakMB: Math.round(peakUsed / 1024 / 1024),
      trend: trend
    };
  }

  /**
   * Get performance history for graphing
   * @private
   */
  _getPerformanceHistory(sessions) {
    const history = [];
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    // Get sessions from last 30 days
    const recentSessions = sessions.filter((s) => s.timestamp >= thirtyDaysAgo);

    // Group by day
    const dayGroups = {};
    recentSessions.forEach((session) => {
      const day = new Date(session.timestamp).toISOString().split('T')[0];
      if (!dayGroups[day]) {
        dayGroups[day] = [];
      }
      dayGroups[day].push(session);
    });

    // Calculate daily averages
    for (const [day, daySessions] of Object.entries(dayGroups)) {
      const avgTime =
        daySessions.reduce((sum, s) => sum + s.avgTimePerBookmark, 0) / daySessions.length;
      const totalProcessed = daySessions.reduce((sum, s) => sum + s.bookmarksProcessed, 0);
      const avgSuccessRate =
        daySessions.reduce((sum, s) => sum + s.successRate, 0) / daySessions.length;

      history.push({
        date: day,
        avgCategorizationTime: Math.round(avgTime),
        bookmarksProcessed: totalProcessed,
        successRate: Math.round(avgSuccessRate),
        sessions: daySessions.length
      });
    }

    return history.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  /**
   * Get performance data from storage
   * @private
   */
  async _getPerformanceData() {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      return result[this.storageKey] || this._getDefaultPerformanceData();
    } catch (_error) {
      console.error('_error getting performance data:', _error);
      return this._getDefaultPerformanceData();
    }
  }

  /**
   * Save performance data to storage
   * @private
   */
  async _savePerformanceData(data) {
    try {
      await chrome.storage.local.set({ [this.storageKey]: data });
    } catch (_error) {
      console.error('_error saving performance data:', _error);
    }
  }

  /**
   * Get default performance data structure
   * @private
   */
  _getDefaultPerformanceData() {
    return {
      version: '1.0',
      created: Date.now(),
      memoryHistory: []
    };
  }

  /**
   * Record API request for rate limiting
   * @param {string} provider - Provider name
   * @param {boolean} success - Whether request succeeded
   * @param {boolean} throttled - Whether request was throttled
   * @param {boolean} rejected - Whether request was rejected
   */
  async recordApiRequest(provider, success = true, throttled = false, rejected = false) {
    const rateLimitData = await this._getRateLimitData();
    const timestamp = Date.now();

    if (!rateLimitData.providers[provider]) {
      rateLimitData.providers[provider] = {
        requests: [],
        throttledCount: 0,
        rejectedCount: 0,
        totalRequests: 0,
        limits: this._getProviderLimits(provider)
      };
    }

    const providerData = rateLimitData.providers[provider];

    providerData.requests.push({
      timestamp,
      success,
      throttled,
      rejected
    });

    providerData.totalRequests++;
    if (throttled) providerData.throttledCount++;
    if (rejected) providerData.rejectedCount++;

    await this._cleanupOldRequests(providerData);
    await this._saveRateLimitData(rateLimitData);

    const currentRpm = this._calculateRequestsPerMinute(providerData.requests);
    const limitThreshold = providerData.limits.requestsPerMinute * 0.8;

    if (currentRpm >= limitThreshold) {
      await this._recordRateLimitAlert(provider, currentRpm, providerData.limits.requestsPerMinute);
    }
  }

  /**
   * Get rate limit dashboard data
   * @returns {Promise<Object>} Rate limit dashboard data
   */
  async getRateLimitDashboard() {
    const rateLimitData = await this._getRateLimitData();
    const dashboard = {};

    for (const [provider, data] of Object.entries(rateLimitData.providers)) {
      const currentRpm = this._calculateRequestsPerMinute(data.requests);
      const utilizationPercent = Math.round((currentRpm / data.limits.requestsPerMinute) * 100);
      const recentHistory = this._getRpmHistory(data.requests);

      dashboard[provider] = {
        currentRpm,
        maxRpm: data.limits.requestsPerMinute,
        utilizationPercent,
        status: this._getRateLimitStatus(utilizationPercent),
        throttledCount: data.throttledCount,
        rejectedCount: data.rejectedCount,
        totalRequests: data.totalRequests,
        queueDepth: this._getQueueDepth(provider),
        rpmHistory: recentHistory,
        recentAlerts: this._getRecentAlerts(rateLimitData.alerts, provider)
      };
    }

    return dashboard;
  }

  /**
   * Get historical rate limit events
   * @param {string} provider - Provider name (optional)
   * @param {number} timeRangeMs - Time range in milliseconds (default: 24 hours)
   * @returns {Promise<Array>} Historical events
   */
  async getRateLimitHistory(provider = null, timeRangeMs = 24 * 60 * 60 * 1000) {
    const rateLimitData = await this._getRateLimitData();
    const cutoffTime = Date.now() - timeRangeMs;

    const events = [];

    for (const [providerName, data] of Object.entries(rateLimitData.providers)) {
      if (provider && providerName !== provider) continue;

      data.requests
        .filter((req) => req.timestamp >= cutoffTime)
        .forEach((req) => {
          if (req.throttled || req.rejected) {
            events.push({
              timestamp: req.timestamp,
              provider: providerName,
              type: req.throttled ? 'throttled' : 'rejected',
              success: req.success
            });
          }
        });
    }

    return events.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get provider rate limits
   * @param {string} provider - Provider name
   * @returns {Object} Rate limits
   * @private
   */
  _getProviderLimits(provider) {
    const limits = {
      gemini: { requestsPerMinute: 15, requestsPerDay: 1500 },
      cerebras: { requestsPerMinute: 60, requestsPerDay: 14400 },
      groq: { requestsPerMinute: 30, requestsPerDay: 14400 },
      agentrouter: { requestsPerMinute: 20, requestsPerDay: 10000 }
    };

    return limits[provider] || { requestsPerMinute: 10, requestsPerDay: 1000 };
  }

  /**
   * Calculate requests per minute
   * @param {Array} requests - Request history
   * @returns {number} Requests per minute
   * @private
   */
  _calculateRequestsPerMinute(requests) {
    const now = Date.now();
    const oneMinuteAgo = now - this.rateLimitWindowMs;
    return requests.filter((req) => req.timestamp >= oneMinuteAgo).length;
  }

  /**
   * Get RPM history for charting
   * @param {Array} requests - Request history
   * @returns {Array} RPM history data points
   * @private
   */
  _getRpmHistory(requests) {
    const now = Date.now();
    const history = [];
    const intervalMs = 10000;
    const intervals = 30;

    for (let i = intervals; i >= 0; i--) {
      const endTime = now - i * intervalMs;
      const startTime = endTime - this.rateLimitWindowMs;
      const count = requests.filter(
        (req) => req.timestamp >= startTime && req.timestamp < endTime
      ).length;

      history.push({
        timestamp: endTime,
        rpm: count
      });
    }

    return history;
  }

  /**
   * Get rate limit status
   * @param {number} utilizationPercent - Utilization percentage
   * @returns {string} Status
   * @private
   */
  _getRateLimitStatus(utilizationPercent) {
    if (utilizationPercent >= 90) return 'critical';
    if (utilizationPercent >= 80) return 'warning';
    if (utilizationPercent >= 60) return 'moderate';
    return 'healthy';
  }

  /**
   * Get queue depth for provider
   * @param {string} provider - Provider name
   * @returns {number} Queue depth
   * @private
   */
  _getQueueDepth(provider) {
    return this.requestQueue.filter((req) => req.provider === provider).length;
  }

  /**
   * Record rate limit alert
   * @param {string} provider - Provider name
   * @param {number} currentRpm - Current RPM
   * @param {number} maxRpm - Max RPM
   * @private
   */
  async _recordRateLimitAlert(provider, currentRpm, maxRpm) {
    const rateLimitData = await this._getRateLimitData();

    const alert = {
      timestamp: Date.now(),
      provider,
      currentRpm,
      maxRpm,
      utilizationPercent: Math.round((currentRpm / maxRpm) * 100),
      type: 'approaching_limit'
    };

    if (!rateLimitData.alerts) {
      rateLimitData.alerts = [];
    }

    const lastAlert = rateLimitData.alerts[rateLimitData.alerts.length - 1];
    if (!lastAlert || lastAlert.timestamp < Date.now() - 60000) {
      rateLimitData.alerts.push(alert);

      if (rateLimitData.alerts.length > 100) {
        rateLimitData.alerts = rateLimitData.alerts.slice(-100);
      }

      await this._saveRateLimitData(rateLimitData);
    }
  }

  /**
   * Get recent alerts
   * @param {Array} alerts - All alerts
   * @param {string} provider - Provider name
   * @returns {Array} Recent alerts
   * @private
   */
  _getRecentAlerts(alerts, provider) {
    if (!alerts) return [];

    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return alerts
      .filter((alert) => alert.provider === provider && alert.timestamp >= oneHourAgo)
      .slice(-5);
  }

  /**
   * Cleanup old request data
   * @param {Object} providerData - Provider data
   * @private
   */
  async _cleanupOldRequests(providerData) {
    const cutoffTime = Date.now() - 60 * 60 * 1000;
    providerData.requests = providerData.requests.filter((req) => req.timestamp >= cutoffTime);
  }

  /**
   * Cleanup old rate limit data
   * @private
   */
  async _cleanupOldRateLimitData() {
    const rateLimitData = await this._getRateLimitData();
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;

    for (const provider of Object.values(rateLimitData.providers)) {
      provider.requests = provider.requests.filter((req) => req.timestamp >= cutoffTime);
    }

    if (rateLimitData.alerts) {
      rateLimitData.alerts = rateLimitData.alerts.filter((alert) => alert.timestamp >= cutoffTime);
    }

    await this._saveRateLimitData(rateLimitData);
  }

  /**
   * Get rate limit data from storage
   * @returns {Promise<Object>} Rate limit data
   * @private
   */
  async _getRateLimitData() {
    try {
      const result = await chrome.storage.local.get([this.rateLimitStorageKey]);
      return result[this.rateLimitStorageKey] || this._getDefaultRateLimitData();
    } catch (_error) {
      console.error('_error getting rate limit data:', _error);
      return this._getDefaultRateLimitData();
    }
  }

  /**
   * Save rate limit data to storage
   * @param {Object} data - Rate limit data
   * @private
   */
  async _saveRateLimitData(data) {
    try {
      await chrome.storage.local.set({ [this.rateLimitStorageKey]: data });
    } catch (_error) {
      console.error('_error saving rate limit data:', _error);
    }
  }

  /**
   * Get default rate limit data structure
   * @returns {Object} Default data
   * @private
   */
  _getDefaultRateLimitData() {
    return {
      version: '1.0',
      created: Date.now(),
      providers: {},
      alerts: []
    };
  }
}

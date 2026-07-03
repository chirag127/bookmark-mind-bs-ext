/**
 * BookmarkMind - Analytics Service
 * Tracks and provides metrics for categorization performance and system behavior
 */

export class AnalyticsService {
  constructor() {
    this.storageKey = 'bookmarkMindAnalytics';
    this.sessionKey = 'bookmarkMindSession';
  }

  /**
   * Initialize analytics with default data
   */
  async initialize() {
    const existing = await this._getAnalytics();
    if (!existing || !existing.version) {
      await this._resetAnalytics();
    }
  }

  /**
   * Record a categorization session
   * @param {Object} sessionData - Session metrics
   */
  async recordCategorizationSession(sessionData) {
    const analytics = await this._getAnalytics();

    const session = {
      timestamp: Date.now(),
      bookmarksProcessed: sessionData.processed || 0,
      bookmarksCategorized: sessionData.categorized || 0,
      errors: sessionData.errors || 0,
      duration: sessionData.duration || 0,
      categoriesUsed: sessionData.categories || [],
      successRate: this._calculateSuccessRate(sessionData.categorized, sessionData.processed),
      avgTimePerBookmark: this._calculateAvgTime(sessionData.duration, sessionData.processed),
      mode: sessionData.mode || 'full' // 'full', 'bulk', or 'single'
    };

    analytics.sessions.push(session);
    analytics.totalCategorizations += session.bookmarksCategorized;
    analytics.totalErrors += session.errors;

    // Update category usage stats
    session.categoriesUsed.forEach((category) => {
      analytics.categoryUsage[category] = (analytics.categoryUsage[category] || 0) + 1;
    });

    // Keep only last 100 sessions
    if (analytics.sessions.length > 100) {
      analytics.sessions = analytics.sessions.slice(-100);
    }

    await this._saveAnalytics(analytics);
  }

  /**
   * Record API usage
   * @param {Object} apiData - API call metrics
   */
  async recordApiUsage(apiData) {
    const analytics = await this._getAnalytics();

    const apiCall = {
      timestamp: Date.now(),
      provider: apiData.provider || 'gemini',
      model: apiData.model || 'unknown',
      tokensUsed: apiData.tokensUsed || 0,
      success: apiData.success !== false,
      responseTime: apiData.responseTime || 0,
      batchSize: apiData.batchSize || 1,
      errorType: apiData.errorType || null,
      memoryUsage: apiData.memoryUsage || null
    };

    analytics.apiCalls.push(apiCall);
    analytics.totalApiCalls++;

    if (apiCall.success) {
      analytics.successfulApiCalls++;
    } else {
      analytics.failedApiCalls++;
    }

    // Track by provider
    const providerKey = apiCall.provider;
    if (!analytics.apiByProvider[providerKey]) {
      analytics.apiByProvider[providerKey] = {
        total: 0,
        successful: 0,
        failed: 0,
        totalTokens: 0,
        totalResponseTime: 0,
        avgResponseTime: 0
      };
    }
    analytics.apiByProvider[providerKey].total++;
    analytics.apiByProvider[providerKey].totalTokens += apiCall.tokensUsed;
    analytics.apiByProvider[providerKey].totalResponseTime += apiCall.responseTime;
    analytics.apiByProvider[providerKey].avgResponseTime = Math.round(
      analytics.apiByProvider[providerKey].totalResponseTime /
        analytics.apiByProvider[providerKey].total
    );

    if (apiCall.success) {
      analytics.apiByProvider[providerKey].successful++;
    } else {
      analytics.apiByProvider[providerKey].failed++;
    }

    // Keep only last 1000 API calls
    if (analytics.apiCalls.length > 1000) {
      analytics.apiCalls = analytics.apiCalls.slice(-1000);
    }

    await this._saveAnalytics(analytics);
  }

  /**
   * Record processing time for a specific operation
   * @param {string} operation - Operation name
   * @param {number} duration - Duration in milliseconds
   */
  async recordProcessingTime(operation, duration) {
    const analytics = await this._getAnalytics();

    if (!analytics.processingTimes[operation]) {
      analytics.processingTimes[operation] = [];
    }

    analytics.processingTimes[operation].push({
      timestamp: Date.now(),
      duration
    });

    // Keep only last 100 measurements per operation
    if (analytics.processingTimes[operation].length > 100) {
      analytics.processingTimes[operation] = analytics.processingTimes[operation].slice(-100);
    }

    await this._saveAnalytics(analytics);
  }

  /**
   * Record folder consolidation metrics
   * @param {Object} consolidationData - Consolidation results
   */
  async recordConsolidation(consolidationData) {
    const analytics = await this._getAnalytics();

    const consolidation = {
      timestamp: Date.now(),
      foldersProcessed: consolidationData.foldersProcessed || 0,
      bookmarksMoved: consolidationData.bookmarksMoved || 0,
      foldersRemoved: consolidationData.foldersRemoved || 0,
      consolidationPaths: consolidationData.consolidationPaths || []
    };

    analytics.consolidations.push(consolidation);
    analytics.totalFoldersConsolidated += consolidation.foldersRemoved;
    analytics.totalBookmarksReorganized += consolidation.bookmarksMoved;

    // Keep only last 50 consolidations
    if (analytics.consolidations.length > 50) {
      analytics.consolidations = analytics.consolidations.slice(-50);
    }

    await this._saveAnalytics(analytics);
  }

  /**
   * Get comprehensive analytics report
   * @returns {Promise<Object>} Analytics report
   */
  async getAnalyticsReport() {
    const analytics = await this._getAnalytics();
    const now = Date.now();

    // Calculate various metrics
    const last24h = now - 24 * 60 * 60 * 1000;
    const last7d = now - 7 * 24 * 60 * 60 * 1000;
    const last30d = now - 30 * 24 * 60 * 60 * 1000;

    return {
      overview: {
        totalCategorizations: analytics.totalCategorizations,
        totalErrors: analytics.totalErrors,
        totalApiCalls: analytics.totalApiCalls,
        successfulApiCalls: analytics.successfulApiCalls,
        failedApiCalls: analytics.failedApiCalls,
        totalFoldersConsolidated: analytics.totalFoldersConsolidated,
        totalBookmarksReorganized: analytics.totalBookmarksReorganized,
        overallSuccessRate: this._calculateSuccessRate(
          analytics.totalCategorizations,
          analytics.totalCategorizations + analytics.totalErrors
        )
      },

      recentActivity: {
        last24h: this._getSessionMetrics(analytics.sessions, last24h, now),
        last7d: this._getSessionMetrics(analytics.sessions, last7d, now),
        last30d: this._getSessionMetrics(analytics.sessions, last30d, now)
      },

      categoryStats: {
        usage: analytics.categoryUsage,
        topCategories: this._getTopCategories(analytics.categoryUsage, 10),
        uniqueCategories: Object.keys(analytics.categoryUsage).length
      },

      apiStats: {
        byProvider: analytics.apiByProvider,
        recentCalls: {
          last24h: this._getApiMetrics(analytics.apiCalls, last24h, now),
          last7d: this._getApiMetrics(analytics.apiCalls, last7d, now),
          last30d: this._getApiMetrics(analytics.apiCalls, last30d, now)
        },
        avgResponseTime: this._calculateAvgResponseTime(analytics.apiCalls)
      },

      performance: {
        avgProcessingTimes: this._calculateAvgProcessingTimes(analytics.processingTimes),
        recentProcessingTimes: this._getRecentProcessingTimes(analytics.processingTimes)
      },

      consolidation: {
        totalConsolidations: analytics.consolidations.length,
        totalFoldersRemoved: analytics.totalFoldersConsolidated,
        totalBookmarksMoved: analytics.totalBookmarksReorganized,
        recent: analytics.consolidations.slice(-10)
      },

      sessions: analytics.sessions.slice(-20), // Last 20 sessions

      metadata: {
        firstUsed: analytics.firstUsed,
        lastUpdated: analytics.lastUpdated,
        version: analytics.version
      }
    };
  }

  /**
   * Get success rate percentage
   * @param {number} successful - Successful operations
   * @param {number} total - Total operations
   * @returns {number} Success rate percentage
   */
  _calculateSuccessRate(successful, total) {
    if (total === 0) return 0;
    return Math.round((successful / total) * 100);
  }

  /**
   * Calculate average time per operation
   * @param {number} totalDuration - Total duration
   * @param {number} count - Number of operations
   * @returns {number} Average time in milliseconds
   */
  _calculateAvgTime(totalDuration, count) {
    if (count === 0) return 0;
    return Math.round(totalDuration / count);
  }

  /**
   * Get session metrics for a time period
   * @param {Array} sessions - All sessions
   * @param {number} startTime - Period start timestamp
   * @param {number} endTime - Period end timestamp
   * @returns {Object} Period metrics
   */
  _getSessionMetrics(sessions, startTime, endTime) {
    const periodSessions = sessions.filter(
      (s) => s.timestamp >= startTime && s.timestamp <= endTime
    );

    const totalProcessed = periodSessions.reduce((sum, s) => sum + s.bookmarksProcessed, 0);
    const totalCategorized = periodSessions.reduce((sum, s) => sum + s.bookmarksCategorized, 0);
    const totalErrors = periodSessions.reduce((sum, s) => sum + s.errors, 0);
    const totalDuration = periodSessions.reduce((sum, s) => sum + s.duration, 0);

    return {
      sessions: periodSessions.length,
      bookmarksProcessed: totalProcessed,
      bookmarksCategorized: totalCategorized,
      errors: totalErrors,
      avgDuration:
        periodSessions.length > 0 ? Math.round(totalDuration / periodSessions.length) : 0,
      successRate: this._calculateSuccessRate(totalCategorized, totalProcessed)
    };
  }

  /**
   * Get API metrics for a time period
   * @param {Array} apiCalls - All API calls
   * @param {number} startTime - Period start timestamp
   * @param {number} endTime - Period end timestamp
   * @returns {Object} Period metrics
   */
  _getApiMetrics(apiCalls, startTime, endTime) {
    const periodCalls = apiCalls.filter((c) => c.timestamp >= startTime && c.timestamp <= endTime);

    const successful = periodCalls.filter((c) => c.success).length;
    const failed = periodCalls.filter((c) => !c.success).length;
    const totalTokens = periodCalls.reduce((sum, c) => sum + c.tokensUsed, 0);
    const totalResponseTime = periodCalls.reduce((sum, c) => sum + c.responseTime, 0);

    return {
      total: periodCalls.length,
      successful,
      failed,
      successRate: this._calculateSuccessRate(successful, periodCalls.length),
      totalTokens,
      avgResponseTime:
        periodCalls.length > 0 ? Math.round(totalResponseTime / periodCalls.length) : 0
    };
  }

  /**
   * Get top categories by usage
   * @param {Object} categoryUsage - Category usage map
   * @param {number} limit - Number of top categories
   * @returns {Array} Top categories
   */
  _getTopCategories(categoryUsage, limit) {
    return Object.entries(categoryUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([category, count]) => ({ category, count }));
  }

  /**
   * Calculate average response time for API calls
   * @param {Array} apiCalls - API calls
   * @returns {number} Average response time
   */
  _calculateAvgResponseTime(apiCalls) {
    if (apiCalls.length === 0) return 0;
    const totalTime = apiCalls.reduce((sum, c) => sum + c.responseTime, 0);
    return Math.round(totalTime / apiCalls.length);
  }

  /**
   * Calculate average processing times for each operation
   * @param {Object} processingTimes - Processing times by operation
   * @returns {Object} Average times
   */
  _calculateAvgProcessingTimes(processingTimes) {
    const result = {};

    for (const [operation, times] of Object.entries(processingTimes)) {
      if (times.length > 0) {
        const totalDuration = times.reduce((sum, t) => sum + t.duration, 0);
        result[operation] = Math.round(totalDuration / times.length);
      }
    }

    return result;
  }

  /**
   * Get recent processing times
   * @param {Object} processingTimes - Processing times by operation
   * @returns {Object} Recent times
   */
  _getRecentProcessingTimes(processingTimes) {
    const result = {};

    for (const [operation, times] of Object.entries(processingTimes)) {
      result[operation] = times.slice(-10);
    }

    return result;
  }

  /**
   * Get performance insights and AI-generated recommendations
   * @returns {Promise<Object>} Performance insights
   */
  async getPerformanceInsights() {
    const analytics = await this._getAnalytics();
    const insights = {
      recommendations: [],
      performanceMetrics: {},
      trends: {},
      warnings: []
    };

    // Calculate average categorization time per bookmark
    const recentSessions = analytics.sessions.slice(-20);
    if (recentSessions.length > 0) {
      const avgTimePerBookmark =
        recentSessions.reduce((sum, s) => sum + s.avgTimePerBookmark, 0) / recentSessions.length;
      insights.performanceMetrics.avgCategorizationTime = Math.round(avgTimePerBookmark);
    }

    // Calculate API response time comparison across providers
    const providerPerformance = {};
    for (const [provider, data] of Object.entries(analytics.apiByProvider)) {
      if (data.total > 0) {
        providerPerformance[provider] = {
          avgResponseTime: data.avgResponseTime || 0,
          successRate: Math.round((data.successful / data.total) * 100),
          totalCalls: data.total
        };
      }
    }
    insights.performanceMetrics.providerComparison = providerPerformance;

    // Calculate batch processing efficiency
    const batchCalls = analytics.apiCalls.filter((c) => c.batchSize > 1);
    if (batchCalls.length > 0) {
      const avgBatchSize = batchCalls.reduce((sum, c) => sum + c.batchSize, 0) / batchCalls.length;
      const avgBatchTime =
        batchCalls.reduce((sum, c) => sum + c.responseTime, 0) / batchCalls.length;
      const avgTimePerItem = avgBatchSize > 0 ? avgBatchTime / avgBatchSize : 0;

      insights.performanceMetrics.batchEfficiency = {
        avgBatchSize: Math.round(avgBatchSize),
        avgBatchTime: Math.round(avgBatchTime),
        avgTimePerItem: Math.round(avgTimePerItem)
      };
    }

    // Generate AI recommendations

    // Recommendation: Batch size optimization
    if (batchCalls.length > 0) {
      const avgBatchSize = batchCalls.reduce((sum, c) => sum + c.batchSize, 0) / batchCalls.length;
      if (avgBatchSize < 30) {
        insights.recommendations.push({
          type: 'batch_size',
          priority: 'medium',
          title: 'Increase batch size for better performance',
          description: `Your current average batch size is ${Math.round(avgBatchSize)}. Consider increasing to 50-100 bookmarks per batch for faster processing.`,
          action: 'Increase batch size in settings'
        });
      } else if (avgBatchSize > 100) {
        insights.recommendations.push({
          type: 'batch_size',
          priority: 'low',
          title: 'Consider reducing batch size',
          description: `Your current batch size of ${Math.round(avgBatchSize)} is quite large. If you experience timeouts, try reducing to 50-75 bookmarks per batch.`,
          action: 'Reduce batch size in settings'
        });
      }
    }

    // Recommendation: Provider selection
    const sortedProviders = Object.entries(providerPerformance).sort(
      (a, b) => a[1].avgResponseTime - b[1].avgResponseTime
    );

    if (sortedProviders.length > 1) {
      const fastest = sortedProviders[0];
      const slowest = sortedProviders[sortedProviders.length - 1];

      if (fastest[1].avgResponseTime < slowest[1].avgResponseTime * 0.5) {
        insights.recommendations.push({
          type: 'provider',
          priority: 'high',
          title: `${fastest[0]} is 2x faster than ${slowest[0]}`,
          description: `${fastest[0]} averages ${fastest[1].avgResponseTime}ms response time vs ${slowest[1].avgResponseTime}ms for ${slowest[0]}. Consider using ${fastest[0]} as your primary provider.`,
          action: `Switch to ${fastest[0]} for faster processing`
        });
      }
    }

    // Recommendation: Success rate warnings
    for (const [provider, data] of Object.entries(providerPerformance)) {
      if (data.successRate < 80 && data.totalCalls > 5) {
        insights.warnings.push({
          type: 'error_rate',
          severity: 'high',
          title: `High error rate for ${provider}`,
          description: `${provider} has a ${data.successRate}% success rate. This may indicate API key issues or rate limiting.`,
          action: 'Check API key and rate limits'
        });
      }
    }

    // Recommendation: Performance trends
    if (recentSessions.length >= 10) {
      const firstHalf = recentSessions.slice(0, Math.floor(recentSessions.length / 2));
      const secondHalf = recentSessions.slice(Math.floor(recentSessions.length / 2));

      const avgFirst =
        firstHalf.reduce((sum, s) => sum + s.avgTimePerBookmark, 0) / firstHalf.length;
      const avgSecond =
        secondHalf.reduce((sum, s) => sum + s.avgTimePerBookmark, 0) / secondHalf.length;

      insights.trends.performanceChange = {
        direction: avgSecond < avgFirst ? 'improving' : 'declining',
        percentChange: Math.round(((avgSecond - avgFirst) / avgFirst) * 100)
      };

      if (avgSecond > avgFirst * 1.3) {
        insights.warnings.push({
          type: 'performance_decline',
          severity: 'medium',
          title: 'Performance has declined recently',
          description: `Categorization time has increased by ${Math.round(((avgSecond - avgFirst) / avgFirst) * 100)}%. This may indicate API throttling or network issues.`,
          action: 'Monitor performance and check network connection'
        });
      } else if (avgSecond < avgFirst * 0.7) {
        insights.recommendations.push({
          type: 'performance_improvement',
          priority: 'info',
          title: 'Performance has improved!',
          description: `Categorization time has decreased by ${Math.round(((avgFirst - avgSecond) / avgFirst) * 100)}%. Great job optimizing your workflow!`,
          action: 'Continue current configuration'
        });
      }
    }

    // Recommendation: Memory usage (if available)
    const recentApiCalls = analytics.apiCalls.slice(-50);
    const memoryUsages = recentApiCalls.filter((c) => c.memoryUsage).map((c) => c.memoryUsage);
    if (memoryUsages.length > 0) {
      const avgMemory = memoryUsages.reduce((sum, m) => sum + m, 0) / memoryUsages.length;
      insights.performanceMetrics.avgMemoryUsage = Math.round(avgMemory / 1024 / 1024); // Convert to MB

      if (avgMemory > 100 * 1024 * 1024) {
        // 100 MB
        insights.warnings.push({
          type: 'memory_usage',
          severity: 'medium',
          title: 'High memory usage detected',
          description: `Average memory usage is ${Math.round(avgMemory / 1024 / 1024)}MB. Consider reducing batch size or clearing browser cache.`,
          action: 'Reduce batch size or clear cache'
        });
      }
    }

    return insights;
  }

  /**
   * Export analytics data
   * @returns {Promise<Object>} Analytics data
   */
  async exportAnalytics() {
    return await this._getAnalytics();
  }

  /**
   * Export analytics report in different formats
   * @param {string} format - 'json', 'csv'
   * @param {number} startDate - Start timestamp (optional)
   * @param {number} endDate - End timestamp (optional)
   * @returns {Promise<Object>} Export data
   */
  async exportAnalyticsReport(format = 'json', startDate = null, endDate = null) {
    const analytics = await this._getAnalytics();

    // Filter data by date range
    let filteredSessions = analytics.sessions;
    let filteredApiCalls = analytics.apiCalls;

    if (startDate || endDate) {
      const start = startDate || 0;
      const end = endDate || Date.now();

      filteredSessions = analytics.sessions.filter(
        (s) => s.timestamp >= start && s.timestamp <= end
      );
      filteredApiCalls = analytics.apiCalls.filter(
        (c) => c.timestamp >= start && c.timestamp <= end
      );
    }

    const report = {
      metadata: {
        exportDate: new Date().toISOString(),
        startDate: startDate ? new Date(startDate).toISOString() : 'All time',
        endDate: endDate ? new Date(endDate).toISOString() : 'Present',
        format: format
      },
      summary: {
        totalCategorizations: filteredSessions.reduce((sum, s) => sum + s.bookmarksCategorized, 0),
        totalApiCalls: filteredApiCalls.length,
        totalErrors: filteredSessions.reduce((sum, s) => sum + s.errors, 0),
        avgCategorizationTime: this._calculateAvgTime(
          filteredSessions.reduce((sum, s) => sum + s.duration, 0),
          filteredSessions.length
        )
      },
      sessions: filteredSessions,
      apiCalls: filteredApiCalls,
      providerStats: this._calculateProviderStats(filteredApiCalls)
    };

    if (format === 'csv') {
      return {
        format: 'csv',
        data: this._convertToCSV(report)
      };
    }

    return {
      format: 'json',
      data: report
    };
  }

  /**
   * Calculate provider statistics for filtered API calls
   * @private
   */
  _calculateProviderStats(apiCalls) {
    const stats = {};

    apiCalls.forEach((call) => {
      if (!stats[call.provider]) {
        stats[call.provider] = {
          total: 0,
          successful: 0,
          failed: 0,
          totalResponseTime: 0,
          avgResponseTime: 0,
          totalTokens: 0
        };
      }

      stats[call.provider].total++;
      stats[call.provider].totalTokens += call.tokensUsed;
      stats[call.provider].totalResponseTime += call.responseTime;

      if (call.success) {
        stats[call.provider].successful++;
      } else {
        stats[call.provider].failed++;
      }
    });

    // Calculate averages
    for (const provider in stats) {
      if (stats[provider].total > 0) {
        stats[provider].avgResponseTime = Math.round(
          stats[provider].totalResponseTime / stats[provider].total
        );
      }
    }

    return stats;
  }

  /**
   * Convert report data to CSV format
   * @private
   */
  _convertToCSV(report) {
    const lines = [];

    // Summary section
    lines.push('SUMMARY');
    lines.push('Metric,Value');
    lines.push(`Export Date,${report.metadata.exportDate}`);
    lines.push(`Period,${report.metadata.startDate} to ${report.metadata.endDate}`);
    lines.push(`Total Categorizations,${report.summary.totalCategorizations}`);
    lines.push(`Total API Calls,${report.summary.totalApiCalls}`);
    lines.push(`Total Errors,${report.summary.totalErrors}`);
    lines.push(`Avg Categorization Time (ms),${report.summary.avgCategorizationTime}`);
    lines.push('');

    // Provider statistics
    lines.push('PROVIDER STATISTICS');
    lines.push('Provider,Total Calls,Successful,Failed,Avg Response Time (ms),Total Tokens');
    for (const [provider, stats] of Object.entries(report.providerStats)) {
      lines.push(
        `${provider},${stats.total},${stats.successful},${stats.failed},${stats.avgResponseTime},${stats.totalTokens}`
      );
    }
    lines.push('');

    // Sessions
    lines.push('CATEGORIZATION SESSIONS');
    lines.push(
      'Timestamp,Processed,Categorized,Errors,Duration (ms),Success Rate (%),Avg Time Per Bookmark (ms),Mode'
    );
    report.sessions.forEach((session) => {
      const date = new Date(session.timestamp).toISOString();
      lines.push(
        `${date},${session.bookmarksProcessed},${session.bookmarksCategorized},${session.errors},${session.duration},${session.successRate},${session.avgTimePerBookmark},${session.mode}`
      );
    });
    lines.push('');

    // API Calls
    lines.push('API CALLS');
    lines.push('Timestamp,Provider,Model,Tokens,Success,Response Time (ms),Batch Size,Error Type');
    report.apiCalls.forEach((call) => {
      const date = new Date(call.timestamp).toISOString();
      lines.push(
        `${date},${call.provider},${call.model},${call.tokensUsed},${call.success},${call.responseTime},${call.batchSize},${call.errorType || 'N/A'}`
      );
    });

    return lines.join('\n');
  }

  /**
   * Clear all analytics data
   */
  async clearAnalytics() {
    await this._resetAnalytics();
  }

  /**
   * Get analytics from storage
   * @private
   */
  async _getAnalytics() {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const stored = result[this.storageKey];

      // If no stored data, return defaults
      if (!stored) {
        return this._getDefaultAnalytics();
      }

      // Merge stored data with defaults to ensure all properties exist
      const defaults = this._getDefaultAnalytics();
      return {
        ...defaults,
        ...stored,
        // Ensure arrays exist
        sessions: Array.isArray(stored.sessions) ? stored.sessions : [],
        apiCalls: Array.isArray(stored.apiCalls) ? stored.apiCalls : [],
        consolidations: Array.isArray(stored.consolidations) ? stored.consolidations : [],
        // Ensure objects exist
        categoryUsage: stored.categoryUsage || {},
        apiByProvider: stored.apiByProvider || {},
        processingTimes: stored.processingTimes || {}
      };
    } catch (_error) {
      console.error('_error getting analytics:', _error);
      return this._getDefaultAnalytics();
    }
  }

  /**
   * Save analytics to storage
   * @private
   */
  async _saveAnalytics(analytics) {
    try {
      analytics.lastUpdated = Date.now();
      await chrome.storage.local.set({ [this.storageKey]: analytics });
    } catch (_error) {
      console.error('_error saving analytics:', _error);
    }
  }

  /**
   * Reset analytics to default state
   * @private
   */
  async _resetAnalytics() {
    const defaults = this._getDefaultAnalytics();
    defaults.firstUsed = Date.now();
    await this._saveAnalytics(defaults);
  }

  /**
   * Get default analytics structure
   * @private
   */
  _getDefaultAnalytics() {
    return {
      version: '1.0',
      firstUsed: Date.now(),
      lastUpdated: Date.now(),

      // Overall stats
      totalCategorizations: 0,
      totalErrors: 0,
      totalApiCalls: 0,
      successfulApiCalls: 0,
      failedApiCalls: 0,
      totalFoldersConsolidated: 0,
      totalBookmarksReorganized: 0,

      // Detailed data
      sessions: [],
      apiCalls: [],
      consolidations: [],
      categoryUsage: {},
      apiByProvider: {},
      processingTimes: {}
    };
  }
}

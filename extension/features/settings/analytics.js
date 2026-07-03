import { AnalyticsService } from '../../analytics/analyticsService.js';
import { PerformanceMonitor } from '../../analytics/performanceMonitor.js';
/**
 * BookmarkMind - Analytics Dashboard
 * Display performance metrics and usage statistics
 */

let currentPeriod = 'last24h';
let analyticsData = null;
let performanceMonitor = null;
let rateLimitRefreshInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  performanceMonitor = new PerformanceMonitor();
  await performanceMonitor.initialize();
  setupEventListeners();
  await loadAnalytics();
});

function setupEventListeners() {
  // Tab navigation
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
    });
  });

  // Period selector
  document.querySelectorAll('.period-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentPeriod = btn.dataset.period;
      document.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      updatePeriodStats();
    });
  });

  // Action buttons
  document.getElementById('refreshBtn').addEventListener('click', loadAnalytics);
  document.getElementById('exportBtn').addEventListener('click', exportAnalytics);
  document.getElementById('clearBtn').addEventListener('click', clearAnalytics);
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach((tc) => tc.classList.remove('active'));

  document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(tabName).classList.add('active');

  if (tabName === 'ratelimits') {
    startRateLimitRefresh();
  } else {
    stopRateLimitRefresh();
  }
}

async function loadAnalytics() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getAnalytics' });

    if (response.success) {
      analyticsData = response.data;
      updateAllDashboards();
    } else {
      showError(`Failed to load analytics: ${response.error}`);
    }
  } catch (_error) {
    console.error('_error loading analytics:', _error);
    showError('Failed to load analytics data');
  }
}

function updateAllDashboards() {
  updateOverview();
  updateCategorization();
  updateApiStats();
  updateRateLimits();
  updatePerformance();
  updateConsolidation();
}

function updateOverview() {
  const { overview } = analyticsData;

  // Update stat cards
  document.getElementById('totalCategorizations').textContent = overview.totalCategorizations;
  document.getElementById('successRate').textContent = `${overview.overallSuccessRate}%`;
  document.getElementById('totalApiCalls').textContent = overview.totalApiCalls;
  document.getElementById('foldersConsolidated').textContent = overview.totalFoldersConsolidated;

  // Update period stats
  updatePeriodStats();
}

function updatePeriodStats() {
  if (!analyticsData) return;

  const periodData = analyticsData.recentActivity[currentPeriod];

  document.getElementById('periodSessions').textContent = periodData.sessions;
  document.getElementById('periodBookmarks').textContent = periodData.bookmarksProcessed;
  document.getElementById('periodSuccessRate').textContent = `${periodData.successRate}%`;
  document.getElementById('periodAvgDuration').textContent = formatDuration(periodData.avgDuration);
}

function updateCategorization() {
  const { overview, categoryStats, sessions } = analyticsData;

  // Update stats
  document.getElementById('catProcessed').textContent =
    overview.totalCategorizations + overview.totalErrors;
  document.getElementById('catSuccess').textContent = overview.totalCategorizations;
  document.getElementById('catErrors').textContent = overview.totalErrors;
  document.getElementById('catSuccessRate').textContent = `${overview.overallSuccessRate}%`;

  // Update top categories
  const topCategoriesEl = document.getElementById('topCategories');
  if (categoryStats.topCategories.length > 0) {
    topCategoriesEl.innerHTML = categoryStats.topCategories
      .map(
        (cat) => `
            <div class="category-item">
                <div class="category-name">${escapeHtml(cat.category)}</div>
                <div class="category-count">Used ${cat.count} times</div>
            </div>
        `
      )
      .join('');
  } else {
    topCategoriesEl.innerHTML = '<p class="empty-state">No category data available</p>';
  }

  // Update recent sessions
  const sessionsEl = document.getElementById('recentSessions');
  if (sessions.length > 0) {
    sessionsEl.innerHTML = sessions
      .slice()
      .reverse()
      .map(
        (session) => `
            <div class="session-item">
                <div class="session-title">${session.mode.charAt(0).toUpperCase() + session.mode.slice(1)} Categorization</div>
                <div class="session-details">
                    Processed: ${session.bookmarksProcessed} |
                    Categorized: ${session.bookmarksCategorized} |
                    Errors: ${session.errors} |
                    Success: ${session.successRate}%
                </div>
                <div class="session-meta">
                    <span>${formatDate(session.timestamp)}</span>
                    <span>Duration: ${formatDuration(session.duration)}</span>
                </div>
            </div>
        `
      )
      .join('');
  } else {
    sessionsEl.innerHTML = '<p class="empty-state">No sessions recorded</p>';
  }
}

function updateApiStats() {
  const { apiStats, overview } = analyticsData;

  // Update API stats
  document.getElementById('apiTotal').textContent = overview.totalApiCalls;
  document.getElementById('apiSuccess').textContent = overview.successfulApiCalls;
  document.getElementById('apiFailed').textContent = overview.failedApiCalls;
  document.getElementById('apiAvgResponse').textContent = `${apiStats.avgResponseTime}ms`;

  // Update recent 24h stats
  const recent24h = apiStats.recentCalls.last24h;
  document.getElementById('apiRecent24hTotal').textContent = recent24h.total;
  document.getElementById('apiRecent24hSuccess').textContent = `${recent24h.successRate}%`;
  document.getElementById('apiRecent24hTokens').textContent =
    recent24h.totalTokens.toLocaleString();
  document.getElementById('apiRecent24hAvgResponse').textContent = `${recent24h.avgResponseTime}ms`;

  // Update providers
  const providersEl = document.getElementById('apiProviders');
  const providers = Object.entries(apiStats.byProvider);

  if (providers.length > 0) {
    providersEl.innerHTML = providers
      .map(
        ([provider, stats]) => `
            <div class="provider-item">
                <div class="provider-name">${provider.charAt(0).toUpperCase() + provider.slice(1)}</div>
                <div class="provider-details">
                    Total Calls: ${stats.total} |
                    Success: ${stats.successful} |
                    Failed: ${stats.failed} |
                    Tokens: ${stats.totalTokens.toLocaleString()}
                </div>
            </div>
        `
      )
      .join('');
  } else {
    providersEl.innerHTML = '<p class="empty-state">No API usage data available</p>';
  }
}

function updatePerformance() {
  const { performance } = analyticsData;

  // Update processing times
  const processingTimesEl = document.getElementById('processingTimes');
  const operations = Object.entries(performance.avgProcessingTimes);

  if (operations.length > 0) {
    processingTimesEl.innerHTML = operations
      .map(
        ([operation, avgTime]) => `
            <div class="processing-item">
                <div class="processing-name">${formatOperationName(operation)}</div>
                <div class="processing-time">Average: ${formatDuration(avgTime)}</div>
            </div>
        `
      )
      .join('');
  } else {
    processingTimesEl.innerHTML = '<p class="empty-state">No processing time data available</p>';
  }

  // Generate performance insights
  const insightsEl = document.getElementById('performanceInsights');
  const insights = generatePerformanceInsights();

  if (insights.length > 0) {
    insightsEl.innerHTML = insights
      .map(
        (insight) => `
            <div class="insight-item ${insight.type}">
                <div class="category-name">${insight.icon} ${insight.title}</div>
                <div class="category-count">${insight.message}</div>
            </div>
        `
      )
      .join('');
  } else {
    insightsEl.innerHTML = '<p class="empty-state">No performance insights available</p>';
  }
}

function updateConsolidation() {
  const { consolidation } = analyticsData;

  // Update stats
  document.getElementById('consolTotal').textContent = consolidation.totalConsolidations;
  document.getElementById('consolFolders').textContent = consolidation.totalFoldersRemoved;
  document.getElementById('consolBookmarks').textContent = consolidation.totalBookmarksMoved;
  document.getElementById('consolSpaceSaved').textContent =
    consolidation.totalFoldersRemoved > 0 ? 'Yes' : 'N/A';

  // Update recent consolidations
  const recentEl = document.getElementById('recentConsolidations');
  if (consolidation.recent.length > 0) {
    recentEl.innerHTML = consolidation.recent
      .slice()
      .reverse()
      .map(
        (consol) => `
            <div class="consolidation-item">
                <div class="consolidation-title">Consolidation</div>
                <div class="consolidation-details">
                    Folders Processed: ${consol.foldersProcessed} |
                    Bookmarks Moved: ${consol.bookmarksMoved} |
                    Folders Removed: ${consol.foldersRemoved}
                </div>
                <div class="session-meta">
                    <span>${formatDate(consol.timestamp)}</span>
                </div>
            </div>
        `
      )
      .join('');
  } else {
    recentEl.innerHTML = '<p class="empty-state">No consolidation history available</p>';
  }
}

function generatePerformanceInsights() {
  const insights = [];
  const { overview, apiStats, sessions } = analyticsData;

  // Success rate insight
  if (overview.overallSuccessRate >= 90) {
    insights.push({
      type: 'positive',
      icon: '✅',
      title: 'Excellent Success Rate',
      message: `Your categorization success rate is ${overview.overallSuccessRate}%, which is excellent!`
    });
  } else if (overview.overallSuccessRate < 70) {
    insights.push({
      type: 'warning',
      icon: '⚠️',
      title: 'Low Success Rate',
      message: `Your success rate is ${overview.overallSuccessRate}%. Consider reviewing API configuration or bookmark quality.`
    });
  }

  // API performance insight
  if (apiStats.avgResponseTime < 2000) {
    insights.push({
      type: 'positive',
      icon: '⚡',
      title: 'Fast API Response',
      message: `Average API response time is ${apiStats.avgResponseTime}ms - excellent performance!`
    });
  } else if (apiStats.avgResponseTime > 5000) {
    insights.push({
      type: 'warning',
      icon: '🐌',
      title: 'Slow API Response',
      message: `Average API response time is ${apiStats.avgResponseTime}ms. Consider checking your internet connection.`
    });
  }

  // Usage insight
  if (sessions.length > 0) {
    const recentSession = sessions[sessions.length - 1];
    const hoursSince = Math.floor((Date.now() - recentSession.timestamp) / (1000 * 60 * 60));

    if (hoursSince < 24) {
      insights.push({
        type: 'positive',
        icon: '🎯',
        title: 'Recently Active',
        message: `Last categorization was ${hoursSince} hours ago. Keep organizing!`
      });
    }
  }

  // API efficiency insight
  const apiSuccessRate =
    overview.totalApiCalls > 0
      ? Math.round((overview.successfulApiCalls / overview.totalApiCalls) * 100)
      : 0;

  if (apiSuccessRate >= 95) {
    insights.push({
      type: 'positive',
      icon: '🎉',
      title: 'Excellent API Reliability',
      message: `${apiSuccessRate}% of API calls successful - your configuration is working great!`
    });
  } else if (apiSuccessRate < 80) {
    insights.push({
      type: 'negative',
      icon: '❌',
      title: 'API Reliability Issues',
      message: `Only ${apiSuccessRate}% of API calls successful. Check your API key and rate limits.`
    });
  }

  return insights;
}

async function exportAnalytics() {
  try {
    const dataStr = JSON.stringify(analyticsData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `bookmarkmind-analytics-${new Date().toISOString().split('T')[0]}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showSuccess('Analytics data exported successfully');
  } catch (_error) {
    console.error('Export _error:', _error);
    showError('Failed to export analytics data');
  }
}

async function clearAnalytics() {
  if (!confirm('Are you sure you want to clear all analytics data? This cannot be undone.')) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ action: 'clearAnalytics' });

    if (response.success) {
      showSuccess('Analytics data cleared successfully');
      await loadAnalytics();
    } else {
      showError(`Failed to clear analytics: ${response.error}`);
    }
  } catch (_error) {
    console.error('Clear _error:', _error);
    showError('Failed to clear analytics data');
  }
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) {
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  }
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;

  return date.toLocaleDateString();
}

function formatOperationName(operation) {
  return operation
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showSuccess(message) {
  alert(message);
}

function showError(message) {
  alert(`Error: ${message}`);
}

async function updateRateLimits() {
  if (!performanceMonitor) return;

  try {
    const rateLimitDashboard = await performanceMonitor.getRateLimitDashboard();
    const providers = Object.entries(rateLimitDashboard);

    const providersEl = document.getElementById('rateLimitProviders');

    if (providers.length > 0) {
      providersEl.innerHTML = providers
        .map(([provider, data]) => {
          const statusClass = data.status;
          const statusIcon = getStatusIcon(data.status);

          return `
                    <div class="ratelimit-provider ${statusClass}">
                        <div class="provider-header">
                            <h3>${provider.charAt(0).toUpperCase() + provider.slice(1)}</h3>
                            <span class="status-badge ${statusClass}">${statusIcon} ${data.status.toUpperCase()}</span>
                        </div>
                        <div class="provider-metrics">
                            <div class="metric">
                                <span class="metric-label">Current RPM:</span>
                                <span class="metric-value">${data.currentRpm} / ${data.maxRpm}</span>
                            </div>
                            <div class="metric">
                                <span class="metric-label">Utilization:</span>
                                <span class="metric-value">${data.utilizationPercent}%</span>
                            </div>
                            <div class="metric">
                                <span class="metric-label">Queue Depth:</span>
                                <span class="metric-value">${data.queueDepth}</span>
                            </div>
                        </div>
                        <div class="utilization-bar">
                            <div class="utilization-fill ${statusClass}" style="width: ${data.utilizationPercent}%"></div>
                        </div>
                        <div class="provider-stats">
                            <span>Throttled: ${data.throttledCount}</span>
                            <span>Rejected: ${data.rejectedCount}</span>
                            <span>Total: ${data.totalRequests}</span>
                        </div>
                    </div>
                `;
        })
        .join('');

      updateRpmChart(rateLimitDashboard);
      updateQueueDepth(rateLimitDashboard);
      updateThrottledRejectedStats(rateLimitDashboard);
      updateRateLimitAlerts(rateLimitDashboard);
    } else {
      providersEl.innerHTML = '<p class="empty-state">No rate limit data available</p>';
    }

    const history = await performanceMonitor.getRateLimitHistory();
    updateRateLimitEvents(history);
  } catch (_error) {
    console.error('_error updating rate limits:', _error);
  }
}

function getStatusIcon(status) {
  const icons = {
    healthy: '✅',
    moderate: '⚠️',
    warning: '🟠',
    critical: '🔴'
  };
  return icons[status] || '❓';
}

function updateRpmChart(rateLimitDashboard) {
  const canvas = document.getElementById('rpmChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const providers = Object.entries(rateLimitDashboard);

  if (providers.length === 0) return;

  const allHistory = providers.map(([provider, data]) => ({
    provider,
    history: data.rpmHistory,
    maxRpm: data.maxRpm
  }));

  drawRpmChart(ctx, canvas, allHistory);
}

function drawRpmChart(ctx, canvas, allHistory) {
  canvas.width = canvas.offsetWidth;
  const width = canvas.width;
  canvas.height = 300;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const maxDataPoints = Math.max(...allHistory.map((h) => h.history.length));
  if (maxDataPoints === 0) return;

  const maxRpm = Math.max(...allHistory.map((h) => Math.max(...h.history.map((p) => p.rpm))));
  const yScale = chartHeight / (maxRpm || 1);
  const xScale = chartWidth / (maxDataPoints - 1 || 1);

  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  for (let i = 0; i <= 5; i++) {
    const y = padding + chartHeight - (i * chartHeight) / 5;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();

    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round((maxRpm / 5) * i), padding - 5, y + 4);
  }
  ctx.setLineDash([]);

  const colors = ['#667eea', '#f56565', '#48bb78', '#ed8936', '#9f7aea'];

  allHistory.forEach((providerData, idx) => {
    const history = providerData.history;
    if (history.length === 0) return;

    ctx.strokeStyle = colors[idx % colors.length];
    ctx.lineWidth = 2;
    ctx.beginPath();

    history.forEach((point, i) => {
      const x = padding + i * xScale;
      const y = padding + chartHeight - point.rpm * yScale;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    ctx.fillStyle = colors[idx % colors.length];
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(providerData.provider, padding + 10, padding + 15 + idx * 15);
  });

  ctx.fillStyle = '#333';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Time (last 5 minutes)', width / 2, height - 5);
}

function updateQueueDepth(rateLimitDashboard) {
  const container = document.getElementById('queueDepthContainer');
  const providers = Object.entries(rateLimitDashboard);

  if (providers.some(([_, data]) => data.queueDepth > 0)) {
    container.innerHTML = providers
      .map(
        ([provider, data]) => `
            <div class="queue-item">
                <div class="queue-provider">${provider.charAt(0).toUpperCase() + provider.slice(1)}</div>
                <div class="queue-bar-container">
                    <div class="queue-bar" style="width: ${Math.min(data.queueDepth * 10, 100)}%"></div>
                </div>
                <div class="queue-count">${data.queueDepth} requests</div>
            </div>
        `
      )
      .join('');
  } else {
    container.innerHTML = '<p class="empty-state">No queued requests</p>';
  }
}

function updateThrottledRejectedStats(rateLimitDashboard) {
  const providers = Object.values(rateLimitDashboard);

  const totalThrottled = providers.reduce((sum, p) => sum + p.throttledCount, 0);
  const totalRejected = providers.reduce((sum, p) => sum + p.rejectedCount, 0);

  document.getElementById('totalThrottled').textContent = totalThrottled;
  document.getElementById('totalRejected').textContent = totalRejected;

  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  let lastHourThrottled = 0;
  let lastHourRejected = 0;

  providers.forEach((provider) => {
    const recentAlerts = provider.recentAlerts || [];
    recentAlerts.forEach((alert) => {
      if (alert.timestamp >= oneHourAgo) {
        if (alert.type === 'throttled') lastHourThrottled++;
        if (alert.type === 'rejected') lastHourRejected++;
      }
    });
  });

  document.getElementById('lastHourThrottled').textContent = lastHourThrottled;
  document.getElementById('lastHourRejected').textContent = lastHourRejected;
}

function updateRateLimitEvents(history) {
  const eventsEl = document.getElementById('rateLimitEvents');

  if (history.length > 0) {
    eventsEl.innerHTML = history
      .slice(0, 20)
      .map(
        (event) => `
            <div class="ratelimit-event ${event.type}">
                <div class="event-icon">${event.type === 'throttled' ? '⏳' : '🚫'}</div>
                <div class="event-details">
                    <div class="event-provider">${event.provider.charAt(0).toUpperCase() + event.provider.slice(1)}</div>
                    <div class="event-type">${event.type.charAt(0).toUpperCase() + event.type.slice(1)}</div>
                    <div class="event-time">${formatDate(event.timestamp)}</div>
                </div>
            </div>
        `
      )
      .join('');
  } else {
    eventsEl.innerHTML = '<p class="empty-state">No rate limit events recorded</p>';
  }
}

function updateRateLimitAlerts(rateLimitDashboard) {
  const alertsEl = document.getElementById('rateLimitAlerts');
  const allAlerts = [];

  Object.entries(rateLimitDashboard).forEach(([provider, data]) => {
    if (data.recentAlerts && data.recentAlerts.length > 0) {
      data.recentAlerts.forEach((alert) => {
        allAlerts.push({ ...alert, provider });
      });
    }
  });

  allAlerts.sort((a, b) => b.timestamp - a.timestamp);

  if (allAlerts.length > 0) {
    alertsEl.innerHTML = allAlerts
      .slice(0, 10)
      .map(
        (alert) => `
            <div class="alert-item warning">
                <div class="alert-icon">⚠️</div>
                <div class="alert-content">
                    <div class="alert-title">Approaching Rate Limit - ${alert.provider.charAt(0).toUpperCase() + alert.provider.slice(1)}</div>
                    <div class="alert-message">
                        ${alert.currentRpm} RPM (${alert.utilizationPercent}% of limit)
                    </div>
                    <div class="alert-time">${formatDate(alert.timestamp)}</div>
                </div>
            </div>
        `
      )
      .join('');
  } else {
    alertsEl.innerHTML = '<p class="empty-state">No alerts</p>';
  }
}

function startRateLimitRefresh() {
  stopRateLimitRefresh();
  updateRateLimits();
  rateLimitRefreshInterval = setInterval(updateRateLimits, 5000);
}

function stopRateLimitRefresh() {
  if (rateLimitRefreshInterval) {
    clearInterval(rateLimitRefreshInterval);
    rateLimitRefreshInterval = null;
  }
}

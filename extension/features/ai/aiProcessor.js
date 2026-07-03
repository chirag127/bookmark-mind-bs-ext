import { AnalyticsService } from '../analytics/analyticsService.js';
import { PerformanceMonitor } from '../analytics/performanceMonitor.js';
import { BookmarkService } from '../bookmarks/bookmarkService.js';
import { CategoryGrouper } from './categoryGrouper.js';
import { ModelComparisonService } from './modelComparisonService.js';
/**
 * BookmarkMind - AI Processor
 * Handles Gemini API integration for bookmark categorization
 */

/**
 * Request Queue Management System
 * Handles provider-specific rate limits, priority ordering, throttling, and retry logic
 */
export class RequestQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.requestHistory = new Map();

    this.rateLimits = {
      gemini: { rpm: 15, maxQueueSize: 100 },
      cerebras: { rpm: 60, maxQueueSize: 200 },
      groq: { rpm: 30, maxQueueSize: 150 }
    };

    this.priorities = {
      high: 0,
      normal: 1,
      low: 2
    };

    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      jitterFactor: 0.3
    };

    this.metrics = {
      requestsPerMinute: new Map(),
      queueDepth: 0,
      throttledRequests: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retriedRequests: 0,
      averageWaitTime: 0,
      providerMetrics: new Map()
    };

    this._initializeProviderMetrics();
    this._startMetricsCleanup();
  }

  _initializeProviderMetrics() {
    for (const provider of ['gemini', 'cerebras', 'groq']) {
      this.metrics.providerMetrics.set(provider, {
        requests: 0,
        successful: 0,
        failed: 0,
        throttled: 0,
        averageLatency: 0,
        lastRequestTime: null
      });
    }
  }

  _startMetricsCleanup() {
    setInterval(() => {
      const oneMinuteAgo = Date.now() - 60000;
      for (const [timestamp] of this.requestHistory) {
        if (timestamp < oneMinuteAgo) {
          this.requestHistory.delete(timestamp);
        }
      }
      this._updateRequestsPerMinute();
    }, 10000);
  }

  _updateRequestsPerMinute() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    const overallCount = Array.from(this.requestHistory.keys()).filter(
      (ts) => ts >= oneMinuteAgo
    ).length;
    this.metrics.requestsPerMinute.set('overall', overallCount);

    for (const provider of ['gemini', 'cerebras', 'groq']) {
      const providerCount = Array.from(this.requestHistory.entries()).filter(
        ([ts, p]) => ts >= oneMinuteAgo && p === provider
      ).length;
      this.metrics.requestsPerMinute.set(provider, providerCount);
    }
  }

  async enqueue(request, provider = 'gemini', priority = 'normal') {
    const limits = this.rateLimits[provider];
    if (!limits) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    if (this.queue.length >= limits.maxQueueSize) {
      this.metrics.throttledRequests++;
      const providerMetrics = this.metrics.providerMetrics.get(provider);
      providerMetrics.throttled++;
      throw new Error(`Queue full for provider ${provider} (max: ${limits.maxQueueSize})`);
    }

    const queueItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      request,
      provider,
      priority: this.priorities[priority] || this.priorities.normal,
      priorityName: priority,
      retries: 0,
      enqueuedAt: Date.now(),
      startedAt: null,
      completedAt: null
    };

    this.queue.push(queueItem);
    this.queue.sort((a, b) => a.priority - b.priority);
    this.metrics.queueDepth = this.queue.length;
    this.metrics.totalRequests++;

    console.log(
      `📥 Enqueued ${provider} request (priority: ${priority}, queue: ${this.queue.length}/${limits.maxQueueSize})`
    );

    if (!this.processing) {
      this._processQueue();
    }

    return new Promise((resolve, reject) => {
      queueItem.resolve = resolve;
      queueItem.reject = reject;
    });
  }

  async _processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue[0];
      const provider = item.provider;
      const limits = this.rateLimits[provider];

      if (await this._canProcessRequest(provider, limits)) {
        this.queue.shift();
        this.metrics.queueDepth = this.queue.length;
        item.startedAt = Date.now();

        const waitTime = item.startedAt - item.enqueuedAt;
        this.metrics.averageWaitTime =
          (this.metrics.averageWaitTime * (this.metrics.totalRequests - 1) + waitTime) /
          this.metrics.totalRequests;

        this._executeRequest(item);
      } else {
        const delay = this._calculateThrottleDelay(provider, limits);
        console.log(`⏳ Rate limit reached for ${provider}, waiting ${Math.round(delay)}ms...`);
        await this._delay(delay);
      }
    }

    this.processing = false;
  }

  async _canProcessRequest(provider, limits) {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    const recentRequests = Array.from(this.requestHistory.entries()).filter(
      ([ts, p]) => ts >= oneMinuteAgo && p === provider
    ).length;

    return recentRequests < limits.rpm;
  }

  _calculateThrottleDelay(provider, _limits) {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    const recentRequestTimes = Array.from(this.requestHistory.entries())
      .filter(([ts, p]) => ts >= oneMinuteAgo && p === provider)
      .map(([ts]) => ts)
      .sort((a, b) => a - b);

    if (recentRequestTimes.length === 0) {
      return 0;
    }

    const oldestRequest = recentRequestTimes[0];
    const timeUntilOldestExpires = 60000 - (now - oldestRequest);

    return Math.max(100, timeUntilOldestExpires + 100);
  }

  async _executeRequest(item) {
    const startTime = Date.now();
    const providerMetrics = this.metrics.providerMetrics.get(item.provider);
    providerMetrics.requests++;

    try {
      console.log(
        `🚀 Executing ${item.provider} request (${item.priorityName}, attempt ${item.retries + 1}/${
          this.retryConfig.maxRetries + 1
        })`
      );

      const result = await item.request();

      const latency = Date.now() - startTime;
      providerMetrics.successful++;
      providerMetrics.averageLatency =
        (providerMetrics.averageLatency * (providerMetrics.successful - 1) + latency) /
        providerMetrics.successful;
      providerMetrics.lastRequestTime = Date.now();

      this.requestHistory.set(Date.now(), item.provider);
      this._updateRequestsPerMinute();

      item.completedAt = Date.now();
      this.metrics.successfulRequests++;

      console.log(`✅ ${item.provider} request completed (${latency}ms)`);
      item.resolve(result);
    } catch (_error) {
      console.error(
        `❌ ${item.provider} request failed (attempt ${item.retries + 1}):`,
        _error.message
      );

      if (this._shouldRetry(item, error)) {
        item.retries++;
        this.metrics.retriedRequests++;

        const delay = this._calculateRetryDelay(item.retries);
        console.log(
          `🔄 Retrying ${item.provider} request in ${Math.round(
            delay
          )}ms (attempt ${item.retries + 1}/${this.retryConfig.maxRetries + 1})`
        );

        await this._delay(delay);

        this.queue.unshift(item);
        this.metrics.queueDepth = this.queue.length;
      } else {
        providerMetrics.failed++;
        this.metrics.failedRequests++;
        item.reject(error);
      }
    }

    this._processQueue();
  }

  _shouldRetry(item, _error) {
    if (item.retries >= this.retryConfig.maxRetries) {
      return false;
    }

    const retryableErrors = [
      'rate limit',
      'timeout',
      'network',
      '429',
      '500',
      '502',
      '503',
      '504',
      'ECONNRESET',
      'ETIMEDOUT'
    ];

    const errorMessage = _error.message?.toLowerCase() || '';
    return retryableErrors.some((pattern) => errorMessage.includes(pattern));
  }

  _calculateRetryDelay(retryCount) {
    const exponentialDelay = Math.min(
      this.retryConfig.baseDelay * 2 ** (retryCount - 1),
      this.retryConfig.maxDelay
    );

    const jitter = exponentialDelay * this.retryConfig.jitterFactor * (Math.random() * 2 - 1);

    return Math.max(0, exponentialDelay + jitter);
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getMetrics() {
    this._updateRequestsPerMinute();

    return {
      queueDepth: this.metrics.queueDepth,
      totalRequests: this.metrics.totalRequests,
      successfulRequests: this.metrics.successfulRequests,
      failedRequests: this.metrics.failedRequests,
      retriedRequests: this.metrics.retriedRequests,
      throttledRequests: this.metrics.throttledRequests,
      averageWaitTime: Math.round(this.metrics.averageWaitTime),
      requestsPerMinute: Object.fromEntries(this.metrics.requestsPerMinute),
      providers: Object.fromEntries(
        Array.from(this.metrics.providerMetrics.entries()).map(([provider, metrics]) => [
          provider,
          {
            ...metrics,
            averageLatency: Math.round(metrics.averageLatency),
            rpm: this.metrics.requestsPerMinute.get(provider) || 0,
            rpmLimit: this.rateLimits[provider].rpm,
            queueLimit: this.rateLimits[provider].maxQueueSize
          }
        ])
      )
    };
  }

  getDetailedMetrics() {
    const metrics = this.getMetrics();

    console.log('\n📊 ═══════════════════════════════════════════════════════');
    console.log('📊 REQUEST QUEUE METRICS');
    console.log('📊 ═══════════════════════════════════════════════════════');
    console.log(`📦 Queue Depth: ${metrics.queueDepth}`);
    console.log(`📈 Total Requests: ${metrics.totalRequests}`);
    console.log(`✅ Successful: ${metrics.successfulRequests}`);
    console.log(`❌ Failed: ${metrics.failedRequests}`);
    console.log(`🔄 Retried: ${metrics.retriedRequests}`);
    console.log(`⏸️  Throttled: ${metrics.throttledRequests}`);
    console.log(`⏱️  Average Wait: ${metrics.averageWaitTime}ms`);
    console.log(`🕐 Overall RPM: ${metrics.requestsPerMinute.overall || 0}`);
    console.log('');
    console.log('📊 PROVIDER METRICS:');

    for (const [provider, stats] of Object.entries(metrics.providers)) {
      console.log(`\n  🔹 ${provider.toUpperCase()}`);
      console.log(`     Requests: ${stats.requests}`);
      console.log(`     Successful: ${stats.successful}`);
      console.log(`     Failed: ${stats.failed}`);
      console.log(`     Throttled: ${stats.throttled}`);
      console.log(`     RPM: ${stats.rpm}/${stats.rpmLimit}`);
      console.log(`     Avg Latency: ${stats.averageLatency}ms`);
      console.log(`     Queue Limit: ${stats.queueLimit}`);
    }

    console.log('📊 ═══════════════════════════════════════════════════════\n');

    return metrics;
  }

  clearMetrics() {
    this.requestHistory.clear();
    this.metrics.throttledRequests = 0;
    this.metrics.totalRequests = 0;
    this.metrics.successfulRequests = 0;
    this.metrics.failedRequests = 0;
    this.metrics.retriedRequests = 0;
    this.metrics.averageWaitTime = 0;
    this._initializeProviderMetrics();
    console.log('🧹 Request queue metrics cleared');
  }
}

export class AIProcessor {
  constructor() {
    this.apiKey = null;
    this.cerebrasApiKey = null;
    this.groqApiKey = null;
    this.bookmarkService = null;
    this.categoryGrouper = typeof CategoryGrouper !== 'undefined' ? new CategoryGrouper() : null;
    this.analyticsService = typeof AnalyticsService !== 'undefined' ? new AnalyticsService() : null;
    this.modelComparisonService =
      typeof ModelComparisonService !== 'undefined' ? new ModelComparisonService() : null;
    this.performanceMonitor =
      typeof PerformanceMonitor !== 'undefined' ? new PerformanceMonitor() : null;

    this.requestQueue = new RequestQueue();

    // Gemini model fallback sequence - try models in order when one fails
    // Gemini model fallback sequence - try models in order when one fails
    this.geminiModels = [];
    this.currentModelIndex = 0;
    this.baseUrlTemplate =
      'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent';

    // Cerebras model fallback sequence - OpenAI-compatible API
    this.cerebrasModels = [
      {
        name: 'gpt-oss-120b',
        provider: 'cerebras',
        costPer1MInputTokens: 0.6,
        costPer1MOutputTokens: 0.6
      },
      {
        name: 'llama-3.3-70b',
        provider: 'cerebras',
        costPer1MInputTokens: 0.6,
        costPer1MOutputTokens: 0.6
      },
      {
        name: 'qwen-3-32b',
        provider: 'cerebras',
        costPer1MInputTokens: 0.1,
        costPer1MOutputTokens: 0.1
      },
      {
        name: 'llama3.1-8b',
        provider: 'cerebras',
        costPer1MInputTokens: 0.1,
        costPer1MOutputTokens: 0.1
      }
    ];
    this.cerebrasBaseUrl = 'https://api.cerebras.ai/v1/chat/completions';

    // Groq model fallback sequence - OpenAI-compatible API
    this.groqModels = [
      {
        name: 'openai/gpt-oss-120b',
        provider: 'groq',
        costPer1MInputTokens: 0.0,
        costPer1MOutputTokens: 0.0
      },
      {
        name: 'llama-3.3-70b-versatile',
        provider: 'groq',
        costPer1MInputTokens: 0.0,
        costPer1MOutputTokens: 0.0
      },
      {
        name: 'qwen/qwen3-32b',
        provider: 'groq',
        costPer1MInputTokens: 0.0,
        costPer1MOutputTokens: 0.0
      },
      {
        name: 'openai/gpt-oss-20b',
        provider: 'groq',
        costPer1MInputTokens: 0.0,
        costPer1MOutputTokens: 0.0
      },
      {
        name: 'llama-3.1-8b-instant',
        provider: 'groq',
        costPer1MInputTokens: 0.0,
        costPer1MOutputTokens: 0.0
      }
    ];
    this.groqBaseUrl = 'https://api.groq.com/openai/v1/chat/completions';

    // Retry configuration for exponential backoff
    this.maxRetries = 3;
    this.baseRetryDelay = 1000; // 1 second
    this.maxRetryDelay = 30000; // 30 seconds

    // Custom model configuration support
    this.customModelConfig = null;
    this.modelsFetched = false;

    // Rate limit penalty system
    this.modelPenalties = new Map(); // Map<modelName, penaltyExpiryTimestamp>
    this.RATE_LIMIT_PENALTY_MS = 5 * 60 * 1000; // 5 minutes penalty for 429s

    // Quota exhaustion state management
    this.QUOTA_STORAGE_KEY = 'gemini_quota_exhausted_state';
    this.quotaExhaustedUntil = null; // Timestamp when quota will reset
  }

  /**
   * Fetch available models from Gemini API
   * @returns {Promise<Array>} List of available models
   */
  async fetchAvailableModels() {
    if (!this.apiKey) {
      console.warn('Cannot fetch models: API key not set');
      return this.geminiModels;
    }

    try {
      console.log('Fetching available Gemini models from API...');
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.models) {
        console.warn('No models returned from API');
        return this.geminiModels;
      }

      // Filter for models that support generateContent
      const availableModels = data.models
        .filter(
          (model) =>
            model.supportedGenerationMethods?.includes('generateContent') &&
            model.name.startsWith('models/gemini') // Ensure it's a Gemini model
        )
        .map((model) => ({
          name: model.name.replace(/^models\//, ''),
          provider: 'gemini',
          displayName: model.displayName,
          description: model.description,
          inputTokenLimit: model.inputTokenLimit,
          outputTokenLimit: model.outputTokenLimit
        }));

      // Sort by outputTokenLimit (descending), then by API order (stable)
      availableModels.sort((a, b) => {
        const limitA = a.outputTokenLimit || 0;
        const limitB = b.outputTokenLimit || 0;
        return limitB - limitA;
      });

      this.geminiModels = availableModels;
      this.modelsFetched = true;
      console.log(`Successfully fetched and updated ${this.geminiModels.length} Gemini models`);

      return this.geminiModels;
    } catch (error) {
      console.error('Error fetching models:', error);
      return this.geminiModels; // Return existing models on error
    }
  }

  /**
   * Get the current Gemini model URL
   * @returns {string} Current model URL
   */
  getCurrentModelUrl() {
    const currentModel = this.geminiModels[this.currentModelIndex].name;
    return this.baseUrlTemplate.replace('{model}', currentModel);
  }

  /**
   * Get the current Gemini model name
   * @returns {string} Current model name
   */
  getCurrentModelName() {
    return this.geminiModels[this.currentModelIndex].name;
  }

  /**
   * Normalize folder name with proper capitalization and formatting
   * Only changes folders that clearly need improvement
   * @param {string} folderName - Original folder name
   * @returns {string} Normalized folder name
   */
  normalizeFolderName(folderName) {
    if (!folderName || typeof folderName !== 'string') {
      return folderName;
    }

    const original = folderName.trim();

    // Don't change if it's already well-formatted
    if (this._isWellFormatted(original)) {
      return original;
    }

    // Apply normalization rules
    let normalized = original;

    // Fix common capitalization issues
    normalized = this._fixCapitalization(normalized);

    // Clean up spacing and punctuation
    normalized = this._cleanupSpacing(normalized);

    // Fix common abbreviations and technical terms
    normalized = this._fixCommonTerms(normalized);

    // Only return the normalized version if it's significantly better
    if (this._isSignificantImprovement(original, normalized)) {
      console.log(`📁 Normalized folder: "${original}" → "${normalized}"`);
      return normalized;
    }

    return original;
  }

  /**
   * Check if a folder name is already well-formatted
   * @param {string} name - Folder name to check
   * @returns {boolean} True if well-formatted
   */
  _isWellFormatted(name) {
    // Skip very short names
    if (name.length <= 2) return true;

    // Skip if it's intentionally all caps (like "AI", "API", "UI")
    if (name.length <= 4 && name === name.toUpperCase()) return true;

    // Skip if it's a proper noun or brand name that's already correct
    if (this._isProperNoun(name)) return true;

    // Check for obvious formatting issues that need fixing
    const hasIssues = [
      name === name.toLowerCase() && name.length > 2, // all lowercase
      name === name.toUpperCase() && name.length > 4, // all uppercase
      /\s{2,}/.test(name), // multiple spaces
      /^\s|\s$/.test(name), // leading/trailing spaces
      this._isCamelCase(name), // camelCase
      /\bjavascript\b/i.test(name) && !/JavaScript/.test(name), // common tech terms
      /\bgithub\b/i.test(name) && !/GitHub/.test(name),
      /\bapi\b/i.test(name) && !/API/.test(name),
      /\bui\b/i.test(name) && !/UI/.test(name),
      /\bios\b/i.test(name) && !/iOS/.test(name)
    ];

    // If it has obvious issues, it's not well-formatted
    if (hasIssues.some(Boolean)) {
      return false;
    }

    // Check if it's already in good title case with proper technical terms
    const titleCase = this._toTitleCase(name);
    const withTechTerms = this._fixCommonTerms(titleCase);

    // It's well-formatted if it matches the expected result
    return name === withTechTerms;
  }

  /**
   * Fix capitalization issues
   * @param {string} name - Folder name
   * @returns {string} Fixed name
   */
  _fixCapitalization(name) {
    // Handle all lowercase
    if (name === name.toLowerCase() && name.length > 2) {
      return this._toTitleCase(name);
    }

    // Handle all uppercase (except short acronyms)
    if (name === name.toUpperCase() && name.length > 4) {
      return this._toTitleCase(name);
    }

    // Handle camelCase or PascalCase that should be title case
    if (this._isCamelCase(name)) {
      return this._camelToTitleCase(name);
    }

    return name;
  }

  /**
   * Clean up spacing and punctuation
   * @param {string} name - Folder name
   * @returns {string} Cleaned name
   */
  _cleanupSpacing(name) {
    return name
      .replace(/\s+/g, ' ') // Multiple spaces to single space
      .replace(/\s*-\s*/g, ' - ') // Fix spacing around dashes
      .replace(/\s*&\s*/g, ' & ') // Fix spacing around ampersands
      .replace(/\s*\+\s*/g, ' + ') // Fix spacing around plus signs
      .replace(/^\s+|\s+$/g, '') // Trim whitespace
      .replace(/^-+|-+$/g, '') // Remove leading/trailing dashes
      .trim();
  }

  /**
   * Fix common technical terms and abbreviations
   * @param {string} name - Folder name
   * @returns {string} Fixed name
   */
  _fixCommonTerms(name) {
    const fixes = {
      // Technical terms
      javascript: 'JavaScript',
      typescript: 'TypeScript',
      nodejs: 'Node.js',
      reactjs: 'React.js',
      vuejs: 'Vue.js',
      angularjs: 'Angular.js',
      jquery: 'jQuery',
      github: 'GitHub',
      gitlab: 'GitLab',
      stackoverflow: 'Stack Overflow',
      youtube: 'YouTube',
      linkedin: 'LinkedIn',
      facebook: 'Facebook',
      instagram: 'Instagram',
      twitter: 'Twitter',
      tiktok: 'TikTok',
      whatsapp: 'WhatsApp',
      wordpress: 'WordPress',
      shopify: 'Shopify',
      amazon: 'Amazon',
      netflix: 'Netflix',
      spotify: 'Spotify',
      paypal: 'PayPal',
      dropbox: 'Dropbox',
      onedrive: 'OneDrive',
      googledrive: 'Google Drive',
      icloud: 'iCloud',

      // Common abbreviations that should stay uppercase
      ai: 'AI',
      api: 'API',
      ui: 'UI',
      ux: 'UX',
      seo: 'SEO',
      css: 'CSS',
      html: 'HTML',
      xml: 'XML',
      json: 'JSON',
      sql: 'SQL',
      php: 'PHP',
      ios: 'iOS',
      android: 'Android',
      windows: 'Windows',
      macos: 'macOS',
      linux: 'Linux',
      ubuntu: 'Ubuntu',

      // Business terms
      ecommerce: 'E-commerce',
      b2b: 'B2B',
      b2c: 'B2C',
      saas: 'SaaS',
      crm: 'CRM',
      erp: 'ERP',
      hr: 'HR',
      it: 'IT',
      'r&d': 'R&D',
      roi: 'ROI',
      kpi: 'KPI'
    };

    let result = name;

    // Apply word-boundary fixes
    for (const [wrong, correct] of Object.entries(fixes)) {
      const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
      result = result.replace(regex, correct);
    }

    return result;
  }

  /**
   * Convert to title case
   * @param {string} str - String to convert
   * @returns {string} Title case string
   */
  _toTitleCase(str) {
    const smallWords = [
      'a',
      'an',
      'and',
      'as',
      'at',
      'but',
      'by',
      'for',
      'if',
      'in',
      'nor',
      'of',
      'on',
      'or',
      'so',
      'the',
      'to',
      'up',
      'yet'
    ];

    return str
      .toLowerCase()
      .split(' ')
      .map((word, index) => {
        // Always capitalize first and last word
        if (index === 0 || index === str.split(' ').length - 1) {
          return word.charAt(0).toUpperCase() + word.slice(1);
        }

        // Don't capitalize small words unless they're first/last
        if (smallWords.includes(word)) {
          return word;
        }

        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

  /**
   * Check if string has intentional mixed case
   * @param {string} str - String to check
   * @returns {boolean} True if has intentional mixed case
   */
  _hasIntentionalMixedCase(str) {
    const intentionalPatterns = [
      /^[A-Z][a-z]+[A-Z]/, // PascalCase like "JavaScript"
      /^i[A-Z]/, // Apple style like "iPhone", "iPad"
      /^e[A-Z]/, // e-style like "eBay", "eCommerce"
      /[A-Z]{2,}/ // Contains acronyms like "HTML5"
    ];

    return intentionalPatterns.some((pattern) => pattern.test(str));
  }

  /**
   * Check if string is camelCase
   * @param {string} str - String to check
   * @returns {boolean} True if camelCase
   */
  _isCamelCase(str) {
    return /^[a-z]+[A-Z]/.test(str) && !str.includes(' ');
  }

  /**
   * Convert camelCase to Title Case
   * @param {string} str - camelCase string
   * @returns {string} Title Case string
   */
  _camelToTitleCase(str) {
    return str
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }

  /**
   * Check if string is a proper noun that shouldn't be changed
   * @param {string} str - String to check
   * @returns {boolean} True if proper noun
   */
  _isProperNoun(str) {
    const properNouns = [
      'Google',
      'Microsoft',
      'Apple',
      'Amazon',
      'Facebook',
      'Meta',
      'Netflix',
      'Spotify',
      'Adobe',
      'Oracle',
      'IBM',
      'Intel',
      'Samsung',
      'Sony',
      'Nintendo',
      'Tesla',
      'Uber',
      'Airbnb',
      'PayPal',
      'eBay',
      'Etsy',
      'Pinterest',
      'Reddit',
      'Discord',
      'Slack',
      'Zoom',
      'Skype',
      'WhatsApp',
      'Telegram',
      'Signal'
    ];

    return properNouns.includes(str);
  }

  /**
   * Check if normalized version is a significant improvement
   * @param {string} original - Original name
   * @param {string} normalized - Normalized name
   * @returns {boolean} True if significant improvement
   */
  _isSignificantImprovement(original, normalized) {
    // Don't change if they're the same
    if (original === normalized) return false;

    // Don't change if only minor differences
    if (
      original.toLowerCase() === normalized.toLowerCase() &&
      Math.abs(original.length - normalized.length) <= 2
    ) {
      return false;
    }

    // Consider it an improvement if:
    // - Fixed obvious casing issues
    // - Cleaned up spacing
    // - Fixed common technical terms

    const improvements = [
      // Fixed all lowercase
      original === original.toLowerCase() && original.length > 2,
      // Fixed all uppercase
      original === original.toUpperCase() && original.length > 4,
      // Fixed spacing issues
      /\s{2,}/.test(original) || /^\s|\s$/.test(original),
      // Fixed common terms
      /\bjavascript\b/i.test(original) || /\bgithub\b/i.test(original) || /\bapi\b/i.test(original)
    ];

    return improvements.some(Boolean);
  }

  /**
   * Try next Gemini model in the fallback sequence
   * @returns {boolean} True if there's a next model, false if exhausted
   */
  tryNextGeminiModel() {
    if (this.currentModelIndex < this.geminiModels.length - 1) {
      this.currentModelIndex++;
      console.log(`🔄 Switching to next Gemini model: ${this.getCurrentModelName()}`);
      return true;
    }
    console.log('⚠️ All Gemini models exhausted, no more fallbacks available');
    return false;
  }

  /**
   * Reset to first Gemini model (for new categorization sessions)
   */
  resetToFirstModel() {
    this.currentModelIndex = 0;
    console.log(`🔄 Reset to first Gemini model: ${this.getCurrentModelName()}`);
  }

  /**
   * Initialize with API key
   * @param {string} apiKey - Gemini API key
   * @param {string} cerebrasKey - Cerebras API key (optional)
   * @param {string} groqKey - Groq API key (optional)
   */
  setApiKey(apiKey, cerebrasKey = null, groqKey = null) {
    this.apiKey = apiKey;
    this.cerebrasApiKey = cerebrasKey;
    this.groqApiKey = groqKey;

    // Fetch available models if we have an API key and haven't fetched yet
    if (this.apiKey && !this.modelsFetched) {
      this.fetchAvailableModels().catch((err) =>
        console.warn('Failed to auto-fetch models on init:', err)
      );
    }
    console.log(
      `🔑 API Keys configured: Gemini=${!!apiKey}, Cerebras=${!!cerebrasKey}, Groq=${!!groqKey}`
    );
    // Initialize BookmarkService for folder creation
    if (typeof BookmarkService !== 'undefined') {
      this.bookmarkService = new BookmarkService();
    }
  }

  /**
   * Set custom model configuration
   * @param {Object} config - Custom model configuration {temperature, top_p, max_tokens}
   */
  setCustomModelConfig(config) {
    this.customModelConfig = config;
    console.log('🔧 Custom model configuration set:', config);
  }

  /**
   * Get request queue metrics
   * @returns {Object} Queue metrics
   */
  getQueueMetrics() {
    return this.requestQueue.getMetrics();
  }

  /**
   * Display detailed queue metrics
   */
  displayQueueMetrics() {
    return this.requestQueue.getDetailedMetrics();
  }

  /**
   * Clear request queue metrics
   */
  clearQueueMetrics() {
    this.requestQueue.clearMetrics();
  }

  /**
   * Get optimal batch size based on bookmark count and rate limits
   * @param {number} bookmarkCount - Number of bookmarks to process
   * @param {string} provider - AI provider ('gemini', 'cerebras', 'groq')
   * @returns {number} Optimal batch size
   */
  getOptimalBatchSize(bookmarkCount, provider = 'gemini') {
    const rateLimits = {
      gemini: { maxBatchSize: 100, rpmLimit: 15 },
      cerebras: { maxBatchSize: 50, rpmLimit: 60 },
      groq: { maxBatchSize: 100, rpmLimit: 30 }
    };

    const limits = rateLimits[provider] || rateLimits.gemini;

    // Calculate optimal batch size
    if (bookmarkCount <= 10) return 10;
    if (bookmarkCount <= 25) return 25;
    if (bookmarkCount <= 50) return 50;
    if (bookmarkCount <= 100) return limits.maxBatchSize;

    // For large sets, balance between throughput and rate limits
    const optimalSize = Math.min(limits.maxBatchSize, Math.ceil(bookmarkCount / limits.rpmLimit));

    return Math.max(25, optimalSize);
  }

  /**
   * Categorize bookmarks using Gemini API with dynamic category generation
   * @param {Array} bookmarks - Array of bookmark objects
   * @param {Array} suggestedCategories - Suggested categories (optional)
   * @param {Object} learningData - Previous user corrections
   * @param {Function} progressCallback - Optional callback for batch progress (batchNum, totalBatches) => void
   * @returns {Promise<Object>} Object with categories and categorization results
   */
  async categorizeBookmarks(
    bookmarks,
    suggestedCategories = [],
    learningData = {},
    progressCallback = null
  ) {
    if (!this.apiKey) {
      throw new Error('API key not set');
    }

    if (!bookmarks || bookmarks.length === 0) {
      return { categories: [], results: [] };
    }

    // Reset to first Gemini model at the start of each categorization session
    this.resetToFirstModel();

    // Notify background script that AI categorization is starting
    try {
      await chrome.runtime.sendMessage({
        action: 'startAICategorization'
      });
      console.log('🤖 Notified background: AI categorization started');
    } catch (_error) {
      console.warn('Failed to notify background of AI categorization start:', error);
    }

    try {
      // Normalize existing folder names for better presentation
      await this._normalizeExistingFolders();

      // First, analyze bookmarks to generate dynamic categories
      console.log('Generating dynamic categories from bookmarks...');
      const dynamicCategories = await this._generateDynamicCategories(
        bookmarks,
        suggestedCategories,
        learningData
      );
      console.log('Generated categories:', dynamicCategories);

      // Don't create folder structure upfront - create folders only when bookmarks are actually moved to them
      console.log('🏗️  Folder structure will be created on-demand as bookmarks are categorized...');

      // Get batch size from user settings first
      const settings = await this._getSettings();
      const batchSize = settings.batchSize || 50; // Default to 50 if not set
      console.log(`📦 Using batch size: ${batchSize} bookmarks per API call`);

      const results = [];

      // Process bookmarks in configurable BATCHES and MOVE IMMEDIATELY after each batch categorization
      console.log(
        `🔍 Processing ${bookmarks.length} bookmarks in batches of ${batchSize} with IMMEDIATE MOVEMENT...`
      );

      // DEBUG: Check if method exists
      console.log(
        '🔧 DEBUG: _moveBookmarkImmediately method exists:',
        typeof this._moveBookmarkImmediately === 'function'
      );
      console.log(
        '🔧 DEBUG: _createFolderDirect method exists:',
        typeof this._createFolderDirect === 'function'
      );

      // Initialize BookmarkService if not already done
      if (!this.bookmarkService && typeof BookmarkService !== 'undefined') {
        this.bookmarkService = new BookmarkService();
      }

      let successfulMoves = 0;
      const failedMoves = 0;

      // Process bookmarks in batches
      for (let i = 0; i < bookmarks.length; i += batchSize) {
        const batch = bookmarks.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(bookmarks.length / batchSize);

        console.log(
          `\n📦 === PROCESSING BATCH ${batchNumber}/${totalBatches} (${batch.length} bookmarks) ===`
        );
        console.log('📋 Batch bookmarks:');
        batch.forEach((bookmark, idx) => {
          console.log(
            `   ${i + idx + 1}. "${bookmark.title}" - ${bookmark.url?.substring(0, 50)}...`
          );
        });

        // Call progress callback if provided
        if (progressCallback) {
          try {
            progressCallback(batchNumber, totalBatches);
          } catch (err) {
            console.warn('Progress callback error:', err);
          }
        }

        try {
          // Process entire batch with AI (50 bookmarks at once)
          console.log(`🤖 Sending batch of ${batch.length} bookmarks to Gemini AI...`);

          // Enrich batch with live titles from URLs
          console.log(`🌐 Fetching live titles for batch ${batchNumber}...`);
          await this._enrichBatchWithTitles(batch);

          const batchPromise = this.processBatch(batch, dynamicCategories, learningData);
          // Dynamic timeout based on batch size (6 seconds per bookmark, minimum 2 minutes)
          const timeoutMs = Math.max(120000, batch.length * 6000);
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(
              () =>
                reject(new Error(`Batch timeout after ${Math.round(timeoutMs / 1000)} seconds`)),
              timeoutMs
            );
          });

          const batchResults = await Promise.race([batchPromise, timeoutPromise]);

          if (batchResults && batchResults.length > 0) {
            console.log(
              `✅ AI BATCH CATEGORIZATION SUCCESS: ${batchResults.length} bookmarks categorized`
            );

            // Show categorization results
            batchResults.forEach((result, idx) => {
              const bookmark = batch[idx];
              console.log(
                `   ${i + idx + 1}. "${bookmark?.title}" → "${
                  result.category
                }" (confidence: ${result.confidence})`
              );
            });

            // IMMEDIATELY MOVE each bookmark in the batch after categorization
            console.log(`🚚 IMMEDIATE BATCH MOVEMENT: Moving ${batchResults.length} bookmarks...`);

            for (let j = 0; j < batchResults.length; j++) {
              const result = batchResults[j];
              const bookmark = batch[j];
              const globalBookmarkNumber = i + j + 1;

              try {
                if (typeof this._moveBookmarkImmediately === 'function') {
                  await this._moveBookmarkImmediately(
                    bookmark,
                    result.category,
                    result.title,
                    globalBookmarkNumber,
                    bookmarks.length
                  );
                } else {
                  // Inline movement as fallback
                  console.log(
                    `🚚 INLINE MOVEMENT: Moving bookmark ${globalBookmarkNumber}/${bookmarks.length}...`
                  );
                  const folderId = await this._createFolderDirect(result.category, '1');

                  // Mark this bookmark as moved by AI BEFORE moving it to prevent learning
                  try {
                    await chrome.runtime.sendMessage({
                      action: 'markBookmarkAsAIMoved',
                      bookmarkId: bookmark.id
                    });
                    console.log(
                      `🤖 Pre-marked bookmark ${bookmark.id} as AI-moved before inline move`
                    );

                    // ALSO store persistent metadata in Chrome storage for additional protection
                    const metadataKey = `ai_moved_${bookmark.id}`;
                    await chrome.storage.local.set({
                      [metadataKey]: Date.now()
                    });
                    console.log(
                      `🤖 Stored AI metadata in Chrome storage for bookmark ${bookmark.id}`
                    );
                  } catch (_error) {
                    console.warn('Failed to mark bookmark as AI-moved:', error);
                  }

                  // Small delay to ensure the message is processed
                  await new Promise((resolve) => setTimeout(resolve, 100));

                  await chrome.bookmarks.update(bookmark.id, {
                    title: result.title,
                    url: bookmark.url
                  });
                  await chrome.bookmarks.move(bookmark.id, {
                    parentId: folderId
                  });

                  console.log(
                    `✅ INLINE MOVEMENT COMPLETE: "${result.title}" moved to "${result.category}"`
                  );
                }
                results.push(result);
                successfulMoves++;
              } catch (moveError) {
                console.error(
                  `❌ MOVEMENT FAILED for bookmark ${globalBookmarkNumber}: ${moveError.message}`
                );
                // Still add to results even if movement failed
                results.push(result);
                successfulMoves++;
              }
            }
          } else {
            throw new Error('No results returned from AI batch processing');
          }
        } catch (_error) {
          console.error(
            `❌ AI BATCH CATEGORIZATION FAILED for batch ${batchNumber}: ${_error.message}`
          );

          // Show error notification to user instead of using fallback categories
          const errorMessage = `Failed to categorize batch ${batchNumber}/${totalBatches}. ${_error.message}`;
          console.error(`🚨 CATEGORIZATION _error: ${errorMessage}`);

          // Send error notification to popup/options page
          try {
            await chrome.runtime.sendMessage({
              type: 'CATEGORIZATION_ERROR',
              message: errorMessage,
              batch: batchNumber,
              totalBatches: totalBatches
            });
          } catch (notificationError) {
            console.error('Failed to send error notification:', notificationError);
          }

          // Stop processing and throw error instead of continuing with fallback
          throw new Error(`Categorization failed for batch ${batchNumber}: ${_error.message}`);
        }

        // Delay between batches to avoid rate limiting
        if (i + batchSize < bookmarks.length) {
          console.log('⏳ Waiting 10 seconds before next batch...');
          await this._delay(10000);
        }
      }

      console.log('\n🎯 === BATCH PROCESSING COMPLETE ===');
      console.log(`📊 Total bookmarks processed: ${results.length}`);
      console.log(`✅ Successfully moved (AI): ${successfulMoves} bookmarks`);
      console.log(`⚠️ Fallback moved: ${failedMoves} bookmarks`);
      console.log(`📁 Categories available: ${dynamicCategories.length}`);
      console.log(`📋 Categories: ${dynamicCategories.join(', ')}`);
      console.log(
        `🚀 Batch size used: ${batchSize} bookmarks per API call (configurable in options)`
      );

      // Show category distribution
      const categoryCount = {};
      results.forEach((result) => {
        categoryCount[result.category] = (categoryCount[result.category] || 0) + 1;
      });

      console.log('📈 Category distribution:');
      Object.entries(categoryCount).forEach(([category, count]) => {
        console.log(`   ${category}: ${count} bookmarks`);
      });

      // Notify background script that AI categorization is ending
      try {
        await chrome.runtime.sendMessage({
          action: 'endAICategorization'
        });
        console.log('🤖 Notified background: AI categorization ended');
      } catch (_error) {
        console.warn('Failed to notify background of AI categorization end:', error);
      }

      return {
        categories: dynamicCategories,
        results: results
      };
    } catch (_error) {
      // Ensure AI state is reset even if categorization fails
      try {
        await chrome.runtime.sendMessage({
          action: 'endAICategorization'
        });
        console.log('🤖 Notified background: AI categorization ended (due to error)');
      } catch (notifyError) {
        console.warn(
          'Failed to notify background of AI categorization end after error:',
          notifyError
        );
      }

      // Re-throw the original error
      throw _error;
    }
  }

  /**
   * Move bookmark immediately after categorization and update title
   * @param {Object} bookmark - Bookmark object
   * @param {string} category - Category to move to
   * @param {string} newTitle - New AI-generated title
   * @param {number} bookmarkNumber - Current bookmark number
   * @param {number} totalBookmarks - Total bookmarks being processed
   * @param {Function} onMarkAsAIMoved - Optional callback
   */
  async _moveBookmarkImmediately(
    bookmark,
    category,
    newTitle,
    bookmarkNumber,
    totalBookmarks,
    onMarkAsAIMoved = null
  ) {
    console.log(`🚚 IMMEDIATE MOVEMENT: Moving bookmark ${bookmarkNumber}/${totalBookmarks}...`);

    // Get current folder name before moving
    let currentFolderName = 'Unknown';
    try {
      if (bookmark.parentId) {
        const currentParent = await chrome.bookmarks.get(bookmark.parentId);
        currentFolderName = currentParent[0].title;
      }
    } catch (_error) {
      currentFolderName = `ID:${bookmark.parentId}`;
    }

    // Create folder structure and get folder ID
    const rootFolderId = '1'; // Always use Bookmarks Bar
    const folderId = await this._createFolderDirect(category, rootFolderId);

    // Get destination folder name
    let destinationFolderName = 'Unknown';
    try {
      const destinationFolder = await chrome.bookmarks.get(folderId);
      destinationFolderName = destinationFolder[0].title;
    } catch (_error) {
      destinationFolderName = `ID:${folderId}`;
    }

    console.log('📋 MOVING & UPDATING BOOKMARK:');
    console.log(`   📖 Original Title: "${bookmark.title}"`);
    console.log(`   ✨ New AI Title: "${newTitle}"`);
    console.log(`   � FROM: "d${currentFolderName}" (ID: ${bookmark.parentId})`);
    console.log(`   📁 TO: "${destinationFolderName}" (ID: ${folderId})`);
    console.log(`   🎯 Category: "${category}"`);

    // Mark this bookmark as moved by AI BEFORE moving it to prevent learning
    try {
      if (onMarkAsAIMoved) {
        // Use direct callback if available (more reliable in background script)
        onMarkAsAIMoved(bookmark.id);
        console.log(`🤖 Pre-marked bookmark ${bookmark.id} as AI-moved via DIRECT CALLBACK`);
      } else {
        // Fallback to message passing
        await chrome.runtime.sendMessage({
          action: 'markBookmarkAsAIMoved',
          bookmarkId: bookmark.id
        });
        console.log(`🤖 Pre-marked bookmark ${bookmark.id} as AI-moved via MESSAGE`);
      }

      // ALSO store persistent metadata in Chrome storage for additional protection
      const metadataKey = `ai_moved_${bookmark.id}`;
      await chrome.storage.local.set({ [metadataKey]: Date.now() });
      console.log(`🤖 Stored AI metadata in Chrome storage for bookmark ${bookmark.id}`);
    } catch (_error) {
      console.warn('Failed to mark bookmark as AI-moved:', error);
    }

    // Small delay to ensure the message is processed
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Update bookmark title and move it using direct Chrome API
    await chrome.bookmarks.update(bookmark.id, {
      title: newTitle,
      url: bookmark.url // Keep the same URL
    });

    await chrome.bookmarks.move(bookmark.id, { parentId: folderId });

    console.log(
      `   ✅ MOVEMENT & TITLE UPDATE COMPLETE: "${newTitle}" successfully moved from "${currentFolderName}" to "${destinationFolderName}"`
    );
  }

  /**
   * Create folder directly only when needed (prevents empty folder creation)
   * @param {string} categoryPath - Category path (e.g., "Work/Projects")
   * @param {string} rootFolderId - Root folder ID
   * @returns {Promise<string>} Folder ID
   */
  async _createFolderDirect(categoryPath, rootFolderId) {
    // All bookmarks must be categorized into specific functional categories
    if (!categoryPath || categoryPath.trim() === '') {
      throw new Error('Category path cannot be empty - all bookmarks must be properly categorized');
    }

    const parts = categoryPath.split(/\s*>\s*|\s*\/\s*/).map((part) => part.trim());
    let currentParentId = rootFolderId;

    console.log(`📁 Creating folder structure for: "${categoryPath}"`);

    for (const part of parts) {
      // Normalize the folder name for better presentation
      const normalizedPart = this.normalizeFolderName(part);

      // Check if folder already exists (check both original and normalized names)
      const children = await chrome.bookmarks.getChildren(currentParentId);
      let existingFolder = children.find(
        (child) => !child.url && (child.title === part || child.title === normalizedPart)
      );

      if (!existingFolder) {
        // Create the folder with normalized name
        existingFolder = await chrome.bookmarks.create({
          parentId: currentParentId,
          title: normalizedPart
        });
        console.log(`📁 Created folder: "${normalizedPart}" in parent ${currentParentId}`);
      } else {
        // If existing folder has poor formatting, update it to normalized version
        if (
          existingFolder.title !== normalizedPart &&
          this._isSignificantImprovement(existingFolder.title, normalizedPart)
        ) {
          await chrome.bookmarks.update(existingFolder.id, {
            title: normalizedPart
          });
          console.log(`📁 Updated folder name: "${existingFolder.title}" → "${normalizedPart}"`);
        } else {
          console.log(
            `📁 Using existing folder: "${existingFolder.title}" (ID: ${existingFolder.id})`
          );
        }
      }

      currentParentId = existingFolder.id;
    }

    return currentParentId;
  }

  /**
   * Extract keywords from URL and title for better categorization
   * @param {string} url - Bookmark URL
   * @param {string} title - Bookmark title
   * @returns {Array} Array of relevant keywords
   */
  _extractUrlKeywords(url, title) {
    const keywords = [];

    try {
      if (url) {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.toLowerCase();
        const path = urlObj.pathname.toLowerCase();
        const search = urlObj.search.toLowerCase();

        // Extract domain keywords
        const domainParts = domain.split('.');
        keywords.push(...domainParts.filter((part) => part.length > 2));

        // Extract path keywords
        const pathParts = path.split('/').filter((part) => part.length > 2);
        keywords.push(...pathParts);

        // Extract search parameters
        if (search) {
          const searchParts = search.match(/[a-zA-Z]{3,}/g) || [];
          keywords.push(...searchParts);
        }
      }

      if (title) {
        const titleWords = title.toLowerCase().match(/[a-zA-Z]{3,}/g) || [];
        keywords.push(...titleWords);
      }
    } catch (_error) {
      console.warn('Error extracting keywords:', error);
    }

    // Remove duplicates and common words
    const commonWords = [
      'the',
      'and',
      'for',
      'are',
      'but',
      'not',
      'you',
      'all',
      'can',
      'had',
      'her',
      'was',
      'one',
      'our',
      'out',
      'day',
      'get',
      'has',
      'him',
      'his',
      'how',
      'man',
      'new',
      'now',
      'old',
      'see',
      'two',
      'way',
      'who',
      'boy',
      'did',
      'its',
      'let',
      'put',
      'say',
      'she',
      'too',
      'use'
    ];

    return [...new Set(keywords)].filter((keyword) => !commonWords.includes(keyword)).slice(0, 10); // Limit to top 10 keywords
  }

  /**
   * Detect content type from URL and title
   * @param {string} url - Bookmark URL
   * @param {string} title - Bookmark title
   * @returns {string} Detected content type
   */
  _detectContentType(url, title) {
    const combined = `${url} ${title}`.toLowerCase();

    // Video content
    if (/youtube|vimeo|twitch|netflix|video|stream|movie|tv|series/.test(combined)) {
      return 'Video/Streaming';
    }

    // Social media
    if (/facebook|twitter|instagram|linkedin|reddit|discord|telegram|whatsapp/.test(combined)) {
      return 'Social Media';
    }

    // Development/Tech
    if (/github|gitlab|stackoverflow|dev|code|programming|api|documentation|docs/.test(combined)) {
      return 'Development/Tech';
    }

    // Shopping/E-commerce
    if (/amazon|shop|buy|cart|store|price|product|deal|sale/.test(combined)) {
      return 'Shopping/E-commerce';
    }

    // News/Media
    if (/news|article|blog|medium|press|journalist|report/.test(combined)) {
      return 'News/Media';
    }

    // Education/Learning
    if (/course|tutorial|learn|education|university|school|training|study/.test(combined)) {
      return 'Education/Learning';
    }

    // Finance
    if (/bank|finance|money|investment|crypto|trading|stock|payment/.test(combined)) {
      return 'Finance';
    }

    // Tools/Utilities
    if (/tool|utility|app|software|service|platform|dashboard/.test(combined)) {
      return 'Tools/Utilities';
    }

    return 'Tools > Utilities';
  }

  /**
   * Detect risk flags that might indicate inappropriate categorization
   * @param {string} url - Bookmark URL
   * @param {string} title - Bookmark title
   * @returns {Array} Array of risk flags
   */
  _detectRiskFlags(url, title) {
    const flags = [];
    const combined = `${url} ${title}`.toLowerCase();

    // Torrent/P2P related
    if (/torrent|magnet|pirate|p2p|bittorrent|utorrent|tracker|seed|leech/.test(combined)) {
      flags.push('TORRENT/P2P');
    }

    // Paywall bypass related
    if (/bypass|paywall|free|crack|hack|unlock|premium|subscription/.test(combined)) {
      flags.push('PAYWALL_BYPASS');
    }

    // Adult content
    if (/adult|xxx|porn|nsfw|18\+/.test(combined)) {
      flags.push('ADULT_CONTENT');
    }

    // Gambling
    if (/casino|gambling|bet|poker|lottery|slots/.test(combined)) {
      flags.push('GAMBLING');
    }

    // Suspicious/Malware
    if (/malware|virus|suspicious|phishing|scam/.test(combined)) {
      flags.push('SUSPICIOUS');
    }

    return flags;
  }

  /**
   * Normalize existing folder names for better presentation
   * Only updates folders that clearly need improvement
   */
  async _normalizeExistingFolders() {
    try {
      console.log('📁 Checking existing folders for normalization...');

      // Get all bookmark folders from main locations
      const foldersToCheck = ['1', '2']; // Bookmarks Bar and Other Bookmarks
      let normalizedCount = 0;

      for (const rootId of foldersToCheck) {
        normalizedCount += await this._normalizeFoldersRecursively(rootId);
      }

      if (normalizedCount > 0) {
        console.log(`📁 Normalized ${normalizedCount} folder names for better presentation`);
      } else {
        console.log('📁 All existing folders are already well-formatted');
      }
    } catch (_error) {
      console.error('_error normalizing existing folders:', _error);
      // Don't throw - this is not critical for the main functionality
    }
  }

  /**
   * Recursively normalize folders in a tree
   * @param {string} parentId - Parent folder ID
   * @returns {Promise<number>} Number of folders normalized
   */
  async _normalizeFoldersRecursively(parentId) {
    let normalizedCount = 0;

    try {
      const children = await chrome.bookmarks.getChildren(parentId);

      for (const child of children) {
        if (!child.url) {
          // It's a folder
          const normalizedName = this.normalizeFolderName(child.title);

          // Update if it's a significant improvement
          if (
            child.title !== normalizedName &&
            this._isSignificantImprovement(child.title, normalizedName)
          ) {
            await chrome.bookmarks.update(child.id, {
              title: normalizedName
            });
            console.log(`📁 Normalized: "${child.title}" → "${normalizedName}"`);
            normalizedCount++;
          }

          // Recursively check subfolders
          normalizedCount += await this._normalizeFoldersRecursively(child.id);
        }
      }
    } catch (_error) {
      console.error(`Error normalizing folders in parent ${parentId}:`, error);
    }

    return normalizedCount;
  }

  /**
   * Generate a fallback title when AI fails
   * @param {Object} bookmark - Bookmark object
   * @returns {string} Generated fallback title
   */
  _generateFallbackTitle(bookmark) {
    const originalTitle = bookmark.title || 'Untitled';

    try {
      if (bookmark.url) {
        const url = new URL(bookmark.url);
        const domain = url.hostname.replace('www.', '');

        // If title is generic or just domain, enhance it
        if (
          originalTitle === domain ||
          originalTitle.toLowerCase() === 'home' ||
          originalTitle.toLowerCase() === 'dashboard' ||
          originalTitle.length < 10
        ) {
          // Create a better title based on domain
          const domainParts = domain.split('.');
          const siteName = domainParts[0];

          // Common site enhancements
          const siteEnhancements = {
            github: 'GitHub - Code Repository Platform',
            stackoverflow: 'Stack Overflow - Programming Q&A',
            youtube: 'YouTube - Video Streaming Platform',
            netflix: 'Netflix - Streaming Movies & TV Shows',
            amazon: 'Amazon - Online Shopping & Services',
            google: 'Google - Search & Web Services',
            microsoft: 'Microsoft - Technology & Cloud Services',
            apple: 'Apple - Technology & Products',
            facebook: 'Facebook - Social Media Platform',
            twitter: 'Twitter - Social Media & News',
            linkedin: 'LinkedIn - Professional Network',
            reddit: 'Reddit - Social News & Discussion',
            wikipedia: 'Wikipedia - Free Encyclopedia',
            medium: 'Medium - Publishing Platform'
          };

          return (
            siteEnhancements[siteName.toLowerCase()] ||
            `${siteName.charAt(0).toUpperCase() + siteName.slice(1)} - ${domain}`
          );
        }
      }
    } catch (_error) {
      console.log('Error generating fallback title:', error);
    }

    // Return original title if no enhancement needed
    return originalTitle;
  }

  /**
   * Get existing folder structure to avoid creating duplicates
   * @returns {Promise<Array>} Array of existing folder paths
   */
  async _getExistingFolderStructure() {
    try {
      const existingFolders = [];

      // Get all bookmark folders from Bookmarks Bar (ID: 1)
      await this._collectFolderPaths('1', '', existingFolders);

      // Also check Other Bookmarks (ID: 2) if it has organized folders
      await this._collectFolderPaths('2', '', existingFolders);

      // Filter out default Chrome folders and empty paths
      const filteredFolders = existingFolders.filter(
        (folder) =>
          folder &&
          folder !== 'Bookmarks Bar' &&
          folder !== 'Other Bookmarks' &&
          folder !== 'Mobile Bookmarks' &&
          !folder.includes('Recently Added') &&
          folder.length > 0
      );

      console.log(`📁 Found ${filteredFolders.length} existing folders:`, filteredFolders);
      return filteredFolders;
    } catch (_error) {
      console.error('_error getting existing folder structure:', _error);
      return [];
    }
  }

  /**
   * Recursively collect folder paths
   * @param {string} parentId - Parent folder ID
   * @param {string} currentPath - Current path being built
   * @param {Array} folderPaths - Array to collect paths
   */
  async _collectFolderPaths(parentId, currentPath, folderPaths) {
    try {
      const children = await chrome.bookmarks.getChildren(parentId);

      for (const child of children) {
        if (!child.url) {
          // It's a folder
          const folderPath = currentPath ? `${currentPath} > ${child.title}` : child.title;
          folderPaths.push(folderPath);

          // Recursively collect subfolders
          await this._collectFolderPaths(child.id, folderPath, folderPaths);
        }
      }
    } catch (_error) {
      console.error(`Error collecting folder paths for parent ${parentId}:`, error);
    }
  }

  /**
   * Generate dynamic functional categories based on bookmark analysis (FMHY-style)
   * @param {Array} bookmarks - All bookmarks to analyze
   * @param {Array} suggestedCategories - Optional suggested categories
   * @param {Object} learningData - Learning data
   * @returns {Promise<Array>} Generated functional categories
   */
  async _generateDynamicCategories(bookmarks, suggestedCategories = [], learningData = {}) {
    // Take a sample of bookmarks for category generation (max 150 for better analysis)
    const sampleBookmarks = bookmarks.slice(0, Math.min(150, bookmarks.length));

    // Get existing folder structure to avoid duplicates
    const existingFolders = await this._getExistingFolderStructure();

    // Get user preferences for functional categories
    const settings = await this._getSettings();
    const maxDepth = settings.maxCategoryDepth || 3; // Allow 2-3 levels for functional organization (FMHY-style)
    const _functionalMode = settings.functionalMode !== false; // Default to true (FMHY-style)
    // NO LIMITS on number of categories - generate as many as needed for proper organization

    let prompt = `**Role:** Smart Functional Bookmark Category Generator (FMHY-Style)
**Task:** Analyze the following bookmarks and create a balanced functional category system organized by what services DO, not who provides them.

**EXISTING FOLDER STRUCTURE (REUSE THESE AS MUCH AS POSSIBLE):**
${
  existingFolders.length > 0
    ? existingFolders.map((folder) => `- ${folder}`).join('\n')
    : '- No existing folders found'
}

**CRITICAL INSTRUCTIONS:**
- **PRIORITIZE EXISTING FOLDERS:** Use the existing folder structure above whenever possible
- **AVOID DUPLICATES:** Do not create similar folders to existing ones (e.g., if "Development" exists, don't create "Programming" or "Coding")
- **EXTEND EXISTING:** Add practical subcategories to existing folders rather than creating new top-level categories
- **CONSISTENCY:** Match the naming style and hierarchy of existing folders
- **BALANCED GRANULARITY:** Create useful, practical categories that are neither too hierarchical nor too specific

**FUNCTIONAL CATEGORIZATION REQUIREMENTS (FMHY-Style):**
- Create AS MANY FUNCTIONAL categories as needed with MAXIMUM 2-3 levels deep
- NO LIMITS on number of categories - generate comprehensive functional organization
- Use format: "Category > Subcategory" or "Category > Subcategory > Type" (based on FMHY structure)
- Examples: "Tools > File Tools > Cloud Storage", "Adblocking / Privacy > VPN", "Education > Privacy Guides"
- **FUNCTIONAL ORGANIZATION:** Group services by WHAT THEY DO, not who provides them
- **PRACTICAL DEPTH:** Categories should be 2-3 levels deep for proper organization
- **SERVICE-AGNOSTIC:** Categories should contain ALL services that perform the same function
- **COMPREHENSIVE COVERAGE:** Create specific categories for every type of service/content found
- **REUSE EXISTING FOLDERS FIRST, but organize them functionally**

**FUNCTIONAL CATEGORIZATION RULES (FMHY-Style):**
- ✅ GOOD: "Tools > File Tools > Cloud Storage" (functional grouping of all cloud storage services)
- ✅ GOOD: "Adblocking / Privacy > VPN" (functional grouping of all VPN services)
- ✅ GOOD: "Adblocking / Privacy > Encrypted Messengers" (functional grouping of secure messaging)
- ✅ GOOD: "Web Privacy > Search Engines" (functional grouping of privacy-focused search)
- ✅ GOOD: "Education > Privacy Guides" (functional grouping of educational content)
- ❌ WRONG: "Google > Drive" (organized by company, not function)
- ❌ WRONG: "Microsoft > OneDrive" (organized by provider, not what it does)
- ❌ WRONG: "Popular Tools" (catch-all category, not functional)

**FUNCTIONAL ORGANIZATION PRINCIPLES (FMHY-Style):**
- Keep categories at 2-3 levels maximum for proper functional organization
- Group services by FUNCTION, not by provider or brand name
- Use descriptive names that explain what the services DO
- Organize by purpose: "Tools > File Tools > Cloud Storage" contains ALL cloud storage services
- Focus on functional categories that group similar services together
- Create categories that accommodate multiple service providers doing the same thing

**FOLDER NAME FORMATTING REQUIREMENTS:**
- **PROPER CAPITALIZATION:** Use proper Title Case for all category names
- **TECHNICAL TERMS:** Capitalize technical terms correctly (JavaScript, GitHub, API, UI, UX, iOS, etc.)
- **BRAND NAMES:** Use correct brand capitalization (GitHub, YouTube, LinkedIn, PayPal, etc.)
- **ACRONYMS:** Keep acronyms uppercase (AI, API, UI, UX, SEO, CSS, HTML, JSON, etc.)
- **CONSISTENT SPACING:** Use single spaces, proper spacing around separators
- **PROFESSIONAL APPEARANCE:** Categories should look polished and professional

**FORMATTING EXAMPLES (FMHY-Style):**
- ✅ CORRECT: "Adblocking / Privacy > VPN"
- ✅ CORRECT: "Tools > File Tools > Cloud Storage"
- ✅ CORRECT: "Adblocking / Privacy > Password Privacy / 2FA"
- ✅ CORRECT: "Web Privacy > Search Engines"
- ✅ CORRECT: "Education > Privacy Guides"
- ❌ WRONG: "adblocking / privacy > vpn"
- ❌ WRONG: "tools > file tools > cloud storage"
- ❌ WRONG: "web privacy>search engines"
- ❌ WRONG: "education>privacy guides"

**TECHNICAL TERM CAPITALIZATION GUIDE (FMHY-Style):**
- Privacy/Security: VPN, DNS, 2FA, Anti-Malware, URL, SSL, TLS
- Programming: JavaScript, TypeScript, Node.js, React.js, Vue.js, Angular.js, API, REST, GraphQL
- Platforms: GitHub, GitLab, Stack Overflow, YouTube, LinkedIn, Facebook, Google Drive, OneDrive
- Cloud Storage: MEGA, pCloud, Dropbox, iCloud, Google Drive, OneDrive
- Technologies: JSON, XML, CSS, HTML, SQL, NoSQL, VM, VirtualBox, VMware
- Mobile: iOS, Android, React Native, Flutter
- Cloud: AWS, Azure, Google Cloud, Docker, Kubernetes
- Business: B2B, B2C, SaaS, CRM, ERP, SEO, ROI, KPI
- Design: UI, UX, Figma, Adobe, Photoshop

**Current Bookmark Sample (${sampleBookmarks.length} bookmarks):**`;

    sampleBookmarks.forEach((bookmark, index) => {
      const title = bookmark.title || 'Untitled';
      const url = bookmark.url || '';
      const currentFolder = bookmark.currentFolderName || 'Root';
      let domain = 'unknown';
      try {
        if (url) {
          domain = new URL(url).hostname.replace('www.', '');
        }
      } catch (_e) {
        domain = 'invalid-url';
      }

      prompt += `\n${index + 1}. "${title}" (${domain}) - Currently in: ${currentFolder}`;
    });

    prompt += `\n\n**Suggested Categories (optional reference):** ${suggestedCategories.join(', ')}

**Learning Data:** Based on user preferences:`;

    if (Object.keys(learningData).length > 0) {
      for (const [pattern, category] of Object.entries(learningData)) {
        prompt += `\n- "${pattern}" → "${category}"`;
      }
    } else {
      prompt += '\n- No previous learning data available';
    }

    prompt += `\n\n**FUNCTIONAL HIERARCHICAL CATEGORY INSTRUCTIONS:**
- Analyze bookmark titles, domains, current folders, and content patterns
- Create FUNCTIONAL hierarchical categories with MAXIMUM ${maxDepth} levels using " > " separator
- Generate AS MANY category trees as needed based on FUNCTION, not service names (NO LIMITS)
- Create comprehensive functional organization - don't limit the number of categories
- Organize by WHAT THE TOOL DOES, not WHO PROVIDES IT
- Categories should be:
  * Functional and practical (e.g., "Tools > File Tools > Cloud Storage" contains Google Drive, Dropbox, OneDrive)
  * Organized by PURPOSE and FUNCTION, not by service provider
  * Based on actual bookmark functionality but kept simple
  * Include functional categories that group services by what they do

**FUNCTIONAL HIERARCHICAL CATEGORY EXAMPLES (UNLIMITED CATEGORIES - CREATE AS MANY AS NEEDED):**

**PRIVACY & SECURITY (Create specific subcategories):**
- "Adblocking / Privacy > VPN" (ProtonVPN, Mullvad, AirVPN, Windscribe, RiseupVPN)
- "Adblocking / Privacy > Encrypted Messengers" (Signal, SimpleX, Matrix, Wire)
- "Adblocking / Privacy > Password Privacy / 2FA" (2FA Directory, Ente Auth, Aegis, 2FAS, KeePassXC)
- "Adblocking / Privacy > Antivirus / Anti-Malware" (Malwarebytes, ESET, AdwCleaner)
- "Adblocking / Privacy > DNS Adblocking" (LibreDNS, NextDNS, DNSWarden, AdGuard DNS, Pi-Hole)
- "Web Privacy > Search Engines" (DuckDuckGo, Brave Search, Startpage, Mojeek, Searx)

**TOOLS & UTILITIES (Create specific subcategories for each tool type):**
- "Tools > File Tools > Cloud Storage" (Google Drive, Dropbox, OneDrive, MEGA, pCloud)
- "Tools > File Tools > Converters" (File format converters, compressors)
- "Tools > File Tools > Sharing" (WeTransfer, file hosting services)
- "Tools > System Tools > Virtual Machines" (VMware, VirtualBox, QEMU)
- "Tools > Image Tools > Editors" (Image editing tools)
- "Tools > Video Tools > Editors" (Video editing tools)
- "Tools > Audio Tools > Editors" (Audio editing tools)
- "Tools > Text Tools > Editors" (Text and markdown editors)
- "Tools > Utilities" (General calculators, converters, misc utilities)

**DEVELOPMENT (Create specific subcategories for each dev area):**
- "Development > Code Repositories" (GitHub, GitLab, Bitbucket, SourceForge)
- "Development > Documentation" (MDN, Stack Overflow, DevDocs, API references)
- "Development > Tools > IDEs" (VS Code, IntelliJ, online IDEs)
- "Development > Tools > Frameworks" (React, Angular, Vue documentation)
- "Development > Tools > Testing" (Testing frameworks, tools)
- "Development > Tools > Deployment" (Hosting, CI/CD platforms)

**EDUCATION (Create specific subcategories for each learning type):**
- "Education > Learning Platforms" (Coursera, Udemy, Khan Academy, edX)
- "Education > Programming Tutorials" (Coding bootcamps, programming courses)
- "Education > Language Learning" (Duolingo, language platforms)
- "Education > Academic Resources" (Research, academic databases)
- "Education > Privacy Guides" (Privacy Guides, security education)

**ENTERTAINMENT (Create specific subcategories for each entertainment type):**
- "Entertainment > Streaming > Video" (Netflix, YouTube, Twitch, Disney+)
- "Entertainment > Streaming > Music" (Spotify, Apple Music, SoundCloud)
- "Entertainment > Gaming > Platforms" (Steam, Epic Games, gaming stores)
- "Entertainment > Gaming > Resources" (Gaming news, guides, communities)
- "Entertainment > Books > Reading" (Goodreads, online libraries, ebooks)
- "Entertainment > Podcasts" (Podcast platforms and directories)

**BUSINESS (Create specific subcategories for each business function):**
- "Business > Productivity > Project Management" (Slack, Trello, Asana, Notion)
- "Business > Productivity > Communication" (Zoom, Teams, communication tools)
- "Business > Finance > Banking" (Online banking, financial services)
- "Business > Finance > Investment" (Trading platforms, investment tools)
- "Business > Finance > Cryptocurrency" (Crypto exchanges, blockchain tools)
- "Business > Marketing > SEO" (SEO tools, analytics platforms)

**SHOPPING (Create specific subcategories for each shopping type):**
- "Shopping > E-commerce > General" (Amazon, eBay, general marketplaces)
- "Shopping > E-commerce > Specialized" (Etsy, niche marketplaces)
- "Shopping > Price Comparison" (Price tracking, deal aggregators)
- "Shopping > Coupons & Deals" (Coupon sites, deal platforms)

**NEWS & MEDIA (Create specific subcategories for each news type):**
- "News > Technology News" (TechCrunch, Ars Technica, The Verge, Hacker News)
- "News > General News" (BBC, CNN, Reuters, Associated Press)
- "News > Industry Specific" (Industry publications, trade news)
- "News > Blogs & Opinion" (Personal blogs, opinion sites)

**SOCIAL & COMMUNICATION (Create specific subcategories):**
- "Social Media > Platforms" (Twitter, Facebook, Instagram, LinkedIn)
- "Social Media > Professional" (LinkedIn, professional networks)
- "Social Media > Communities" (Reddit, Discord, forums)

**IMPORTANT: CREATE AS MANY SPECIFIC CATEGORIES AS NEEDED!**
- Analyze ALL bookmarks and create specific functional categories for every type of service
- Don't limit yourself to these examples - create new categories as needed
- Be comprehensive and specific - users prefer detailed organization
- Group services by their actual function, not by popularity or provider

**OUTPUT FORMAT:**
Return a JSON array of FUNCTIONAL hierarchical category paths with proper capitalization.
CREATE AS MANY CATEGORIES AS NEEDED - NO LIMITS! Example structure:
[
  "Adblocking / Privacy > VPN",
  "Adblocking / Privacy > Encrypted Messengers",
  "Adblocking / Privacy > Password Privacy / 2FA",
  "Tools > File Tools > Cloud Storage",
  "Tools > File Tools > Converters",
  "Tools > Image Tools > Editors",
  "Tools > Video Tools > Editors",
  "Development > Code Repositories",
  "Development > Tools > IDEs",
  "Development > Tools > Frameworks",
  "Education > Learning Platforms",
  "Education > Programming Tutorials",
  "Entertainment > Streaming > Video",
  "Entertainment > Streaming > Music",
  "Entertainment > Gaming > Platforms",
  "Business > Productivity > Project Management",
  "Business > Finance > Banking",
  "Shopping > E-commerce > General",
  "News > Technology News",
  "Social Media > Platforms",
  "Tools > Utilities",
  ... (create as many specific categories as needed for comprehensive organization)
]

**CRITICAL FORMATTING REQUIREMENTS:**
- **PROPER CAPITALIZATION:** Use Title Case for all category names
- **TECHNICAL TERMS:** Capitalize correctly (JavaScript, Node.js, API, UI, UX, SEO, AI, etc.)
- **SEPARATORS:** Use " > " (space-greater-than-space) as the separator
- **CONSISTENCY:** Maintain consistent capitalization throughout all categories
- **PROFESSIONAL APPEARANCE:** Categories should look polished and ready for professional use

**CONTENT REQUIREMENTS:**
- Create FUNCTIONAL categories that group services by what they do
- Generate AS MANY functional category trees as needed (NO MAXIMUM LIMIT)
- Create comprehensive, specific categories for every type of service found
- NEVER use "Other" - all bookmarks must be categorized into specific functional categories
- If unsure, create new appropriate functional categories rather than using generic ones
- Organize by function, not by service provider or company name
- Follow FMHY-style functional organization principles
- Prioritize comprehensive coverage over category count limits

Return only the JSON array with properly formatted category names, no additional text or formatting.`;

    try {
      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      };

      // Use model fallback for category generation too
      const responseText = await this._generateCategoriesWithModelFallback(requestBody);

      // Parse the generated categories
      const cleanText = responseText
        .trim()
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '');
      const jsonMatch = cleanText.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const categories = JSON.parse(jsonMatch[0]);
        if (Array.isArray(categories) && categories.length > 0) {
          // Remove any "Other" categories if they exist
          const filteredCategories = categories.filter(
            (cat) => cat !== 'Other' && !cat.includes('Other')
          );

          // Ensure we have comprehensive functional categories
          const essentialCategories = [
            'Tools > Utilities',
            'Development > Tools',
            'Business > Productivity',
            'Entertainment > General',
            'Education > Resources'
          ];

          essentialCategories.forEach((essential) => {
            if (!filteredCategories.some((cat) => cat === essential)) {
              filteredCategories.push(essential);
            }
          });

          console.log('Successfully generated dynamic categories:', filteredCategories);
          return filteredCategories;
        }
      }

      throw new Error('Failed to parse generated categories from Gemini AI response');
    } catch (_error) {
      console.error('_error generating categories:', _error);
      throw new Error(`Failed to generate categories: ${_error.message}`);
    }
  }

  /**
   * Generate categories with Gemini model fallback sequence
   * @param {Object} requestBody - Request body for Gemini API
   * @returns {Promise<string>} Response text from successful model
   */
  async _generateCategoriesWithModelFallback(requestBody) {
    let lastError = null;
    const originalModelIndex = this.currentModelIndex;

    // Try each Gemini model for category generation
    for (let attempt = 0; attempt < this.geminiModels.length; attempt++) {
      const currentModel = this.getCurrentModelName();
      const currentUrl = this.getCurrentModelUrl();

      console.log(
        `🏷️ Generating categories with ${currentModel} (attempt ${
          attempt + 1
        }/${this.geminiModels.length})`
      );

      // Check if model is penalized
      if (this._isModelPenalized(currentModel)) {
        console.log(`⏭️ Skipping penalized model: ${currentModel}`);
        continue;
      }

      try {
        const response = await this.requestQueue.enqueue(
          async () => {
            return await fetch(currentUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': this.apiKey
              },
              body: JSON.stringify(requestBody)
            });
          },
          'gemini',
          'high'
        );

        if (response.ok) {
          const data = await response.json();
          const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

          if (responseText) {
            console.log(`✅ Category generation SUCCESS with ${currentModel}`);
            // Reset to original model for next operations
            this.currentModelIndex = originalModelIndex;
            return responseText;
          }
          throw new Error('Invalid category generation response format');
        }
        const errorText = await response.text();
        console.error(
          `❌ Category generation failed with ${currentModel}:`,
          response.status,
          errorText
        );

        // Check for quota exhaustion on 429 errors
        if (response.status === 429) {
          try {
            const errorData = JSON.parse(errorText);
            const { isQuotaExhausted, retryDelaySeconds } = this._checkQuotaExhaustion(errorData);

            if (isQuotaExhausted && retryDelaySeconds) {
              // Mark quota as exhausted
              await this._markQuotaExhausted(retryDelaySeconds);

              // Throw specific quota exhaustion error
              const quotaMessage = await this._getQuotaExhaustedMessage();
              throw new Error(`QUOTA_EXHAUSTED: ${quotaMessage}`);
            }
          } catch (parseError) {
            // If JSON parsing fails, continue with normal rate limit handling
            console.warn('Failed to parse quota error response:', parseError);
          }

          // Apply penalty for rate limits
          this._penalizeModel(currentModel);
        }

        // Check if this is a retryable error
        const isRetryableError =
          response.status === 429 || // Rate limit
          response.status === 503 || // Service unavailable
          response.status === 500 || // Server error
          response.status === 502 || // Bad gateway
          response.status === 504; // Gateway timeout

        if (!isRetryableError) {
          // Non-retryable errors - don't try other models
          if (response.status === 401) {
            throw new Error(
              'Invalid API key for category generation. Please check your Gemini API key.'
            );
          }
          if (response.status === 403) {
            throw new Error(
              'API access denied for category generation. Check your API key permissions.'
            );
          }
          if (response.status === 400) {
            throw new Error('Bad request for category generation. Check your API key format.');
          }
          throw new Error(`Category generation failed: ${response.status} - ${errorText}`);
        }

        lastError = new Error(`${currentModel}: ${response.status} - ${errorText}`);
      } catch (_error) {
        console.error(`❌ Category generation error with ${currentModel}:`, _error.message);
        lastError = _error;

        // If it's a non-retryable error, don't try other models
        if (
          _error.message.includes('Invalid API key') ||
          _error.message.includes('API access denied') ||
          _error.message.includes('Bad request')
        ) {
          throw _error;
        }
      }

      // Try next model if available
      if (attempt < this.geminiModels.length - 1) {
        if (!this.tryNextGeminiModel()) {
          break;
        }
        // Small delay between model attempts
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Reset to original model
    this.currentModelIndex = originalModelIndex;

    // All models failed
    throw new Error(
      `Category generation failed with all Gemini models. Last error: ${lastError?.message}`
    );
  }

  /**
   * Process a batch of bookmarks
   * @param {Array} batch - Batch of bookmarks
   * @param {Array} dynamicCategories - Available categories
   * @param {Object} learningData - Learning data
   * @param {Function} onMarkAsAIMoved - Optional callback to mark bookmark as AI-moved
   * @returns {Promise<Array>} Categorization results
   */
  async processBatch(batch, dynamicCategories, learningData, onMarkAsAIMoved = null) {
    return await this._processBatchWithProviderFallback(
      batch,
      dynamicCategories,
      learningData,
      onMarkAsAIMoved
    );
  }

  /**
   * Process batch with provider fallback (cross-provider model size ordering)
   * @param {Array} batch - Batch of bookmarks
   * @param {Array} categories - Available categories
   * @param {Object} learningData - Learning data
   * @param {Function} onMarkAsAIMoved - Optional callback
   * @returns {Promise<Array>} Batch results
   */
  async _processBatchWithProviderFallback(batch, categories, learningData, onMarkAsAIMoved = null) {
    console.log('\n🔄 === PROVIDER FALLBACK ORCHESTRATOR (Size-Based Model Ordering) ===');
    console.log(`📦 Processing batch of ${batch.length} bookmarks`);
    console.log(
      `🔑 Available providers: Gemini=${!!this.apiKey}, Cerebras=${!!this
        .cerebrasApiKey}, Groq=${!!this.groqApiKey}`
    );

    // Build unified model list sorted by size descending
    const allModels = [];

    // Add Gemini models (always available with apiKey)
    if (this.apiKey) {
      this.geminiModels.forEach((model) => allModels.push({ ...model, provider: 'gemini' }));
    }

    // Add Cerebras models if key available
    if (this.cerebrasApiKey) {
      this.cerebrasModels.forEach((model) => allModels.push(model));
    }

    // Add Groq models if key available
    if (this.groqApiKey) {
      this.groqModels.forEach((model) => allModels.push(model));
    }

    // Filter out penalized models (unless all are penalized, then try anyway)
    const activeModels = allModels.filter((m) => !this._isModelPenalized(m.name));
    const penalizedModels = allModels.filter((m) => this._isModelPenalized(m.name));

    let modelsToTry = activeModels;
    if (activeModels.length === 0) {
      console.warn('⚠️ All models are currently penalized. Forcing retry with all models.');
      modelsToTry = allModels;
    } else if (penalizedModels.length > 0) {
      console.log(
        `ℹ️ Skipping ${penalizedModels.length} penalized models: ${penalizedModels.map((m) => m.name).join(', ')}`
      );
    }

    console.log('\n📊 Model sequence:');
    modelsToTry.forEach((model, idx) => {
      console.log(`   ${idx + 1}. ${model.provider.toUpperCase()}: ${model.name}`);
    });

    // Try models in order
    let lastError = null;
    for (let i = 0; i < modelsToTry.length; i++) {
      const model = modelsToTry[i];
      console.log(
        `\n🔄 Trying model ${i + 1}/${
          modelsToTry.length
        }: ${model.provider.toUpperCase()} - ${model.name}`
      );

      try {
        let result;
        if (model.provider === 'gemini') {
          result = await this._processWithGemini(batch, categories, learningData, model.name);
        } else if (model.provider === 'cerebras') {
          const prompt = await this._buildPrompt(batch, categories, learningData);
          result = await this._processWithCerebras(prompt, batch, model.name);
        } else if (model.provider === 'groq') {
          const prompt = await this._buildPrompt(batch, categories, learningData);
          result = await this._processWithGroq(prompt, batch, model.name);
        }

        if (result) {
          console.log(
            `✅ SUCCESS: Batch processed with ${model.provider.toUpperCase()} - ${model.name}`
          );

          // IMMEDIATELY MOVE each bookmark in the batch after categorization
          console.log(`🚚 IMMEDIATE BATCH MOVEMENT: Moving ${result.length} bookmarks...`);

          for (let j = 0; j < result.length; j++) {
            const item = result[j];

            // Apply category grouping if available
            let finalCategory = item.category;
            if (this.categoryGrouper) {
              finalCategory = this.categoryGrouper.getGroupedCategory(item.category);
            }

            // Find original bookmark from batch
            const bookmark = batch.find((b) => b.id === item.bookmarkId) || batch[j];

            if (bookmark) {
              try {
                await this._moveBookmarkImmediately(
                  bookmark,
                  finalCategory,
                  item.title,
                  j + 1,
                  batch.length,
                  onMarkAsAIMoved
                );
              } catch (moveError) {
                console.error(`❌ Failed to move bookmark ${bookmark.id}:`, moveError);
              }
            }
          }

          return result;
        }
      } catch (_error) {
        console.log(`❌ ${model.provider.toUpperCase()} - ${model.name} failed: ${_error.message}`);
        lastError = _error;

        // Check for truncation error and retry with smaller batches
        if (_error.isTruncation && batch.length > 1) {
          console.warn('⚠️ JSON truncation detected! Retrying with split batches...');
          return await this._retryWithSmallerBatches(batch, categories, learningData, model);
        }

        // Handle rate limits with penalty
        if (_error.message.includes('429') || _error.message.includes('quota')) {
          this._penalizeModel(model.name);
        }

        // Stop trying if it's a non-retryable error
        if (
          _error.message.includes('Invalid API key') ||
          _error.message.includes('API access denied') ||
          _error.message.includes('Unauthorized')
        ) {
          console.log(
            `⚠️ Non-retryable error detected, stopping model fallback for ${model.provider}`
          );
        }

        // Small delay between attempts
        if (i < modelsToTry.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    // All models failed
    console.error('❌ All models across all providers failed');
    throw new Error(`All AI providers exhausted. Last error: ${lastError?.message}`);
  }

  /**
   * Process batch with Gemini model fallback sequence
   * @param {Array} batch - Batch of bookmarks
   * @param {Array} categories - Available categories
   * @param {Object} learningData - Learning data
   * @returns {Promise<Array>} Batch results
   */
  async _processBatchWithGeminiModels(batch, categories, learningData) {
    const prompt = await this._buildPrompt(batch, categories, learningData);
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ]
    };

    // Try each Gemini model in sequence
    let lastError = null;
    const originalModelIndex = this.currentModelIndex;

    for (let attempt = 0; attempt < this.geminiModels.length; attempt++) {
      const currentModel = this.getCurrentModelName();
      const currentUrl = this.getCurrentModelUrl();

      console.log(
        `🤖 Trying Gemini model: ${currentModel} (attempt ${
          attempt + 1
        }/${this.geminiModels.length})`
      );

      try {
        const requestStart = Date.now();
        const response = await this.requestQueue.enqueue(
          async () => {
            return await fetch(currentUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': this.apiKey
              },
              body: JSON.stringify(requestBody)
            });
          },
          'gemini',
          'normal'
        );
        const responseTime = Date.now() - requestStart;

        if (response.ok) {
          const data = await response.json();

          if (data.candidates?.[0]?.content) {
            const responseText = data.candidates[0].content.parts[0].text;
            console.log(`✅ SUCCESS with ${currentModel}`);

            // Record API usage analytics
            if (this.analyticsService) {
              await this.analyticsService.recordApiUsage({
                provider: 'gemini',
                model: currentModel,
                success: true,
                responseTime,
                batchSize: batch.length,
                tokensUsed: data.usageMetadata?.totalTokenCount || 0
              });
            }

            // Record rate limit tracking
            if (this.performanceMonitor) {
              await this.performanceMonitor.recordApiRequest('gemini', true, false, false);
            }

            return this._parseResponse(responseText, batch);
          }
          throw new Error('Invalid API response format');
        }
        const errorText = await response.text();
        console.error(`❌ ${currentModel} failed:`, response.status, errorText);

        // Record API failure analytics
        if (this.analyticsService) {
          await this.analyticsService.recordApiUsage({
            provider: 'gemini',
            model: currentModel,
            success: false,
            responseTime,
            batchSize: batch.length,
            errorType: `${response.status}`
          });
        }

        // Check if this is a retryable error (rate limit, server overload, etc.)
        const isRetryableError =
          response.status === 429 || // Rate limit
          response.status === 503 || // Service unavailable
          response.status === 500 || // Server error
          response.status === 502 || // Bad gateway
          response.status === 504; // Gateway timeout

        // Record rate limit tracking
        if (this.performanceMonitor) {
          const throttled = response.status === 429;
          const rejected = response.status === 429;
          await this.performanceMonitor.recordApiRequest('gemini', false, throttled, rejected);
        }

        if (!isRetryableError) {
          // Non-retryable errors (auth, bad request, etc.) - don't try other models
          if (response.status === 401) {
            throw new Error(
              'Invalid API key. Please check your Gemini API key in settings. Make sure it starts with "AIza" and is from Google AI Studio.'
            );
          }
          if (response.status === 403) {
            throw new Error(
              'API access denied. Please check your API key permissions and ensure Gemini API is enabled.'
            );
          }
          if (response.status === 400) {
            throw new Error('Bad request. Please check your API key format and try again.');
          }
          throw new Error(`Gemini API request failed: ${response.status}. ${errorText}`);
        }

        lastError = new Error(`${currentModel}: ${response.status} - ${errorText}`);
      } catch (_error) {
        console.error(`❌ ${currentModel} _error:`, _error.message);
        lastError = _error;

        // If it's a non-retryable error, don't try other models
        if (
          _error.message.includes('Invalid API key') ||
          _error.message.includes('API access denied') ||
          _error.message.includes('Bad request')
        ) {
          throw _error;
        }
      }

      // Try next model if available
      if (attempt < this.geminiModels.length - 1) {
        if (!this.tryNextGeminiModel()) {
          break;
        }
        // Small delay between model attempts
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // All Gemini models failed
    console.error('❌ All Gemini models failed.');

    // Reset to original model for next batch
    this.currentModelIndex = originalModelIndex;

    throw new Error(`All Gemini models failed. Last error: ${lastError?.message}`);
  }

  /**
   * Process batch with Cerebras model fallback sequence
   * @param {Array} batch - Batch of bookmarks
   * @param {Array} categories - Available categories
   * @param {Object} learningData - Learning data
   * @returns {Promise<Array>} Batch results
   */
  async _processBatchWithCerebrasModels(batch, categories, learningData) {
    const prompt = await this._buildPrompt(batch, categories, learningData);
    let lastError = null;

    // Try each Cerebras model in sequence
    for (let modelIndex = 0; modelIndex < this.cerebrasModels.length; modelIndex++) {
      const currentModel = this.cerebrasModels[modelIndex];
      console.log(
        `🧠 Trying Cerebras model: ${currentModel} (${modelIndex + 1}/${
          this.cerebrasModels.length
        })`
      );

      try {
        const result = await this._processWithCerebras(prompt, batch, currentModel);
        console.log(`✅ SUCCESS with Cerebras ${currentModel}`);
        return result;
      } catch (_error) {
        console.log(`❌ Cerebras ${currentModel} failed: ${_error.message}`);
        lastError = _error;

        // If it's a non-retryable error, don't try other models
        if (
          _error.message.includes('Invalid API key') ||
          _error.message.includes('API access denied') ||
          _error.message.includes('Unauthorized')
        ) {
          throw _error;
        }

        // Small delay between model attempts
        if (modelIndex < this.cerebrasModels.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    throw new Error(`All Cerebras models failed. Last error: ${lastError?.message}`);
  }

  /**
   * Process batch with Cerebras API (OpenAI-compatible format) with exponential backoff
   * @param {string} prompt - Formatted prompt
   * @param {Array} batch - Batch of bookmarks
   * @param {string} model - Cerebras model name
   * @returns {Promise<Array>} Batch results
   */
  async _processWithCerebras(prompt, batch, model) {
    const maxTokens = this._calculateMaxTokens(batch.length);
    const requestBody = {
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are a bookmark categorization expert. Always return valid JSON arrays.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: maxTokens
    };

    // Exponential backoff retry logic
    for (let retryAttempt = 0; retryAttempt <= this.maxRetries; retryAttempt++) {
      try {
        const requestStart = Date.now();
        console.log(
          `   🔄 Cerebras ${model} request attempt ${retryAttempt + 1}/${this.maxRetries + 1}`
        );

        const response = await this.requestQueue.enqueue(
          async () => {
            return await fetch(this.cerebrasBaseUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.cerebrasApiKey}`
              },
              body: JSON.stringify(requestBody)
            });
          },
          'cerebras',
          'normal'
        );

        const responseTime = Date.now() - requestStart;

        if (response.ok) {
          const data = await response.json();

          if (data.choices?.[0]?.message) {
            const responseText = data.choices[0].message.content;
            console.log(`   ✅ Cerebras ${model} SUCCESS (${responseTime}ms)`);

            // Record API usage analytics
            if (this.analyticsService) {
              await this.analyticsService.recordApiUsage({
                provider: 'cerebras',
                model: model,
                success: true,
                responseTime,
                batchSize: batch.length,
                tokensUsed: data.usage?.total_tokens || 0,
                retryAttempt: retryAttempt
              });
            }

            // Record rate limit tracking
            if (this.performanceMonitor) {
              await this.performanceMonitor.recordApiRequest('cerebras', true, false, false);
            }

            return this._parseResponse(responseText, batch);
          }
          throw new Error('Invalid Cerebras API response format');
        }
        const errorText = await response.text();
        const isRateLimitError = response.status === 429;
        const isServerError =
          response.status === 503 ||
          response.status === 500 ||
          response.status === 502 ||
          response.status === 504;

        console.log(
          `   ❌ Cerebras ${model} failed: ${
            response.status
          } (attempt ${retryAttempt + 1}/${this.maxRetries + 1})`
        );
        console.log(`   Error details: ${errorText.substring(0, 200)}`);

        // Record API failure analytics
        if (this.analyticsService) {
          await this.analyticsService.recordApiUsage({
            provider: 'cerebras',
            model: model,
            success: false,
            responseTime,
            batchSize: batch.length,
            errorType: `${response.status}`,
            retryAttempt: retryAttempt
          });
        }

        // Record rate limit tracking
        if (this.performanceMonitor) {
          const throttled = isRateLimitError;
          const rejected = isRateLimitError;
          await this.performanceMonitor.recordApiRequest('cerebras', false, throttled, rejected);
        }

        // Check if this is a retryable error
        const isRetryableError = isRateLimitError || isServerError;

        if (!isRetryableError) {
          // Non-retryable errors (auth, bad request, etc.)
          if (response.status === 401) {
            throw new Error(
              'Invalid Cerebras API key. Please check your API key (should start with "csk-").'
            );
          }
          if (response.status === 403) {
            throw new Error('Cerebras API access denied. Please check your API key permissions.');
          }
          if (response.status === 400) {
            throw new Error('Bad request to Cerebras API. Please check your configuration.');
          }
          throw new Error(`Cerebras API request failed: ${response.status}. ${errorText}`);
        }

        // If this is the last retry, throw the error
        if (retryAttempt >= this.maxRetries) {
          if (isRateLimitError) {
            throw new Error(`Cerebras rate limit exceeded after ${this.maxRetries + 1} attempts`);
          }
          throw new Error(
            `Cerebras server error (${response.status}) after ${this.maxRetries + 1} attempts`
          );
        }

        // Calculate exponential backoff delay with jitter
        const baseDelay = this.baseRetryDelay * 2 ** retryAttempt;
        const jitter = Math.random() * 1000; // Add 0-1s jitter
        const retryDelay = Math.min(baseDelay + jitter, this.maxRetryDelay);

        console.log(
          `   ⏳ Rate limit/server error detected. Retrying in ${Math.round(retryDelay / 1000)}s...`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } catch (_error) {
        console.log(
          `   ❌ Cerebras ${model} error on attempt ${retryAttempt + 1}: ${_error.message}`
        );

        // If it's a non-retryable error, throw immediately
        if (
          _error.message.includes('Invalid') ||
          _error.message.includes('denied') ||
          _error.message.includes('Unauthorized') ||
          _error.message.includes('Bad request')
        ) {
          throw _error;
        }

        // If this is the last retry, throw the error
        if (retryAttempt >= this.maxRetries) {
          throw _error;
        }

        // Retry with exponential backoff
        const baseDelay = this.baseRetryDelay * 2 ** retryAttempt;
        const jitter = Math.random() * 1000;
        const retryDelay = Math.min(baseDelay + jitter, this.maxRetryDelay);

        console.log(
          `   ⏳ Network/timeout error. Retrying in ${Math.round(retryDelay / 1000)}s...`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }

    throw new Error(`Cerebras ${model} failed after ${this.maxRetries + 1} attempts`);
  }

  /**
   * Process batch with Groq API (OpenAI-compatible format) with exponential backoff
   * @param {string} prompt - Formatted prompt
   * @param {Array} batch - Batch of bookmarks
   * @param {string} model - Groq model name
   * @returns {Promise<Array>} Batch results
   */
  async _processWithGroq(prompt, batch, model) {
    const maxTokens = this._calculateMaxTokens(batch.length);
    const requestBody = {
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are a bookmark categorization expert. Always return valid JSON arrays.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: maxTokens
    };

    // Exponential backoff retry logic
    for (let retryAttempt = 0; retryAttempt <= this.maxRetries; retryAttempt++) {
      try {
        const requestStart = Date.now();
        console.log(
          `   🔄 Groq ${model} request attempt ${retryAttempt + 1}/${this.maxRetries + 1}`
        );

        const response = await this.requestQueue.enqueue(
          async () => {
            return await fetch(this.groqBaseUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.groqApiKey}`
              },
              body: JSON.stringify(requestBody)
            });
          },
          'groq',
          'normal'
        );

        const responseTime = Date.now() - requestStart;

        if (response.ok) {
          const data = await response.json();

          if (data.choices?.[0]?.message) {
            const responseText = data.choices[0].message.content;
            console.log(`   ✅ Groq ${model} SUCCESS (${responseTime}ms)`);

            // Record API usage analytics
            if (this.analyticsService) {
              await this.analyticsService.recordApiUsage({
                provider: 'groq',
                model: model,
                success: true,
                responseTime,
                batchSize: batch.length,
                tokensUsed: data.usage?.total_tokens || 0,
                retryAttempt: retryAttempt
              });
            }

            // Record rate limit tracking
            if (this.performanceMonitor) {
              await this.performanceMonitor.recordApiRequest('groq', true, false, false);
            }

            return this._parseResponse(responseText, batch);
          }
          throw new Error('Invalid Groq API response format');
        }
        const errorText = await response.text();
        const isRateLimitError = response.status === 429;
        const isServerError =
          response.status === 503 ||
          response.status === 500 ||
          response.status === 502 ||
          response.status === 504;

        console.log(
          `   ❌ Groq ${model} failed: ${
            response.status
          } (attempt ${retryAttempt + 1}/${this.maxRetries + 1})`
        );
        console.log(`   Error details: ${errorText.substring(0, 200)}`);

        // Record API failure analytics
        if (this.analyticsService) {
          await this.analyticsService.recordApiUsage({
            provider: 'groq',
            model: model,
            success: false,
            responseTime,
            batchSize: batch.length,
            errorType: `${response.status}`,
            retryAttempt: retryAttempt
          });
        }

        // Record rate limit tracking
        if (this.performanceMonitor) {
          const throttled = isRateLimitError;
          const rejected = isRateLimitError;
          await this.performanceMonitor.recordApiRequest('groq', false, throttled, rejected);
        }

        // Check if this is a retryable error
        const isRetryableError = isRateLimitError || isServerError;

        if (!isRetryableError) {
          // Non-retryable errors (auth, bad request, etc.)
          if (response.status === 401) {
            throw new Error(
              'Invalid Groq API key. Please check your API key (should start with "gsk_").'
            );
          }
          if (response.status === 403) {
            throw new Error('Groq API access denied. Please check your API key permissions.');
          }
          if (response.status === 400) {
            throw new Error('Bad request to Groq API. Please check your configuration.');
          }
          throw new Error(`Groq API request failed: ${response.status}. ${errorText}`);
        }

        // If this is the last retry, throw the error
        if (retryAttempt >= this.maxRetries) {
          if (isRateLimitError) {
            throw new Error(`Groq rate limit exceeded after ${this.maxRetries + 1} attempts`);
          }
          throw new Error(
            `Groq server error (${response.status}) after ${this.maxRetries + 1} attempts`
          );
        }

        // Calculate exponential backoff delay with jitter
        const baseDelay = this.baseRetryDelay * 2 ** retryAttempt;
        const jitter = Math.random() * 1000; // Add 0-1s jitter
        const retryDelay = Math.min(baseDelay + jitter, this.maxRetryDelay);

        console.log(
          `   ⏳ Rate limit/server error detected. Retrying in ${Math.round(retryDelay / 1000)}s...`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } catch (_error) {
        console.log(`   ❌ Groq ${model} error on attempt ${retryAttempt + 1}: ${_error.message}`);

        // If it's a non-retryable error, throw immediately
        if (
          _error.message.includes('Invalid') ||
          _error.message.includes('denied') ||
          _error.message.includes('Unauthorized') ||
          _error.message.includes('Bad request')
        ) {
          throw _error;
        }

        // If this is the last retry, throw the error
        if (retryAttempt >= this.maxRetries) {
          throw _error;
        }

        // Retry with exponential backoff
        const baseDelay = this.baseRetryDelay * 2 ** retryAttempt;
        const jitter = Math.random() * 1000;
        const retryDelay = Math.min(baseDelay + jitter, this.maxRetryDelay);

        console.log(
          `   ⏳ Network/timeout error. Retrying in ${Math.round(retryDelay / 1000)}s...`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }

    throw new Error(`Groq ${model} failed after ${this.maxRetries + 1} attempts`);
  }

  /**
   * Process single Gemini model request
   * @param {Array} batch - Batch of bookmarks
   * @param {Array} categories - Available categories
   * @param {Object} learningData - Learning data
   * @param {string} modelName - Gemini model name
   * @returns {Promise<Array>} Batch results
   */
  async _processWithGemini(batch, categories, learningData, modelName) {
    const prompt = await this._buildPrompt(batch, categories, learningData);
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ]
    };

    const url = this.baseUrlTemplate.replace('{model}', modelName);

    const requestStart = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey
      },
      body: JSON.stringify(requestBody)
    });
    const responseTime = Date.now() - requestStart;

    if (response.ok) {
      const data = await response.json();

      if (data.candidates?.[0]?.content) {
        const responseText = data.candidates[0].content.parts[0].text;
        console.log(`✅ SUCCESS with ${modelName}`);

        // Record API usage analytics
        if (this.analyticsService) {
          await this.analyticsService.recordApiUsage({
            provider: 'gemini',
            model: modelName,
            success: true,
            responseTime,
            batchSize: batch.length,
            tokensUsed: data.usageMetadata?.totalTokenCount || 0
          });
        }

        return this._parseResponse(responseText, batch);
      }
      throw new Error('Invalid API response format');
    }
    const errorText = await response.text();
    console.error(`❌ ${modelName} failed:`, response.status, errorText);

    // Record API failure analytics
    if (this.analyticsService) {
      await this.analyticsService.recordApiUsage({
        provider: 'gemini',
        model: modelName,
        success: false,
        responseTime,
        batchSize: batch.length,
        errorType: `${response.status}`
      });
    }

    // Handle specific error types
    if (response.status === 401) {
      throw new Error('Invalid API key. Please check your Gemini API key in settings.');
    }
    if (response.status === 403) {
      throw new Error('API access denied. Please check your API key permissions.');
    }
    if (response.status === 400) {
      throw new Error('Bad request. Please check your API key format.');
    }
    throw new Error(`Gemini API request failed: ${response.status}. ${errorText}`);
  }

  /**
   * Build prompt for Gemini API
   * @param {Array} bookmarks - Bookmarks to categorize
   * @param {Array} categories - Available categories
   * @param {Object} learningData - Learning data
   * @returns {string} Formatted prompt
   */
  async _buildPrompt(bookmarks, categories, learningData) {
    // Get existing folder structure to include in prompt
    const existingFolders = await this._getExistingFolderStructure();

    let prompt = `**Role:** Smart Bookmark Categorization and Title Optimization Expert
**Task:** Analyze the following bookmarks and assign each to the most appropriate practical category, and generate clear, descriptive titles.

**EXISTING FOLDER STRUCTURE (PRIORITIZE THESE):**
${
  existingFolders.length > 0
    ? existingFolders.map((folder) => `- ${folder}`).join('\n')
    : '- No existing folders found'
}

**Available Categories:** ${categories.join(', ')}

**CRITICAL CATEGORIZATION INSTRUCTIONS:**
- **NEVER USE "OTHER":** ABSOLUTELY FORBIDDEN to use "Other" category - ALL bookmarks must be categorized into specific functional categories
- **MANDATORY CATEGORIZATION:** Every bookmark MUST be assigned to a specific functional category from the available list
- **ANALYZE CURRENT CATEGORY:** Look at the bookmark's current category and determine if it's appropriate
- **CHANGE WRONG CATEGORIES:** If the current category is incorrect, assign the correct one from the available list
- **CONTENT-BASED CATEGORIZATION:** Use URL domain, path, title, and content type to determine the correct category
- **FUNCTIONAL GROUPING:** Group services by what they DO, not who provides them
- **FALLBACK STRATEGY:** If unsure, use "Tools > Utilities" for general tools, but prefer specific functional categories
- **RESPECT CONTENT TYPE:** Match the actual content type to appropriate functional categories
- **USE RISK FLAGS:** Pay attention to risk flags and categorize accordingly
- **USER-FRIENDLY:** Choose categories that users will easily understand and remember

**FUNCTIONAL CATEGORIZATION RULES BY CONTENT TYPE (FMHY-Style):**
- **Cloud Storage Services:** Should go to "Tools > File Tools > Cloud Storage" (Google Drive, Dropbox, OneDrive, MEGA, pCloud)
- **VPN Services:** Should go to "Adblocking / Privacy > VPN" (ProtonVPN, Mullvad, AirVPN, Windscribe)
- **Password Managers/2FA:** Should go to "Adblocking / Privacy > Password Privacy / 2FA" (KeePassXC, Aegis, 2FAS)
- **Encrypted Messengers:** Should go to "Adblocking / Privacy > Encrypted Messengers" (Signal, Matrix, Wire)
- **Search Engines:** Should go to "Web Privacy > Search Engines" (DuckDuckGo, Brave Search, Startpage)
- **Antivirus/Security:** Should go to "Adblocking / Privacy > Antivirus / Anti-Malware" (Malwarebytes, ESET)
- **DNS Services:** Should go to "Adblocking / Privacy > DNS Adblocking" (Pi-Hole, AdGuard DNS, NextDNS)
- **Virtual Machines:** Should go to "Tools > System Tools > Virtual Machines" (VMware, VirtualBox, QEMU)
- **Code Repositories:** Should go to "Development > Code Repositories" (GitHub, GitLab, Bitbucket)
- **Streaming Services:** Should go to "Entertainment > Streaming" (Netflix, YouTube, Twitch, Spotify)
- **E-commerce Sites:** Should go to "Shopping > E-commerce" (Amazon, eBay, Etsy)
- **Privacy Guides:** Should go to "Education > Privacy Guides" (Privacy Guides, The New Oil)

**FUNCTIONAL CATEGORIZATION EXAMPLES (Based on FMHY Structure):**
- ✅ GOOD: "Adblocking / Privacy > VPN" (ProtonVPN, Mullvad, AirVPN - grouped by function)
- ✅ GOOD: "Tools > File Tools > Cloud Storage" (Google Drive, Dropbox, OneDrive - grouped by what they do)
- ✅ GOOD: "Adblocking / Privacy > Encrypted Messengers" (Signal, Matrix, Wire - grouped by function)
- ✅ GOOD: "Education > Privacy Guides" (Privacy Guides, The New Oil - grouped by content type)
- ✅ GOOD: "Web Privacy > Search Engines" (DuckDuckGo, Brave Search, Startpage - grouped by function)
- ❌ WRONG: "Google > Drive" (organized by service provider, not function)
- ❌ WRONG: "Microsoft > OneDrive" (organized by company, not what it does)
- ❌ WRONG: "Popular Tools" (catch-all category, not functional)

**FUNCTIONAL CATEGORIZATION RULES:**
- Use MAXIMUM 2-3 levels of hierarchy for ALL bookmarks
- Organize by FUNCTION/PURPOSE, not by service provider or company name
- Group services that do the same thing together (e.g., all cloud storage services together)
- Categories should describe WHAT THE SERVICE DOES, not WHO PROVIDES IT
- Follow FMHY-style functional organization: Category > Subcategory > Item
- Cloud storage should contain ALL cloud storage services (Google Drive, Dropbox, OneDrive, etc.)
- VPN category should contain ALL VPN services (ProtonVPN, Mullvad, etc.)
- Never create categories named after specific companies or services

**TITLE GENERATION INSTRUCTIONS:**
- **GENERATE IMPROVED TITLES:** Create descriptive, clear titles for each bookmark
- **INCLUDE CONTEXT:** Add relevant context from URL domain and page content
- **BE DESCRIPTIVE:** Make titles self-explanatory and informative
- **MAINTAIN BREVITY:** Keep titles concise but descriptive (50-80 characters ideal)
- **ADD VALUE:** Include key information that helps identify the bookmark's purpose
- **EXAMPLES:**
  - Original: "GitHub" → Improved: "GitHub - Code Repository Platform"
  - Original: "Docs" → Improved: "React Documentation - JavaScript Library Guide"
  - Original: "Home" → Improved: "Netflix - Streaming Movies & TV Shows"
  - Original: "Dashboard" → Improved: "AWS Console - Cloud Services Dashboard"

**CATEGORY NAME FORMATTING REQUIREMENTS:**
- **USE EXACT CATEGORY NAMES:** Select categories from the available list using their exact capitalization
- **PROPER TECHNICAL TERMS:** When categories contain technical terms, ensure they're properly capitalized
- **CONSISTENT FORMATTING:** Match the formatting style of the provided categories exactly
- **PROFESSIONAL APPEARANCE:** Categories should look polished and professional

**CATEGORY FORMATTING EXAMPLES:**
- ✅ CORRECT: "Development > Frontend > JavaScript" (proper technical term capitalization)
- ✅ CORRECT: "Business > Marketing > SEO" (acronym properly capitalized)
- ✅ CORRECT: "Design > UI & UX > Resources" (acronyms and spacing correct)
- ✅ CORRECT: "Technology > AI & Machine Learning" (proper acronym and title case)
- ❌ WRONG: "development > frontend > javascript" (all lowercase)
- ❌ WRONG: "Business > Marketing > seo" (inconsistent capitalization)
- ❌ WRONG: "design > ui&ux > resources" (poor spacing and capitalization)

**LEARNING DATA - CRITICAL CATEGORIZATION PATTERNS:**
Based on previous user corrections and manual categorizations, follow these patterns EXACTLY:`;

    // Add learning data if available
    if (Object.keys(learningData).length > 0) {
      prompt += '\n**USER-CORRECTED PATTERNS (HIGHEST PRIORITY):**';
      for (const [pattern, category] of Object.entries(learningData)) {
        prompt += `\n- ✅ URLs/titles containing "${pattern}" → MUST go to "${category}"`;
      }
      prompt +=
        '\n\n**IMPORTANT:** These patterns are based on user corrections. Follow them exactly to avoid repeating mistakes.';
    } else {
      prompt += '\n- No previous learning data available - use content analysis for categorization';
    }

    prompt += '\n\n**Bookmarks to Categorize:**';

    bookmarks.forEach((bookmark, index) => {
      const title = bookmark.title || 'Untitled';
      const url = bookmark.url || '';
      const currentFolder = bookmark.currentFolderName || 'Root';
      const folderPath = bookmark.currentFolder || 'Root';
      let domain = 'unknown';
      let urlPath = '';

      try {
        if (url) {
          const urlObj = new URL(url);
          domain = urlObj.hostname.replace('www.', '');
          urlPath = urlObj.pathname + urlObj.search;
        }
      } catch (_e) {
        domain = 'invalid-url';
      }

      // Extract additional context from URL and title
      const urlKeywords = this._extractUrlKeywords(url, title);
      const contentType = this._detectContentType(url, title);
      const riskFlags = this._detectRiskFlags(url, title);

      prompt += `\n${index + 1}. BOOKMARK ANALYSIS:`;
      prompt += `\n   Current Title: "${title}"`;
      prompt += `\n   Current Category: "${currentFolder}" (Path: ${folderPath})`;
      prompt += `\n   Domain: "${domain}"`;
      prompt += `\n   URL Path: "${urlPath}"`;
      prompt += `\n   Full URL: "${url}"`;
      prompt += `\n   Content Type: ${contentType}`;
      prompt += `\n   Keywords: ${urlKeywords.join(', ')}`;
      if (riskFlags.length > 0) {
        prompt += `\n   ⚠️ RISK FLAGS: ${riskFlags.join(', ')}`;
      }
      prompt += '\n   ---';
    });

    prompt += `\n\n**OUTPUT REQUIREMENTS:**
- Return JSON array with same number of items as input bookmarks
- Each item must have 'id' (bookmark position 1-${bookmarks.length}), 'category' (full hierarchical path), 'title' (improved descriptive title), 'confidence' (0.0-1.0), and 'categoryChanged' (true/false)
- **ABSOLUTELY NO "OTHER" CATEGORY:** NEVER use "Other" - this is strictly forbidden
- **MANDATORY SPECIFIC CATEGORIZATION:** Every bookmark MUST be assigned to a specific functional category
- **ANALYZE CURRENT CATEGORY:** Compare the current category with the correct category based on content analysis
- **CHANGE WRONG CATEGORIES:** If current category is incorrect, assign the correct one and set 'categoryChanged': true
- **USE EXACT CATEGORY NAMES:** Select categories from the available list using their exact capitalization and formatting
- **MAINTAIN PROPER FORMATTING:** Category must be the full path with proper capitalization (e.g., "Adblocking / Privacy > VPN")
- **TECHNICAL TERMS:** Ensure technical terms in categories are properly capitalized (JavaScript, API, UI, etc.)
- **FUNCTIONAL CATEGORIZATION:** Match actual content to appropriate functional categories based on what the service DOES
- **FOLLOW LEARNING DATA:** Prioritize user-corrected patterns from learning data
- **FALLBACK STRATEGY:** If genuinely unsure, use "Tools > Utilities" but prefer specific functional categories
- Title must be descriptive and informative, based on URL domain and content context
- Choose the most appropriate functional category that describes what the service does
- Consider URL domain, title content, risk flags, and content type for accurate functional categorization
- Prefer practical, functional categories that group services by their purpose

**EXAMPLE OUTPUT (FMHY-Style Functional Categories - NO "OTHER" ALLOWED):**
[
  {"id": 1, "category": "Development > Documentation", "title": "React Documentation - JavaScript Library Guide", "confidence": 0.9, "categoryChanged": false},
  {"id": 2, "category": "Tools > File Tools > Cloud Storage", "title": "Google Drive - Cloud Storage Service", "confidence": 0.8, "categoryChanged": true},
  {"id": 3, "category": "Adblocking / Privacy > VPN", "title": "ProtonVPN - Privacy-Focused VPN Service", "confidence": 0.9, "categoryChanged": true},
  {"id": 4, "category": "Tools > Utilities", "title": "Generic Tool - General Utility", "confidence": 0.7, "categoryChanged": true}
]

**FUNCTIONAL CATEGORIZATION EXAMPLES (FMHY-Style):**
- Google Drive currently in "Google Services" → Should be "Tools > File Tools > Cloud Storage" (categoryChanged: true)
- ProtonVPN currently in "VPN Services" → Should be "Adblocking / Privacy > VPN" (categoryChanged: true)
- GitHub repo currently in "Uncategorized" → Should be "Development > Code Repositories" (categoryChanged: true)
- Signal app currently in "Communication" → Should be "Adblocking / Privacy > Encrypted Messengers" (categoryChanged: true)
- DuckDuckGo currently in "Search" → Should be "Web Privacy > Search Engines" (categoryChanged: true)

**FINAL INSTRUCTIONS:**
- **ABSOLUTELY NO "OTHER" CATEGORY ALLOWED** - completely forbidden
- **CREATE UNLIMITED CATEGORIES** - generate as many specific functional categories as needed
- **BE COMPREHENSIVE** - create detailed, specific categories for every type of service found
- **NO CATEGORY LIMITS** - don't restrict yourself to a small number of categories
- Every bookmark must be categorized into a specific functional category
- If you cannot determine the exact function, create a new appropriate category or use "Tools > Utilities"
- Prioritize comprehensive, detailed organization over simplicity

Return only the JSON array, no additional text or formatting`;

    return prompt;
  }

  /**
   * Parse API response
   * @param {string} responseText - Raw API response
   * @param {Array} batch - Original batch of bookmarks
   * @returns {Array} Parsed results
   */
  _parseResponse(responseText, batch) {
    try {
      // Clean the response text
      let cleanText = responseText.trim();

      // Remove markdown code blocks if present
      cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

      // Try to find JSON array in the response
      const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        cleanText = jsonMatch[0];
      }

      // Try to repair truncated JSON before parsing
      cleanText = this._repairTruncatedJson(cleanText);

      const parsed = JSON.parse(cleanText);

      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array');
      }

      // Map results to bookmark IDs and include titles with validation
      const results = parsed.map((result, index) => {
        let category = result.category || 'Tools > Utilities';

        // CRITICAL: Validate that "Other" is never used
        if (category === 'Other' || category.includes('Other')) {
          console.warn(
            `⚠️ AI tried to use forbidden "Other" category for bookmark ${
              index + 1
            }. Forcing to "Tools > Utilities"`
          );
          category = 'Tools > Utilities';
        }

        // Ensure category is not empty
        if (!category || category.trim() === '') {
          console.warn(
            `⚠️ Empty category detected for bookmark ${index + 1}. Using "Tools > Utilities"`
          );
          category = 'Tools > Utilities';
        }

        return {
          id: result.id || index + 1,
          bookmarkId: batch[index]?.id,
          category: category,
          title: result.title || batch[index]?.title || 'Untitled',
          confidence: result.confidence || 0.5
        };
      });

      // Final validation: Check if any "Other" categories slipped through
      const otherCategories = results.filter(
        (r) => r.category === 'Other' || r.category.includes('Other')
      );
      if (otherCategories.length > 0) {
        console.error(
          '🚨 CRITICAL: "Other" categories detected after validation!',
          otherCategories
        );
        throw new Error('AI returned forbidden "Other" categories despite explicit instructions');
      }

      return results;
    } catch (_error) {
      console.error('_error parsing API response:', _error);
      console.log('Raw response:', responseText);

      // Check if this might be a truncation error
      if (
        _error.message.includes('Unexpected end of JSON') ||
        _error.message.includes('Unexpected token') ||
        _error.message.includes('JSON')
      ) {
        const truncationError = new Error(`JSON truncation detected: ${_error.message}`);
        truncationError.isTruncation = true;
        throw truncationError;
      }

      throw new Error(`Failed to parse AI response: ${_error.message}`);
    }
  }

  /**
   * Calculate dynamic max_tokens based on batch size
   * @param {number} batchSize - Number of bookmarks in batch
   * @returns {number} Calculated max_tokens value
   */
  _calculateMaxTokens(batchSize) {
    const baseTokensPerBookmark = 150;
    const overhead = 500;
    const buffer = 1.2;

    const calculated = Math.ceil((batchSize * baseTokensPerBookmark + overhead) * buffer);
    const min = 2000;
    const max = 8000;

    const result = Math.max(min, Math.min(max, calculated));
    console.log(`   📊 Dynamic max_tokens: ${result} (batch size: ${batchSize})`);
    return result;
  }

  /**
   * Retry processing with smaller batches when truncation is detected
   * @param {Array} batch - Original batch that failed
   * @param {Array} categories - Available categories
   * @param {Object} learningData - Learning data
   * @param {Object} model - Model that encountered truncation
   * @returns {Promise<Array>} Combined results from split batches
   */
  async _retryWithSmallerBatches(batch, categories, learningData, model) {
    const splitSize = Math.ceil(batch.length / 2);
    console.log(
      `🔀 Splitting batch of ${batch.length} into ${Math.ceil(
        batch.length / splitSize
      )} smaller batches of ~${splitSize} bookmarks each`
    );

    const results = [];
    for (let i = 0; i < batch.length; i += splitSize) {
      const subBatch = batch.slice(i, i + splitSize);
      console.log(
        `   📦 Processing sub-batch ${
          Math.floor(i / splitSize) + 1
        }/${Math.ceil(batch.length / splitSize)} (${subBatch.length} bookmarks)`
      );

      try {
        let subResult;
        if (model.provider === 'gemini') {
          subResult = await this._processWithGemini(subBatch, categories, learningData, model.name);
        } else if (model.provider === 'cerebras') {
          const prompt = await this._buildPrompt(subBatch, categories, learningData);
          subResult = await this._processWithCerebras(prompt, subBatch, model.name);
        } else if (model.provider === 'groq') {
          const prompt = await this._buildPrompt(subBatch, categories, learningData);
          subResult = await this._processWithGroq(prompt, subBatch, model.name);
        }

        if (subResult) {
          results.push(...subResult);
        }
      } catch (subError) {
        // If sub-batch also fails with truncation and can be split further
        if (subError.isTruncation && subBatch.length > 1) {
          console.warn('   ⚠️ Sub-batch truncation detected, splitting further...');
          const deeperResults = await this._retryWithSmallerBatches(
            subBatch,
            categories,
            learningData,
            model
          );
          results.push(...deeperResults);
        } else {
          // Re-throw if it's not a truncation error or can't split further
          throw subError;
        }
      }

      // Small delay between sub-batches
      if (i + splitSize < batch.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log(`✅ Successfully processed split batch: ${results.length} results`);
    return results;
  }

  /**
   * Repair truncated JSON by adding missing closing brackets/braces
   * @param {string} jsonStr - Potentially truncated JSON string
   * @returns {string} Repaired JSON string
   */
  _repairTruncatedJson(jsonStr) {
    if (!jsonStr || jsonStr.trim() === '') {
      return jsonStr;
    }

    let repaired = jsonStr.trim();
    let modified = false;

    // Count opening and closing brackets/braces
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;
    const openBraces = (repaired.match(/\{/g) || []).length;
    const closeBraces = (repaired.match(/\}/g) || []).length;

    // If truncation detected, try to repair
    if (openBrackets > closeBrackets || openBraces > closeBraces) {
      console.warn('⚠️ JSON truncation detected - attempting repair...');
      console.warn(`   Open brackets: ${openBrackets}, Close: ${closeBrackets}`);
      console.warn(`   Open braces: ${openBraces}, Close: ${closeBraces}`);

      // Remove trailing incomplete entries
      // Look for the last complete object in array
      const lastCompleteObjectMatch = repaired.match(/\},\s*\{[^}]*$/);
      if (lastCompleteObjectMatch) {
        repaired = repaired.substring(0, lastCompleteObjectMatch.index + 1);
        modified = true;
        console.warn('   ✂️ Removed incomplete trailing object');
      }

      // Remove any trailing incomplete strings or values
      repaired = repaired.replace(/,\s*"[^"]*$/, '');
      repaired = repaired.replace(/,\s*[^,\]\}]*$/, '');

      // Add missing closing braces first (for objects)
      const remainingOpenBraces = (repaired.match(/\{/g) || []).length;
      const remainingCloseBraces = (repaired.match(/\}/g) || []).length;
      const missingBraces = remainingOpenBraces - remainingCloseBraces;

      if (missingBraces > 0) {
        repaired += '}'.repeat(missingBraces);
        modified = true;
        console.warn(`   🔧 Added ${missingBraces} missing closing brace(s)`);
      }

      // Add missing closing brackets (for arrays)
      const remainingOpenBrackets = (repaired.match(/\[/g) || []).length;
      const remainingCloseBrackets = (repaired.match(/\]/g) || []).length;
      const missingBrackets = remainingOpenBrackets - remainingCloseBrackets;

      if (missingBrackets > 0) {
        repaired += ']'.repeat(missingBrackets);
        modified = true;
        console.warn(`   🔧 Added ${missingBrackets} missing closing bracket(s)`);
      }

      if (modified) {
        console.warn('   ✅ JSON repair completed');
      }
    }

    return repaired;
  }

  /**
   * Test API key validity
   * @returns {Promise<boolean>} True if API key is valid
   */
  async testApiKey() {
    if (!this.apiKey) {
      return false;
    }

    // Basic format validation
    if (!this.apiKey.startsWith('AIza') || this.apiKey.length < 35) {
      console.error('API key format invalid. Should start with "AIza" and be ~39 characters long.');
      return false;
    }

    try {
      // Simple test request
      const testResponse = await this.requestQueue.enqueue(
        async () => {
          return await fetch(this.getCurrentModelUrl(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': this.apiKey
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: 'Hello, this is a test message.'
                    }
                  ]
                }
              ]
            })
          });
        },
        'gemini',
        'high'
      );

      if (testResponse.ok) {
        console.log('API key test successful');
        return true;
      }
      const errorText = await testResponse.text();
      console.error('API key test failed:', testResponse.status, errorText);
      return false;
    } catch (_error) {
      console.error('API key test failed:', _error);
      return false;
    }
  }

  /**
   * Get user settings
   * @returns {Promise<Object>} User settings
   */
  async _getSettings() {
    const defaultSettings = {
      functionalMode: true, // FMHY-style functional organization
      maxCategoryDepth: 3, // Allow 2-3 levels for functional organization
      batchSize: 50, // Default batch size
      // NO LIMITS on category count - generate as many as needed for proper organization
      unlimitedCategories: true
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
   * Delay helper function
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Promise that resolves after delay
   */
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Enrich a batch of bookmarks with live titles fetched from their URLs
   * Optimized with configurable concurrency and performance metrics
   * @param {Array} batch - Batch of bookmarks to enrich
   */
  async _enrichBatchWithTitles(batch) {
    // Configurable concurrency based on settings or use default
    const settings = await this._getSettings();
    const CONCURRENCY_LIMIT = settings.titleFetchConcurrency || 5;
    const ENABLE_METRICS = settings.showDetailedLogs || false;

    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;
    let timeoutCount = 0;
    let updatedCount = 0;

    console.log(
      `🔄 Fetching live titles for ${batch.length} bookmarks (concurrency: ${CONCURRENCY_LIMIT})...`
    );

    // Process in chunks to limit concurrency
    for (let i = 0; i < batch.length; i += CONCURRENCY_LIMIT) {
      const chunk = batch.slice(i, i + CONCURRENCY_LIMIT);
      const chunkStartTime = Date.now();

      const promises = chunk.map(async (bookmark) => {
        if (!bookmark.url) return { success: false, reason: 'no_url' };

        try {
          const liveTitle = await this._fetchPageTitle(bookmark.url);
          if (liveTitle && liveTitle.length > 0 && liveTitle !== bookmark.title) {
            if (ENABLE_METRICS) {
              console.log(`   📝 Updated title: "${bookmark.title}" → "${liveTitle}"`);
            }
            bookmark.title = liveTitle;
            updatedCount++;
            return { success: true, updated: true };
          }
          successCount++;
          return { success: true, updated: false };
        } catch (_error) {
          if (_error.name === 'AbortError') {
            timeoutCount++;
            return { success: false, reason: 'timeout' };
          }
          errorCount++;
          return {
            success: false,
            reason: 'error',
            error: _error.message
          };
        }
      });

      await Promise.all(promises);

      if (ENABLE_METRICS) {
        const chunkDuration = Date.now() - chunkStartTime;
        console.log(
          `   ⏱️ Chunk ${
            Math.floor(i / CONCURRENCY_LIMIT) + 1
          }: ${chunkDuration}ms for ${chunk.length} bookmarks`
        );
      }
    }

    const totalDuration = Date.now() - startTime;
    console.log(
      `✅ Title fetch complete: ${updatedCount} updated, ${successCount} unchanged, ${errorCount} errors, ${timeoutCount} timeouts (${totalDuration}ms total)`
    );

    // Store metrics if analytics service is available
    if (this.analyticsService && ENABLE_METRICS) {
      this.analyticsService.recordTitleFetchMetrics({
        total: batch.length,
        updated: updatedCount,
        errors: errorCount,
        timeouts: timeoutCount,
        duration: totalDuration,
        avgPerBookmark: totalDuration / batch.length
      });
    }
  }

  /**
   * Fetch the page title from a URL
   * @param {string} url - URL to fetch
   * @returns {Promise<string>} Page title or null
   */
  async _fetchPageTitle(url) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // console.warn(`Failed to fetch title for ${url}: ${response.status} ${response.statusText}`);
        return null;
      }

      const text = await response.text();

      // Extract title using regex to avoid DOMParser overhead/issues in worker
      const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch?.[1]) {
        // Decode HTML entities
        let title = titleMatch[1].trim();
        title = title
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        return title;
      }
      return null;
    } catch (_error) {
      // Distinguish between timeout and other errors for better debugging if needed
      if (_error.name === 'AbortError') {
        // console.warn(`Timeout fetching title for ${url}`);
      } else {
        // console.warn(`Error fetching title for ${url}:`, _error.message);
      }
      return null;
    }
  }
  /**
   * Check if a model is currently penalized
   * @param {string} modelName - Name of the model
   * @returns {boolean} True if penalized
   */
  _isModelPenalized(modelName) {
    if (!this.modelPenalties.has(modelName)) return false;

    const expiry = this.modelPenalties.get(modelName);
    if (Date.now() > expiry) {
      this.modelPenalties.delete(modelName);
      return false;
    }

    return true;
  }

  /**
   * Penalize a model for rate limiting
   * @param {string} modelName - Name of the model
   */
  _penalizeModel(modelName) {
    const expiry = Date.now() + this.RATE_LIMIT_PENALTY_MS;
    this.modelPenalties.set(modelName, expiry);
    console.warn(
      `⚠️ Penalizing model ${modelName} for ${this.RATE_LIMIT_PENALTY_MS / 1000}s due to rate limit`
    );
  }

  /**
   * Check if Gemini API quota is currently exhausted
   * @returns {Promise<boolean>} True if quota exhausted
   */
  async _isQuotaExhausted() {
    // Check in-memory state first
    if (this.quotaExhaustedUntil && Date.now() < this.quotaExhaustedUntil) {
      return true;
    }

    // Check persisted state
    try {
      const result = await chrome.storage.local.get(this.QUOTA_STORAGE_KEY);
      const quotaState = result[this.QUOTA_STORAGE_KEY];

      if (quotaState?.exhaustedUntil) {
        if (Date.now() < quotaState.exhaustedUntil) {
          this.quotaExhaustedUntil = quotaState.exhaustedUntil;
          return true;
        }
        // Quota has reset, clear the state
        await this._clearQuotaExhaustedState();
      }
    } catch (error) {
      console.warn('Error checking quota state:', error);
    }

    return false;
  }

  /**
   * Mark quota as exhausted with retry delay
   * @param {number} retryDelaySeconds - Seconds until quota resets (from API response)
   */
  async _markQuotaExhausted(retryDelaySeconds) {
    const exhaustedUntil = Date.now() + retryDelaySeconds * 1000;
    this.quotaExhaustedUntil = exhaustedUntil;

    // Persist to storage
    try {
      await chrome.storage.local.set({
        [this.QUOTA_STORAGE_KEY]: {
          exhaustedUntil,
          markedAt: Date.now(),
          retryDelaySeconds
        }
      });
      console.warn(
        `🚫 Gemini API quota exhausted. Reset in ${retryDelaySeconds}s (${new Date(exhaustedUntil).toLocaleString()})`
      );
    } catch (error) {
      console.error('Error persisting quota state:', error);
    }
  }

  /**
   * Clear quota exhausted state (for manual retry or after reset)
   */
  async _clearQuotaExhaustedState() {
    this.quotaExhaustedUntil = null;
    try {
      await chrome.storage.local.remove(this.QUOTA_STORAGE_KEY);
      console.log('✅ Quota exhausted state cleared');
    } catch (error) {
      console.error('Error clearing quota state:', error);
    }
  }

  /**
   * Check if an error response indicates quota exhaustion (vs temporary rate limit)
   * @param {Object} errorResponse - Parsed error response from API
   * @returns {Object} { isQuotaExhausted: boolean, retryDelaySeconds: number|null }
   */
  _checkQuotaExhaustion(errorResponse) {
    try {
      const errorMessage = errorResponse.error?.message || '';

      // Check for quota exhaustion indicators
      const isQuotaExhausted =
        errorMessage.includes('quota exceeded') ||
        errorMessage.includes('Quota exceeded') ||
        errorMessage.includes('free_tier') ||
        errorResponse.error?.details?.some(
          (d) =>
            d['@type']?.includes('QuotaFailure') ||
            d.violations?.some((v) => v.quotaMetric?.includes('free_tier'))
        );

      // Extract retry delay from RetryInfo
      let retryDelaySeconds = null;
      if (errorResponse.error?.details) {
        const retryInfo = errorResponse.error.details.find((d) =>
          d['@type']?.includes('RetryInfo')
        );
        if (retryInfo?.retryDelay) {
          // Parse formats like "57s" or "57.356284637s"
          const match = retryInfo.retryDelay.match(/^([\d.]+)s?$/);
          if (match) {
            retryDelaySeconds = Math.ceil(Number.parseFloat(match[1]));
          }
        }
      }

      // Default to 24 hours if quota exhausted but no retry delay specified
      if (isQuotaExhausted && !retryDelaySeconds) {
        // Gemini free tier typically resets at midnight Pacific time
        const now = new Date();
        const pacificMidnight = new Date(
          now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
        );
        pacificMidnight.setHours(24, 0, 0, 0);
        retryDelaySeconds = Math.ceil((pacificMidnight - now) / 1000);
      }

      return { isQuotaExhausted, retryDelaySeconds };
    } catch (error) {
      console.warn('Error parsing quota exhaustion:', error);
      return { isQuotaExhausted: false, retryDelaySeconds: null };
    }
  }

  /**
   * Generate user-friendly quota exhaustion error message
   * @returns {Promise<string>} Error message with details
   */
  async _getQuotaExhaustedMessage() {
    const result = await chrome.storage.local.get(this.QUOTA_STORAGE_KEY);
    const quotaState = result[this.QUOTA_STORAGE_KEY];

    if (!quotaState) {
      return 'Gemini API quota exhausted. Please try again later or upgrade your API plan.';
    }

    const resetDate = new Date(quotaState.exhaustedUntil);
    const hoursUntilReset = Math.ceil((quotaState.exhaustedUntil - Date.now()) / (1000 * 60 * 60));

    let message = '🚫 **Gemini API Free Tier Quota Exhausted**\n\n';
    message += `Your daily quota will reset at: **${resetDate.toLocaleString()}**\n`;
    message += `(approximately ${hoursUntilReset} hour${hoursUntilReset !== 1 ? 's' : ''})\n\n`;
    message += '**Options:**\n';
    message += '1. Wait for quota reset (typically midnight Pacific time)\n';
    message += '2. Upgrade to a paid Gemini API plan at https://ai.google.dev/pricing\n';
    message += '3. Add alternative API keys (Cerebras or Groq) in Settings\n\n';
    message += 'Monitor your usage at: https://ai.dev/usage?tab=rate-limit';

    return message;
  }
}

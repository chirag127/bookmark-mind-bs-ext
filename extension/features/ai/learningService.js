/**
 * BookmarkMind - Learning Service
 * Handles user feedback and learning data for improved categorization
 */

export class LearningService {
  constructor() {
    this.STORAGE_KEY = 'learningData';
    this.LEARNING_VERSION = '1.0';
  }

  /**
   * Get all learning data
   * @returns {Promise<Object>} Learning data
   */
  async getLearningData() {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      const learningData = result[this.STORAGE_KEY] || {
        version: this.LEARNING_VERSION,
        patterns: {},
        corrections: [],
        lastUpdated: null
      };

      console.log(`Loaded ${Object.keys(learningData.patterns || {}).length} learning patterns`);
      return learningData;
    } catch (_error) {
      console.error('_error loading learning data:', _error);
      return {
        version: this.LEARNING_VERSION,
        patterns: {},
        corrections: [],
        lastUpdated: null
      };
    }
  }

  /**
   * Record a user correction (manual recategorization)
   * @param {Object} bookmark - Bookmark object
   * @param {string} originalCategory - AI-assigned category (if any)
   * @param {string} correctedCategory - User-selected category
   * @param {boolean} isManual - Whether this was a manual correction (true) or automatic (false)
   * @returns {Promise<void>}
   */
  async recordCorrection(bookmark, originalCategory, correctedCategory, isManual = true) {
    // CRITICAL: Only learn from manual corrections, never from automatic categorization
    if (!isManual) {
      console.log('Skipping learning from automatic categorization');
      return;
    }

    if (!bookmark || !correctedCategory) {
      console.warn('Invalid correction data:', {
        bookmark,
        correctedCategory
      });
      return;
    }

    try {
      const learningData = await this.getLearningData();

      // Create a correction record
      const correction = {
        bookmarkId: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        originalCategory: originalCategory || 'Uncategorized',
        correctedCategory: correctedCategory,
        timestamp: new Date().toISOString(),
        domain: this._extractDomain(bookmark.url),
        keywords: this._extractKeywords(bookmark.title)
      };

      // Add to corrections history
      learningData.corrections = learningData.corrections || [];
      learningData.corrections.push(correction);

      // Limit corrections history to last 1000 entries
      if (learningData.corrections.length > 1000) {
        learningData.corrections = learningData.corrections.slice(-1000);
      }

      // Update learning patterns
      this._updatePatterns(learningData, correction);

      // Update timestamp
      learningData.lastUpdated = new Date().toISOString();

      // Save to storage
      await chrome.storage.local.set({
        [this.STORAGE_KEY]: learningData
      });

      console.log(`✅ Learned from correction: "${bookmark.title}" → "${correctedCategory}"`);
      console.log(`Total patterns: ${Object.keys(learningData.patterns).length}`);
    } catch (_error) {
      console.error('_error recording correction:', _error);
    }
  }

  /**
   * Update learning patterns based on correction
   * @param {Object} learningData - Learning data object
   * @param {Object} correction - Correction record
   */
  _updatePatterns(learningData, correction) {
    learningData.patterns = learningData.patterns || {};

    // Pattern 1: Domain-based learning
    if (correction.domain) {
      const domainKey = `domain:${correction.domain}`;
      if (!learningData.patterns[domainKey]) {
        learningData.patterns[domainKey] = {
          type: 'domain',
          value: correction.domain,
          category: correction.correctedCategory,
          confidence: 1,
          count: 1
        };
      } else {
        const pattern = learningData.patterns[domainKey];
        if (pattern.category === correction.correctedCategory) {
          pattern.count++;
          pattern.confidence = Math.min(0.99, pattern.confidence + 0.05);
        } else {
          // User changed their mind about this domain's category
          pattern.category = correction.correctedCategory;
          pattern.confidence = 0.6;
          pattern.count = 1;
        }
      }
    }

    // Pattern 2: Keyword-based learning
    correction.keywords.forEach((keyword) => {
      const keywordKey = `keyword:${keyword.toLowerCase()}`;
      if (!learningData.patterns[keywordKey]) {
        learningData.patterns[keywordKey] = {
          type: 'keyword',
          value: keyword.toLowerCase(),
          category: correction.correctedCategory,
          confidence: 0.5,
          count: 1
        };
      } else {
        const pattern = learningData.patterns[keywordKey];
        if (pattern.category === correction.correctedCategory) {
          pattern.count++;
          pattern.confidence = Math.min(0.95, pattern.confidence + 0.03);
        }
      }
    });

    // Pattern 3: URL pattern learning (path-based)
    const urlPattern = this._extractUrlPattern(correction.url);
    if (urlPattern) {
      const urlKey = `url:${urlPattern}`;
      if (!learningData.patterns[urlKey]) {
        learningData.patterns[urlKey] = {
          type: 'url_pattern',
          value: urlPattern,
          category: correction.correctedCategory,
          confidence: 0.7,
          count: 1
        };
      } else {
        const pattern = learningData.patterns[urlKey];
        if (pattern.category === correction.correctedCategory) {
          pattern.count++;
          pattern.confidence = Math.min(0.98, pattern.confidence + 0.04);
        }
      }
    }
  }

  /**
   * Get category suggestions based on learning data
   * @param {Object} bookmark - Bookmark to categorize
   * @param {Object} learningData - Learning data (optional, will load if not provided)
   * @returns {Promise<Array>} Array of category suggestions with confidence scores
   */
  async getSuggestions(bookmark, initialLearningData = null) {
    let learningData = initialLearningData;
    if (!learningData) {
      learningData = await this.getLearningData();
    }

    if (!learningData.patterns || Object.keys(learningData.patterns).length === 0) {
      return [];
    }

    const suggestions = [];
    const domain = this._extractDomain(bookmark.url);
    const keywords = this._extractKeywords(bookmark.title);
    const urlPattern = this._extractUrlPattern(bookmark.url);

    // Check domain pattern
    const domainKey = `domain:${domain}`;
    if (learningData.patterns[domainKey]) {
      const pattern = learningData.patterns[domainKey];
      suggestions.push({
        category: pattern.category,
        confidence: pattern.confidence,
        reason: `Domain match: ${domain}`,
        weight: pattern.confidence * 1.5 // Domain matches are strong signals
      });
    }

    // Check URL pattern
    if (urlPattern) {
      const urlKey = `url:${urlPattern}`;
      if (learningData.patterns[urlKey]) {
        const pattern = learningData.patterns[urlKey];
        suggestions.push({
          category: pattern.category,
          confidence: pattern.confidence,
          reason: `URL pattern match: ${urlPattern}`,
          weight: pattern.confidence * 1.2
        });
      }
    }

    // Check keyword patterns
    keywords.forEach((keyword) => {
      const keywordKey = `keyword:${keyword.toLowerCase()}`;
      if (learningData.patterns[keywordKey]) {
        const pattern = learningData.patterns[keywordKey];
        suggestions.push({
          category: pattern.category,
          confidence: pattern.confidence,
          reason: `Keyword match: ${keyword}`,
          weight: pattern.confidence * 0.8 // Keywords are weaker signals
        });
      }
    });

    // Aggregate suggestions by category
    const categoryScores = {};
    suggestions.forEach((suggestion) => {
      if (!categoryScores[suggestion.category]) {
        categoryScores[suggestion.category] = {
          category: suggestion.category,
          totalWeight: 0,
          maxConfidence: 0,
          reasons: []
        };
      }
      categoryScores[suggestion.category].totalWeight += suggestion.weight;
      categoryScores[suggestion.category].maxConfidence = Math.max(
        categoryScores[suggestion.category].maxConfidence,
        suggestion.confidence
      );
      categoryScores[suggestion.category].reasons.push(suggestion.reason);
    });

    // Convert to array and sort by weight
    const aggregatedSuggestions = Object.values(categoryScores)
      .map((cat) => ({
        category: cat.category,
        confidence: Math.min(0.99, cat.totalWeight / 2), // Normalize confidence
        reasons: cat.reasons
      }))
      .sort((a, b) => b.confidence - a.confidence);

    return aggregatedSuggestions;
  }

  /**
   * Get corrections history
   * @param {number} limit - Maximum number of corrections to return
   * @returns {Promise<Array>} Array of correction records
   */
  async getCorrectionsHistory(limit = 100) {
    const learningData = await this.getLearningData();
    const corrections = learningData.corrections || [];
    return corrections.slice(-limit).reverse();
  }

  /**
   * Export learning data
   * @returns {Promise<Object>} Learning data for export
   */
  async exportLearningData() {
    const learningData = await this.getLearningData();
    return {
      ...learningData,
      exportDate: new Date().toISOString(),
      extensionVersion: chrome.runtime.getManifest().version
    };
  }

  /**
   * Import learning data
   * @param {Object} importedData - Learning data to import
   * @param {boolean} merge - Whether to merge with existing data (true) or replace (false)
   * @returns {Promise<Object>} Import result
   */
  async importLearningData(importedData, merge = true) {
    try {
      // Validate imported data
      if (!importedData || typeof importedData !== 'object') {
        throw new Error('Invalid import data format');
      }

      if (!importedData.patterns || !importedData.corrections) {
        throw new Error('Import data missing required fields (patterns, corrections)');
      }

      let finalData;

      if (merge) {
        // Merge with existing data
        const existingData = await this.getLearningData();
        finalData = {
          version: this.LEARNING_VERSION,
          patterns: {
            ...existingData.patterns,
            ...importedData.patterns
          },
          corrections: [...(existingData.corrections || []), ...(importedData.corrections || [])],
          lastUpdated: new Date().toISOString()
        };

        // Limit corrections history
        if (finalData.corrections.length > 1000) {
          finalData.corrections = finalData.corrections.slice(-1000);
        }
      } else {
        // Replace existing data
        finalData = {
          version: this.LEARNING_VERSION,
          patterns: importedData.patterns,
          corrections: importedData.corrections || [],
          lastUpdated: new Date().toISOString()
        };
      }

      // Save to storage
      await chrome.storage.local.set({ [this.STORAGE_KEY]: finalData });

      console.log(
        `✅ Imported learning data: ${
          Object.keys(finalData.patterns).length
        } patterns, ${finalData.corrections.length} corrections`
      );

      return {
        success: true,
        patternsCount: Object.keys(finalData.patterns).length,
        correctionsCount: finalData.corrections.length,
        merged: merge
      };
    } catch (_error) {
      console.error('_error importing learning data:', _error);
      throw _error;
    }
  }

  /**
   * Clear all learning data
   * @returns {Promise<void>}
   */
  async clearLearningData() {
    try {
      await chrome.storage.local.remove(this.STORAGE_KEY);
      console.log('✅ Learning data cleared');
    } catch (_error) {
      console.error('_error clearing learning data:', _error);
      throw _error;
    }
  }

  /**
   * Get learning statistics
   * @returns {Promise<Object>} Statistics object
   */
  async getStatistics() {
    const learningData = await this.getLearningData();
    const patterns = learningData.patterns || {};
    const corrections = learningData.corrections || [];

    // Group patterns by type
    const patternsByType = {
      domain: 0,
      keyword: 0,
      url_pattern: 0
    };

    Object.values(patterns).forEach((pattern) => {
      if (Object.hasOwn(patternsByType, pattern.type)) {
        patternsByType[pattern.type]++;
      }
    });

    // Get category distribution
    const categoryDistribution = {};
    corrections.forEach((correction) => {
      const category = correction.correctedCategory;
      categoryDistribution[category] = (categoryDistribution[category] || 0) + 1;
    });

    return {
      totalPatterns: Object.keys(patterns).length,
      totalCorrections: corrections.length,
      patternsByType,
      categoryDistribution,
      lastUpdated: learningData.lastUpdated,
      mostCorrectedCategory: this._getMostFrequent(categoryDistribution)
    };
  }

  /**
   * Extract domain from URL
   * @param {string} url - URL string
   * @returns {string} Domain
   */
  _extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch (_error) {
      return '';
    }
  }

  /**
   * Extract keywords from title
   * @param {string} title - Bookmark title
   * @returns {Array<string>} Array of keywords
   */
  _extractKeywords(title) {
    if (!title) return [];

    // Remove common words and extract meaningful keywords
    const commonWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'as',
      'is',
      'was',
      'are',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'can',
      'this',
      'that',
      'these',
      'those',
      'i',
      'you',
      'he',
      'she',
      'it',
      'we',
      'they'
    ]);

    const words = title
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !commonWords.has(word));

    // Return unique keywords, limited to top 5
    return [...new Set(words)].slice(0, 5);
  }

  /**
   * Extract URL pattern (path structure)
   * @param {string} url - URL string
   * @returns {string} URL pattern
   */
  _extractUrlPattern(url) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter((p) => p);

      // Take first 2 path segments (e.g., /blog/posts -> blog/posts)
      if (pathParts.length > 0) {
        return pathParts.slice(0, 2).join('/');
      }

      return '';
    } catch (_error) {
      return '';
    }
  }

  /**
   * Get most frequent value from object
   * @param {Object} obj - Object with counts
   * @returns {string} Most frequent key
   */
  _getMostFrequent(obj) {
    if (!obj || Object.keys(obj).length === 0) return null;

    return Object.entries(obj).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  }
}

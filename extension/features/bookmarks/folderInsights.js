/**
 * BookmarkMind - Folder Insights Service
 * Provides folder statistics, health scores, and smart organization suggestions
 */

export class FolderInsights {
  constructor() {
    this.IDEAL_BOOKMARKS_MIN = 5;
    this.IDEAL_BOOKMARKS_MAX = 30;
    this.MAX_DEPTH = 4;
    this.MIN_HEALTH_SCORE = 50;
    this.favoriteKeyPrefix = 'favorite_folder_';
  }

  /**
   * Get comprehensive folder statistics
   * @param {string} folderId - Folder ID
   * @returns {Promise<Object>} Folder statistics
   */
  async getFolderStats(folderId) {
    const [folderNode] = await chrome.bookmarks.getSubTree(folderId);
    const stats = {
      id: folderId,
      title: folderNode.title,
      bookmarkCount: 0,
      directBookmarkCount: 0,
      subfolderCount: 0,
      depth: await this._calculateDepth(folderId),
      lastModified: folderNode.dateGroupModified || folderNode.dateAdded || 0,
      aiConfidenceScores: [],
      averageConfidence: 0,
      bookmarks: [],
      subfolders: []
    };

    this._collectFolderData(folderNode, stats);

    const aiMetadata = await this._getAIMetadata(stats.bookmarks);
    stats.aiConfidenceScores = aiMetadata.scores;
    stats.averageConfidence = aiMetadata.average;

    return stats;
  }

  /**
   * Calculate folder health score
   * @param {Object} folderStats - Folder statistics
   * @returns {Object} Health score and breakdown
   */
  calculateHealthScore(folderStats) {
    const scores = {
      bookmarkDistribution: this._scoreBookmarkDistribution(folderStats.directBookmarkCount),
      depthAppropriate: this._scoreDepth(folderStats.depth),
      organizationQuality: this._scoreOrganization(folderStats),
      aiConfidence: folderStats.averageConfidence * 100
    };

    const weights = {
      bookmarkDistribution: 0.3,
      depthAppropriate: 0.2,
      organizationQuality: 0.3,
      aiConfidence: 0.2
    };

    const totalScore = Object.keys(scores).reduce((sum, key) => {
      return sum + scores[key] * weights[key];
    }, 0);

    return {
      totalScore: Math.round(totalScore),
      breakdown: scores,
      status: this._getHealthStatus(totalScore),
      recommendations: this._generateRecommendations(folderStats, scores)
    };
  }

  /**
   * Get smart folder suggestions
   * @param {Object} folderStats - Folder statistics
   * @returns {Array} Suggested actions
   */
  async getSmartSuggestions(folderStats) {
    const suggestions = [];

    if (folderStats.directBookmarkCount > this.IDEAL_BOOKMARKS_MAX) {
      const splitSuggestion = await this._suggestSplit(folderStats);
      if (splitSuggestion) {
        suggestions.push(splitSuggestion);
      }
    }

    if (
      folderStats.directBookmarkCount < this.IDEAL_BOOKMARKS_MIN &&
      folderStats.subfolderCount > 0
    ) {
      suggestions.push({
        type: 'consolidate',
        priority: 'medium',
        title: 'Consider Consolidation',
        description: `This folder has only ${folderStats.directBookmarkCount} bookmarks with ${folderStats.subfolderCount} subfolders. Consider consolidating.`,
        action: 'consolidate',
        folderId: folderStats.id
      });
    }

    if (folderStats.depth > this.MAX_DEPTH) {
      suggestions.push({
        type: 'depth',
        priority: 'high',
        title: 'Folder Too Deep',
        description: `Folder depth is ${folderStats.depth} levels. Consider flattening the structure.`,
        action: 'flatten',
        folderId: folderStats.id
      });
    }

    if (folderStats.averageConfidence < 0.6 && folderStats.averageConfidence > 0) {
      suggestions.push({
        type: 'confidence',
        priority: 'medium',
        title: 'Low AI Confidence',
        description: 'Some bookmarks may be miscategorized. Review and recategorize if needed.',
        action: 'review',
        folderId: folderStats.id
      });
    }

    return suggestions;
  }

  /**
   * Compare multiple folders
   * @param {Array<string>} folderIds - Array of folder IDs
   * @returns {Promise<Object>} Comparison data
   */
  async compareFolders(folderIds) {
    const comparisons = [];

    for (const folderId of folderIds) {
      const stats = await this.getFolderStats(folderId);
      const health = this.calculateHealthScore(stats);
      comparisons.push({
        ...stats,
        health
      });
    }

    return {
      folders: comparisons,
      bestOrganized: this._findBestOrganized(comparisons),
      needsAttention: this._findNeedsAttention(comparisons)
    };
  }

  /**
   * Generate folder tree visualization data
   * @param {string} rootId - Root folder ID
   * @returns {Promise<Object>} Tree map data
   */
  async generateTreeMap(rootId = '1') {
    const [rootNode] = await chrome.bookmarks.getSubTree(rootId);
    const treeData = await this._buildTreeMapNode(rootNode);
    return treeData;
  }

  /**
   * Get or create favorite folders list
   * @returns {Promise<Array>} Favorite folder IDs
   */
  async getFavoriteFolders() {
    const result = await chrome.storage.local.get('favoriteFolders');
    return result.favoriteFolders || [];
  }

  /**
   * Add folder to favorites
   * @param {string} folderId - Folder ID
   * @returns {Promise<void>}
   */
  async addFavoriteFolder(folderId) {
    const favorites = await this.getFavoriteFolders();
    if (!favorites.includes(folderId)) {
      favorites.push(folderId);
      await chrome.storage.local.set({ favoriteFolders: favorites });
    }
  }

  /**
   * Remove folder from favorites
   * @param {string} folderId - Folder ID
   * @returns {Promise<void>}
   */
  async removeFavoriteFolder(folderId) {
    const favorites = await this.getFavoriteFolders();
    const filtered = favorites.filter((id) => id !== folderId);
    await chrome.storage.local.set({ favoriteFolders: filtered });
  }

  /**
   * Get folder access frequency
   * @returns {Promise<Object>} Folder access counts
   */
  async getFolderAccessStats() {
    const result = await chrome.storage.local.get('folderAccessCounts');
    return result.folderAccessCounts || {};
  }

  /**
   * Track folder access
   * @param {string} folderId - Folder ID
   * @returns {Promise<void>}
   */
  async trackFolderAccess(folderId) {
    const accessStats = await this.getFolderAccessStats();
    accessStats[folderId] = (accessStats[folderId] || 0) + 1;
    await chrome.storage.local.set({ folderAccessCounts: accessStats });
  }

  /**
   * Calculate folder depth
   * @param {string} folderId - Folder ID
   * @returns {Promise<number>} Depth level
   */
  async _calculateDepth(folderId) {
    let depth = 0;
    let currentId = folderId;

    while (currentId && currentId !== '0') {
      const [node] = await chrome.bookmarks.get(currentId);
      currentId = node.parentId;
      if (currentId !== '0') depth++;
    }

    return depth;
  }

  /**
   * Collect folder data recursively
   * @param {Object} node - Bookmark tree node
   * @param {Object} stats - Stats object to populate
   */
  _collectFolderData(node, stats) {
    if (!node.children) return;

    for (const child of node.children) {
      if (child.url) {
        stats.bookmarkCount++;
        stats.directBookmarkCount++;
        stats.bookmarks.push({
          id: child.id,
          title: child.title,
          url: child.url,
          dateAdded: child.dateAdded
        });
      } else {
        stats.subfolderCount++;
        stats.subfolders.push({
          id: child.id,
          title: child.title
        });
        const subfolderCount = this._countBookmarksRecursive(child);
        stats.bookmarkCount += subfolderCount;
      }
    }
  }

  /**
   * Count bookmarks recursively
   * @param {Object} node - Bookmark tree node
   * @returns {number} Bookmark count
   */
  _countBookmarksRecursive(node) {
    let count = 0;
    if (!node.children) return count;

    for (const child of node.children) {
      if (child.url) {
        count++;
      } else {
        count += this._countBookmarksRecursive(child);
      }
    }

    return count;
  }

  /**
   * Get AI metadata for bookmarks
   * @param {Array} bookmarks - Bookmark objects
   * @returns {Promise<Object>} AI confidence scores
   */
  async _getAIMetadata(bookmarks) {
    const scores = [];
    let totalConfidence = 0;

    for (const bookmark of bookmarks) {
      const metadataKey = `ai_confidence_${bookmark.id}`;
      const result = await chrome.storage.local.get(metadataKey);
      const confidence = result[metadataKey] || 0.5;
      scores.push({ bookmarkId: bookmark.id, confidence });
      totalConfidence += confidence;
    }

    return {
      scores,
      average: bookmarks.length > 0 ? totalConfidence / bookmarks.length : 0
    };
  }

  /**
   * Score bookmark distribution
   * @param {number} count - Bookmark count
   * @returns {number} Score (0-100)
   */
  _scoreBookmarkDistribution(count) {
    if (count >= this.IDEAL_BOOKMARKS_MIN && count <= this.IDEAL_BOOKMARKS_MAX) {
      return 100;
    }

    if (count < this.IDEAL_BOOKMARKS_MIN) {
      return Math.max(50, (count / this.IDEAL_BOOKMARKS_MIN) * 100);
    }

    const excess = count - this.IDEAL_BOOKMARKS_MAX;
    return Math.max(30, 100 - excess * 2);
  }

  /**
   * Score folder depth
   * @param {number} depth - Folder depth
   * @returns {number} Score (0-100)
   */
  _scoreDepth(depth) {
    if (depth <= this.MAX_DEPTH) {
      return 100;
    }

    const excess = depth - this.MAX_DEPTH;
    return Math.max(20, 100 - excess * 20);
  }

  /**
   * Score organization quality
   * @param {Object} folderStats - Folder statistics
   * @returns {number} Score (0-100)
   */
  _scoreOrganization(folderStats) {
    let score = 70;

    if (folderStats.subfolderCount > 0 && folderStats.directBookmarkCount > 0) {
      score += 15;
    }

    if (folderStats.subfolderCount > 10) {
      score -= 20;
    }

    const ratio =
      folderStats.subfolderCount > 0
        ? folderStats.directBookmarkCount / folderStats.subfolderCount
        : folderStats.directBookmarkCount;

    if (ratio >= 2 && ratio <= 10) {
      score += 15;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get health status label
   * @param {number} score - Total health score
   * @returns {string} Status label
   */
  _getHealthStatus(score) {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'poor';
  }

  /**
   * Generate recommendations based on scores
   * @param {Object} folderStats - Folder statistics
   * @param {Object} scores - Score breakdown
   * @returns {Array} Recommendations
   */
  _generateRecommendations(folderStats, scores) {
    const recommendations = [];

    if (scores.bookmarkDistribution < 70) {
      if (folderStats.directBookmarkCount > this.IDEAL_BOOKMARKS_MAX) {
        recommendations.push('Consider splitting this folder into subcategories');
      } else if (folderStats.directBookmarkCount < this.IDEAL_BOOKMARKS_MIN) {
        recommendations.push('Consider merging this folder with related folders');
      }
    }

    if (scores.depthAppropriate < 70) {
      recommendations.push('Folder hierarchy is too deep - consider flattening');
    }

    if (scores.organizationQuality < 70) {
      recommendations.push('Improve organization by balancing bookmarks and subfolders');
    }

    if (scores.aiConfidence < 60) {
      recommendations.push('Review bookmarks with low AI confidence scores');
    }

    return recommendations;
  }

  /**
   * Suggest folder split
   * @param {Object} folderStats - Folder statistics
   * @returns {Promise<Object|null>} Split suggestion
   */
  async _suggestSplit(folderStats) {
    if (folderStats.bookmarks.length < this.IDEAL_BOOKMARKS_MAX) {
      return null;
    }

    const groups = await this._groupSimilarBookmarks(folderStats.bookmarks);

    if (groups.length > 1) {
      return {
        type: 'split',
        priority: 'high',
        title: 'Suggest Folder Split',
        description: `This folder has ${folderStats.directBookmarkCount} bookmarks. Consider splitting into ${groups.length} groups.`,
        action: 'split',
        folderId: folderStats.id,
        suggestedGroups: groups.map((g) => ({
          name: g.name,
          count: g.bookmarks.length
        }))
      };
    }

    return null;
  }

  /**
   * Group similar bookmarks for split suggestions
   * @param {Array} bookmarks - Bookmark objects
   * @returns {Promise<Array>} Bookmark groups
   */
  async _groupSimilarBookmarks(bookmarks) {
    const groups = new Map();

    for (const bookmark of bookmarks) {
      const category = this._inferCategory(bookmark.title, bookmark.url);

      if (!groups.has(category)) {
        groups.set(category, {
          name: category,
          bookmarks: []
        });
      }

      groups.get(category).bookmarks.push(bookmark);
    }

    return Array.from(groups.values()).filter((g) => g.bookmarks.length >= 3);
  }

  /**
   * Extract domain from URL
   * @param {string} url - URL string
   * @returns {string} Domain
   */
  _extractDomain(url) {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  }

  /**
   * Infer category from title and URL
   * @param {string} title - Bookmark title
   * @param {string} url - Bookmark URL
   * @returns {string} Inferred category
   */
  _inferCategory(title, url) {
    const text = `${title} ${url}`.toLowerCase();

    const categories = {
      Development: [
        'github',
        'stackoverflow',
        'code',
        'dev',
        'programming',
        'api',
        'documentation'
      ],
      Social: ['facebook', 'twitter', 'linkedin', 'instagram', 'reddit', 'social'],
      Shopping: ['amazon', 'ebay', 'shop', 'store', 'buy', 'cart'],
      News: ['news', 'article', 'blog', 'medium', 'press'],
      Entertainment: ['youtube', 'netflix', 'video', 'music', 'game', 'stream'],
      Productivity: ['notion', 'trello', 'asana', 'docs', 'sheet', 'calendar']
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some((keyword) => text.includes(keyword))) {
        return category;
      }
    }

    return 'General';
  }

  /**
   * Find best organized folder
   * @param {Array} comparisons - Folder comparison data
   * @returns {Object|null} Best folder
   */
  _findBestOrganized(comparisons) {
    if (comparisons.length === 0) return null;

    return comparisons.reduce((best, current) => {
      return current.health.totalScore > best.health.totalScore ? current : best;
    });
  }

  /**
   * Find folders needing attention
   * @param {Array} comparisons - Folder comparison data
   * @returns {Array} Folders needing attention
   */
  _findNeedsAttention(comparisons) {
    return comparisons
      .filter((f) => f.health.totalScore < this.MIN_HEALTH_SCORE)
      .sort((a, b) => a.health.totalScore - b.health.totalScore);
  }

  /**
   * Build tree map node
   * @param {Object} node - Bookmark tree node
   * @returns {Promise<Object>} Tree map node
   */
  async _buildTreeMapNode(node) {
    if (node.url) return null;

    const stats = await this.getFolderStats(node.id);
    const health = this.calculateHealthScore(stats);

    const treeNode = {
      id: node.id,
      title: node.title,
      bookmarkCount: stats.bookmarkCount,
      directBookmarkCount: stats.directBookmarkCount,
      depth: stats.depth,
      health: health.totalScore,
      healthStatus: health.status,
      children: []
    };

    if (node.children) {
      for (const child of node.children) {
        if (!child.url) {
          const childNode = await this._buildTreeMapNode(child);
          if (childNode) {
            treeNode.children.push(childNode);
          }
        }
      }
    }

    return treeNode;
  }

  /**
   * Get all folder stats for overview
   * @param {string} rootId - Root folder ID
   * @returns {Promise<Array>} All folder statistics
   */
  async getAllFolderStats(rootId = '1') {
    const [rootNode] = await chrome.bookmarks.getSubTree(rootId);
    const allStats = [];
    await this._collectAllFolderStats(rootNode, allStats);
    return allStats;
  }

  /**
   * Collect all folder stats recursively
   * @param {Object} node - Bookmark tree node
   * @param {Array} statsArray - Array to collect stats
   */
  async _collectAllFolderStats(node, statsArray) {
    if (node.url) return;

    const stats = await this.getFolderStats(node.id);
    const health = this.calculateHealthScore(stats);
    statsArray.push({ ...stats, health });

    if (node.children) {
      for (const child of node.children) {
        if (!child.url) {
          await this._collectAllFolderStats(child, statsArray);
        }
      }
    }
  }
}

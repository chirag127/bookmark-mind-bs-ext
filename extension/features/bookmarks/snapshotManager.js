/**
 * BookmarkMind - Snapshot Manager
 * Handles versioned snapshots of bookmark state for undo/rollback functionality
 */

export class SnapshotManager {
  constructor() {
    this.maxSnapshots = 10;
    this.storageKey = 'bookmarkMindSnapshots';
    this.QUOTA_BYTES_LIMIT = 10485760; // 10MB chrome.storage.local limit
    this.SAFE_THRESHOLD = 0.8; // Use only 80% of quota for safety
  }

  /**
   * Validate snapshot data structure
   * @private
   */
  _validateSnapshotStructure(snapshot) {
    const errors = [];

    if (!snapshot || typeof snapshot !== 'object') {
      errors.push('Snapshot is not an object');
      return { valid: false, errors };
    }

    if (!snapshot.id || typeof snapshot.id !== 'string') {
      errors.push('Invalid or missing snapshot ID');
    }

    if (!snapshot.timestamp || typeof snapshot.timestamp !== 'number') {
      errors.push('Invalid or missing timestamp');
    }

    if (!snapshot.description || typeof snapshot.description !== 'string') {
      errors.push('Invalid or missing description');
    }

    if (!snapshot.bookmarkTree || typeof snapshot.bookmarkTree !== 'object') {
      errors.push('Invalid or missing bookmark tree');
    } else {
      if (!this._validateBookmarkNode(snapshot.bookmarkTree)) {
        errors.push('Invalid bookmark tree structure');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate bookmark node structure recursively
   * @private
   */
  _validateBookmarkNode(node) {
    if (!node || typeof node !== 'object') return false;

    if (!node.id || typeof node.id !== 'string') return false;

    if (node.url !== undefined && typeof node.url !== 'string') return false;

    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        if (!this._validateBookmarkNode(child)) return false;
      }
    }

    return true;
  }

  /**
   * Get detailed storage state for diagnostics
   * @private
   */
  async _getStorageState() {
    try {
      const allData = await chrome.storage.local.get(null);
      const allKeys = Object.keys(allData);

      let totalSize = 0;
      const keyDetails = {};

      for (const key of allKeys) {
        const serialized = JSON.stringify(allData[key]);
        const size = new Blob([serialized]).size;
        totalSize += size;
        keyDetails[key] = {
          size,
          sizeMB: (size / (1024 * 1024)).toFixed(4),
          type: Array.isArray(allData[key]) ? 'array' : typeof allData[key],
          itemCount: Array.isArray(allData[key]) ? allData[key].length : 'N/A'
        };
      }

      return {
        totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(4),
        usagePercent: ((totalSize / this.QUOTA_BYTES_LIMIT) * 100).toFixed(2),
        quotaRemaining: this.QUOTA_BYTES_LIMIT - totalSize,
        quotaRemainingMB: ((this.QUOTA_BYTES_LIMIT - totalSize) / (1024 * 1024)).toFixed(4),
        keys: allKeys,
        keyDetails
      };
    } catch (_error) {
      console.error('Failed to get storage state:', _error);
      return null;
    }
  }

  /**
   * Log detailed error with stack trace and storage state
   * @private
   */
  async _logDetailedError(context, _error, additionalData = {}) {
    const errorDetails = {
      context,
      timestamp: new Date().toISOString(),
      error: {
        message: _error.message,
        name: _error.name,
        stack: _error.stack
      },
      ...additionalData
    };

    const storageState = await this._getStorageState();
    if (storageState) {
      errorDetails.storageState = storageState;
    }

    console.error('🔴 SNAPSHOT _error DETAILS:', JSON.stringify(errorDetails, null, 2));

    return errorDetails;
  }

  /**
   * Detect and repair corrupted snapshots
   * @private
   */
  async _detectAndRepairCorruption() {
    try {
      console.log('🔍 Checking for corrupted snapshots...');

      const result = await chrome.storage.local.get([this.storageKey]);
      const snapshots = result[this.storageKey];

      if (!snapshots) {
        console.log('✅ No snapshots to check');
        return { repaired: false, removed: 0 };
      }

      if (!Array.isArray(snapshots)) {
        console.error('🔴 Snapshots data is not an array, resetting...');
        await chrome.storage.local.set({ [this.storageKey]: [] });
        return { repaired: true, removed: 'all', reason: 'not_array' };
      }

      const validSnapshots = [];
      const corruptedSnapshots = [];

      for (let i = 0; i < snapshots.length; i++) {
        const snapshot = snapshots[i];
        const validation = this._validateSnapshotStructure(snapshot);

        if (validation.valid) {
          validSnapshots.push(snapshot);
        } else {
          console.warn(`🔴 Corrupted snapshot at index ${i}:`, {
            id: snapshot?.id || 'unknown',
            errors: validation.errors
          });
          corruptedSnapshots.push({
            index: i,
            id: snapshot?.id || 'unknown',
            errors: validation.errors
          });
        }
      }

      if (corruptedSnapshots.length > 0) {
        console.log(`🔧 Removing ${corruptedSnapshots.length} corrupted snapshots...`);
        await chrome.storage.local.set({
          [this.storageKey]: validSnapshots
        });

        return {
          repaired: true,
          removed: corruptedSnapshots.length,
          validRemaining: validSnapshots.length,
          corruptedSnapshots
        };
      }

      console.log(`✅ All ${snapshots.length} snapshots are valid`);
      return { repaired: false, removed: 0 };
    } catch (_error) {
      console.error('Failed to detect/repair corruption:', _error);
      await this._logDetailedError('detectAndRepairCorruption', _error);

      try {
        console.warn('⚠️ Attempting emergency reset of snapshots storage...');
        await chrome.storage.local.set({ [this.storageKey]: [] });
        return {
          repaired: true,
          removed: 'all',
          reason: 'emergency_reset'
        };
      } catch (resetError) {
        console.error('Emergency reset failed:', resetError);
        throw resetError;
      }
    }
  }

  /**
   * Create a snapshot of current bookmark state
   * @param {string} description - Description of what operation this snapshot is for
   * @param {Object} metadata - Additional metadata (e.g., operation type, bookmark count)
   * @returns {Promise<Object>} Created snapshot object
   */
  async createSnapshot(description, metadata = {}) {
    try {
      console.log(`📸 Creating snapshot: ${description}`);

      await this._detectAndRepairCorruption();

      const storageState = await this._getStorageState();
      console.log(
        `📊 Current storage usage: ${storageState.usagePercent}% (${
          storageState.totalSizeMB
        }MB / ${(this.QUOTA_BYTES_LIMIT / (1024 * 1024)).toFixed(2)}MB)`
      );

      const tree = await chrome.bookmarks.getTree();

      const snapshot = {
        id: this._generateSnapshotId(),
        timestamp: Date.now(),
        description: description,
        metadata: {
          ...metadata,
          version: '1.0',
          createdBy: 'BookmarkMind'
        },
        bookmarkTree: tree[0]
      };

      const validation = this._validateSnapshotStructure(snapshot);
      if (!validation.valid) {
        throw new Error(`Invalid snapshot structure: ${validation.errors.join(', ')}`);
      }

      const snapshotSize = new Blob([JSON.stringify(snapshot)]).size;
      const snapshotSizeMB = (snapshotSize / (1024 * 1024)).toFixed(4);
      console.log(`📦 Snapshot size: ${snapshotSizeMB}MB`);

      if (snapshotSize > this.QUOTA_BYTES_LIMIT * this.SAFE_THRESHOLD) {
        console.warn(
          `⚠️ Snapshot size (${snapshotSizeMB}MB) exceeds safe threshold, may cause storage issues`
        );
      }

      await this._saveSnapshot(snapshot);

      console.log(`✅ Snapshot created: ${snapshot.id}`);
      return snapshot;
    } catch (_error) {
      await this._logDetailedError('createSnapshot', _error, {
        description,
        metadata
      });
      throw new Error(`Failed to create snapshot: ${_error.message}`);
    }
  }

  /**
   * Get all available snapshots with corruption checking
   * @returns {Promise<Array>} Array of snapshot metadata (without full tree data)
   */
  async getSnapshots() {
    try {
      await this._detectAndRepairCorruption();

      const result = await chrome.storage.local.get([this.storageKey]);
      const snapshots = result[this.storageKey];

      if (!snapshots) {
        console.log('📭 No snapshots found');
        return [];
      }

      if (!Array.isArray(snapshots)) {
        console.error('🔴 Snapshots data is corrupted (not an array)');
        await this._logDetailedError('getSnapshots', new Error('Snapshots data is not an array'), {
          snapshotsType: typeof snapshots,
          snapshotsValue: JSON.stringify(snapshots).substring(0, 500)
        });
        await chrome.storage.local.set({ [this.storageKey]: [] });
        return [];
      }

      const validSnapshots = snapshots
        .filter((snapshot) => {
          const validation = this._validateSnapshotStructure(snapshot);
          if (!validation.valid) {
            console.warn('⚠️ Filtering out invalid snapshot:', snapshot?.id, validation.errors);
            return false;
          }
          return true;
        })
        .map((snapshot) => ({
          id: snapshot.id,
          timestamp: snapshot.timestamp,
          description: snapshot.description,
          metadata: snapshot.metadata
        }));

      if (validSnapshots.length !== snapshots.length) {
        console.warn(`⚠️ Filtered ${snapshots.length - validSnapshots.length} invalid snapshots`);
      }

      console.log(`📦 Loaded ${validSnapshots.length} valid snapshots`);
      return validSnapshots;
    } catch (_error) {
      await this._logDetailedError('getSnapshots', _error);
      console.error(
        '🔴 Critical error getting snapshots, returning empty array for graceful degradation'
      );
      return [];
    }
  }

  /**
   * Get a specific snapshot by ID with validation
   * @param {string} snapshotId - Snapshot ID
   * @returns {Promise<Object|null>} Snapshot object or null if not found
   */
  async getSnapshot(snapshotId) {
    try {
      if (!snapshotId || typeof snapshotId !== 'string') {
        throw new Error('Invalid snapshot ID');
      }

      await this._detectAndRepairCorruption();

      const result = await chrome.storage.local.get([this.storageKey]);
      const snapshots = result[this.storageKey];

      if (!snapshots || !Array.isArray(snapshots)) {
        console.warn('🔴 No valid snapshots array found');
        return null;
      }

      const snapshot = snapshots.find((s) => s.id === snapshotId);

      if (!snapshot) {
        console.warn(`⚠️ Snapshot ${snapshotId} not found`);
        return null;
      }

      const validation = this._validateSnapshotStructure(snapshot);
      if (!validation.valid) {
        console.error(`🔴 Snapshot ${snapshotId} is corrupted:`, validation.errors);
        await this._logDetailedError('getSnapshot', new Error('Snapshot validation failed'), {
          snapshotId,
          validationErrors: validation.errors
        });
        return null;
      }

      console.log(`✅ Loaded snapshot: ${snapshotId}`);
      return snapshot;
    } catch (_error) {
      await this._logDetailedError('getSnapshot', _error, { snapshotId });
      return null;
    }
  }

  /**
   * Restore bookmarks from a snapshot
   * @param {string} snapshotId - Snapshot ID to restore
   * @param {Function} progressCallback - Progress update callback
   * @returns {Promise<Object>} Restoration results
   */
  async restoreSnapshot(snapshotId, progressCallback) {
    // Initialize counting variables at the start of the function
    const results = {
      foldersCreated: 0,
      foldersDeleted: 0,
      bookmarksRestored: 0,
      bookmarksRemoved: 0,
      errors: []
    };

    try {
      console.log(`🔄 Restoring snapshot: ${snapshotId}`);

      // Notify background script to disable bookmark move listener
      try {
        await chrome.runtime.sendMessage({
          action: 'startSnapshotRestore'
        });
      } catch (_error) {
        console.warn('Could not notify background script about snapshot restore start:', _error);
      }

      progressCallback?.({
        stage: 'loading',
        progress: 0,
        message: 'Loading snapshot...'
      });

      const snapshot = await this.getSnapshot(snapshotId);
      if (!snapshot) {
        throw new Error('Snapshot not found or corrupted');
      }

      progressCallback?.({
        stage: 'preparing',
        progress: 10,
        message: 'Preparing restoration...'
      });

      const currentTree = await chrome.bookmarks.getTree();

      progressCallback?.({
        stage: 'clearing',
        progress: 20,
        message: 'Clearing current bookmarks...'
      });
      await this._clearCurrentBookmarks(currentTree[0], results, progressCallback);

      progressCallback?.({
        stage: 'restoring',
        progress: 50,
        message: 'Restoring bookmarks...'
      });
      await this._restoreBookmarkTree(snapshot.bookmarkTree, results, progressCallback);

      progressCallback?.({
        stage: 'complete',
        progress: 100,
        message: 'Restoration complete'
      });

      console.log('✅ Snapshot restored successfully:', results);

      // Notify background script to re-enable bookmark move listener
      try {
        await chrome.runtime.sendMessage({
          action: 'endSnapshotRestore'
        });
      } catch (_error) {
        console.warn('Could not notify background script about snapshot restore end:', _error);
      }

      return results;
    } catch (_error) {
      // Ensure listener is re-enabled even on error
      try {
        await chrome.runtime.sendMessage({
          action: 'endSnapshotRestore'
        });
      } catch (msgError) {
        console.warn(
          'Could not notify background script about snapshot restore end (error case):',
          msgError
        );
      }

      await this._logDetailedError('restoreSnapshot', _error, {
        snapshotId
      });
      throw new Error(`Failed to restore snapshot: ${_error.message}`);
    }
  }

  /**
   * Delete a snapshot
   * @param {string} snapshotId - Snapshot ID to delete
   * @returns {Promise<boolean>} Success status
   */
  async deleteSnapshot(snapshotId) {
    try {
      if (!snapshotId || typeof snapshotId !== 'string') {
        throw new Error('Invalid snapshot ID');
      }

      const result = await chrome.storage.local.get([this.storageKey]);
      const snapshots = result[this.storageKey] || [];

      if (!Array.isArray(snapshots)) {
        console.error('🔴 Snapshots data is corrupted');
        await chrome.storage.local.set({ [this.storageKey]: [] });
        return false;
      }

      const filteredSnapshots = snapshots.filter((s) => s.id !== snapshotId);

      if (filteredSnapshots.length === snapshots.length) {
        console.warn(`⚠️ Snapshot ${snapshotId} not found`);
        return false;
      }

      await chrome.storage.local.set({
        [this.storageKey]: filteredSnapshots
      });

      console.log(`🗑️ Snapshot deleted: ${snapshotId}`);
      return true;
    } catch (_error) {
      await this._logDetailedError('deleteSnapshot', _error, {
        snapshotId
      });
      return false;
    }
  }

  /**
   * Clear all snapshots
   * @returns {Promise<boolean>} Success status
   */
  async clearAllSnapshots() {
    try {
      await chrome.storage.local.set({
        [this.storageKey]: []
      });

      console.log('🗑️ All snapshots cleared');
      return true;
    } catch (_error) {
      await this._logDetailedError('clearAllSnapshots', _error);
      return false;
    }
  }

  /**
   * Save snapshot to storage with robust error handling
   * @private
   */
  async _saveSnapshot(snapshot) {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      let snapshots = result[this.storageKey] || [];

      if (!Array.isArray(snapshots)) {
        console.warn('🔴 Snapshots data corrupted, resetting...');
        snapshots = [];
      }

      snapshots.push(snapshot);
      snapshots.sort((a, b) => b.timestamp - a.timestamp);

      // Get max snapshots setting
      try {
        const settingsResult = await chrome.storage.sync.get(['bookmarkMindSettings']);
        if (
          settingsResult.bookmarkMindSettings &&
          settingsResult.bookmarkMindSettings.maxSnapshots !== undefined
        ) {
          let max = Number.parseInt(settingsResult.bookmarkMindSettings.maxSnapshots, 10);
          // 0 means unlimited
          if (max === 0) max = 10000;
          this.maxSnapshots = max;
        }
      } catch (settingsError) {
        console.warn('Failed to load maxSnapshots setting:', settingsError);
      }

      if (snapshots.length > this.maxSnapshots) {
        console.log(`📦 Removing old snapshots (keeping ${this.maxSnapshots} most recent)`);
        snapshots = snapshots.slice(0, this.maxSnapshots);
      }

      const dataSize = new Blob([JSON.stringify(snapshots)]).size;
      const dataSizeMB = (dataSize / (1024 * 1024)).toFixed(4);

      if (dataSize > this.QUOTA_BYTES_LIMIT) {
        console.warn(`⚠️ Data size (${dataSizeMB}MB) exceeds quota, reducing snapshots...`);
        throw new Error('QUOTA_BYTES quota exceeded');
      }

      await chrome.storage.local.set({
        [this.storageKey]: snapshots
      });

      console.log(`💾 Saved ${snapshots.length} snapshots (${dataSizeMB}MB)`);
    } catch (_error) {
      if (
        _error.message &&
        (_error.message.includes('QUOTA_BYTES') || _error.message.includes('quota'))
      ) {
        console.warn('⚠️ Storage quota exceeded, initiating cleanup...');
        await this._handleQuotaExceeded(snapshot);
      } else {
        await this._logDetailedError('_saveSnapshot', _error);
        throw _error;
      }
    }
  }

  /**
   * Handle storage quota exceeded with aggressive cleanup
   * @private
   */
  async _handleQuotaExceeded(newSnapshot) {
    try {
      console.log('🧹 Starting quota exceeded recovery...');

      const storageState = await this._getStorageState();
      console.log('Current storage state:', storageState);

      const result = await chrome.storage.local.get([this.storageKey]);
      let snapshots = result[this.storageKey] || [];

      if (!Array.isArray(snapshots)) {
        snapshots = [];
      }

      snapshots.push(newSnapshot);
      snapshots.sort((a, b) => b.timestamp - a.timestamp);

      let savedSuccessfully = false;
      let keepCount = Math.min(snapshots.length - 1, 5);

      while (!savedSuccessfully && keepCount > 0) {
        const trimmedSnapshots = snapshots.slice(0, keepCount);
        const testSize = new Blob([JSON.stringify(trimmedSnapshots)]).size;
        const testSizeMB = (testSize / (1024 * 1024)).toFixed(4);

        console.log(`🔄 Attempting save with ${keepCount} snapshots (${testSizeMB}MB)...`);

        if (testSize > this.QUOTA_BYTES_LIMIT * this.SAFE_THRESHOLD) {
          console.log(`⚠️ ${keepCount} snapshots still too large, reducing further...`);
          keepCount--;
          continue;
        }

        try {
          await chrome.storage.local.set({
            [this.storageKey]: trimmedSnapshots
          });
          savedSuccessfully = true;
          console.log(`✅ Saved snapshot with ${keepCount} total snapshots (${testSizeMB}MB)`);
        } catch (_error) {
          console.warn(`❌ Failed to save with ${keepCount} snapshots, reducing...`);
          keepCount--;
        }
      }

      if (!savedSuccessfully) {
        console.error('🔴 Unable to save snapshot even after aggressive cleanup');
        await chrome.storage.local.set({
          [this.storageKey]: [newSnapshot]
        });
        console.log('⚠️ Saved only the new snapshot, all old snapshots removed');
      }
    } catch (_error) {
      await this._logDetailedError('_handleQuotaExceeded', _error);
      throw new Error(`Quota recovery failed: ${_error.message}`);
    }
  }

  /**
   * Clear current bookmarks (except root folders)
   * @private
   */
  async _clearCurrentBookmarks(rootNode, results, progressCallback) {
    const queue = [];

    if (rootNode.children) {
      for (const child of rootNode.children) {
        if (['1', '2', '3'].includes(child.id)) {
          if (child.children) {
            queue.push(...child.children);
          }
        }
      }
    }

    const total = queue.length;
    let processed = 0;

    for (const node of queue) {
      try {
        await chrome.bookmarks.removeTree(node.id);

        if (node.url) {
          results.bookmarksRemoved++;
        } else {
          results.foldersDeleted++;
        }

        processed++;
        const progress = 20 + Math.floor((processed / total) * 30);
        progressCallback?.({
          stage: 'clearing',
          progress,
          message: `Clearing... (${processed}/${total})`
        });
      } catch (_error) {
        console.warn(`Failed to remove node ${node.id}:`, _error);
        results.errors.push(`Failed to remove: ${node.title || node.url}`);
      }
    }
  }

  /**
   * Restore bookmark tree from snapshot
   * @private
   */
  async _restoreBookmarkTree(snapshotTree, results, progressCallback) {
    const folderMap = new Map();
    folderMap.set('0', '0');
    folderMap.set('1', '1');
    folderMap.set('2', '2');
    folderMap.set('3', '3');

    const allNodes = [];
    const collectNodes = (node, depth = 0) => {
      if (node.id !== '0' && !['1', '2', '3'].includes(node.id)) {
        allNodes.push({ node, depth });
      }
      if (node.children) {
        node.children.forEach((child) => collectNodes(child, depth + 1));
      }
    };

    collectNodes(snapshotTree);

    allNodes.sort((a, b) => a.depth - b.depth);

    const total = allNodes.length;
    let processed = 0;

    for (const { node } of allNodes) {
      try {
        const parentId = folderMap.get(node.parentId);

        if (!parentId) {
          console.warn(`Parent not found for node ${node.id}, skipping...`);
          continue;
        }

        if (node.url) {
          const bookmark = await chrome.bookmarks.create({
            parentId: parentId,
            title: node.title,
            url: node.url,
            index: node.index
          });

          results.bookmarksRestored++;
          folderMap.set(node.id, bookmark.id);
        } else {
          const folder = await chrome.bookmarks.create({
            parentId: parentId,
            title: node.title,
            index: node.index
          });

          results.foldersCreated++;
          folderMap.set(node.id, folder.id);
        }

        processed++;
        const progress = 50 + Math.floor((processed / total) * 45);
        progressCallback?.({
          stage: 'restoring',
          progress,
          message: `Restoring... (${processed}/${total})`
        });
      } catch (_error) {
        console.error(`Failed to restore node ${node.id}:`, _error);
        results.errors.push(`Failed to restore: ${node.title || node.url}`);
      }
    }
  }

  /**
   * Generate unique snapshot ID
   * @private
   */
  _generateSnapshotId() {
    return `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get storage usage information
   * @returns {Promise<Object>} Storage usage stats
   */
  async getStorageInfo() {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const snapshots = result[this.storageKey] || [];

      if (!Array.isArray(snapshots)) {
        console.warn('🔴 Snapshots data corrupted in getStorageInfo');
        return {
          snapshotCount: 0,
          totalSizeBytes: 0,
          totalSizeMB: '0.00',
          maxSnapshots: this.maxSnapshots,
          warning: 'Snapshots data corrupted'
        };
      }

      const totalSize = new Blob([JSON.stringify(snapshots)]).size;
      const storageState = await this._getStorageState();

      return {
        snapshotCount: snapshots.length,
        totalSizeBytes: totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
        maxSnapshots: this.maxSnapshots,
        quotaUsagePercent: storageState?.usagePercent || 'N/A',
        quotaRemainingMB: storageState?.quotaRemainingMB || 'N/A'
      };
    } catch (_error) {
      await this._logDetailedError('getStorageInfo', _error);
      return {
        snapshotCount: 0,
        totalSizeBytes: 0,
        totalSizeMB: '0.00',
        maxSnapshots: this.maxSnapshots,
        error: _error.message
      };
    }
  }

  /**
   * Run diagnostics on snapshot storage
   * @returns {Promise<Object>} Diagnostic report
   */
  async runDiagnostics() {
    try {
      console.log('🔍 Running snapshot storage diagnostics...');

      const storageState = await this._getStorageState();
      const repairResult = await this._detectAndRepairCorruption();
      const storageInfo = await this.getStorageInfo();

      const diagnostics = {
        timestamp: new Date().toISOString(),
        storageState,
        repairResult,
        storageInfo,
        health: 'unknown'
      };

      if (repairResult.removed > 0) {
        diagnostics.health = 'repaired';
      } else if (storageInfo.error) {
        diagnostics.health = 'critical';
      } else if (Number.parseFloat(storageState?.usagePercent || 0) > 90) {
        diagnostics.health = 'warning';
      } else {
        diagnostics.health = 'good';
      }

      console.log('📊 Diagnostics complete:', diagnostics);
      return diagnostics;
    } catch (_error) {
      await this._logDetailedError('runDiagnostics', _error);
      return {
        timestamp: new Date().toISOString(),
        health: 'critical',
        error: _error.message
      };
    }
  }
}

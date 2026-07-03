/**
 * BookmarkMind - Folder Consolidator
 * Consolidates bookmarks from sparse folders (less than 3 bookmarks) to parent folders
 */

export class FolderConsolidator {
  constructor() {
    this.minBookmarksThreshold = 3; // Minimum bookmarks required to keep a folder
    this.analyticsService = typeof AnalyticsService !== 'undefined' ? new AnalyticsService() : null;
    this.consolidationResults = {
      foldersProcessed: 0,
      bookmarksMoved: 0,
      foldersRemoved: 0,
      consolidationPaths: []
    };
  }

  /**
   * Main function to consolidate sparse folders
   * @returns {Promise<Object>} Consolidation results
   */
  async consolidateSparsefolders() {
    console.log('🗂️ Starting folder consolidation process...');

    // Reset results
    this.consolidationResults = {
      foldersProcessed: 0,
      bookmarksMoved: 0,
      foldersRemoved: 0,
      consolidationPaths: []
    };

    try {
      // Get all bookmark folders from main locations
      const rootFolders = ['1', '2']; // Bookmarks Bar and Other Bookmarks

      for (const rootId of rootFolders) {
        await this._processFolder(rootId, 0);
      }

      console.log('✅ Folder consolidation completed:', this.consolidationResults);

      // Record analytics
      if (this.analyticsService) {
        await this.analyticsService.recordConsolidation({
          ...this.consolidationResults,
          timestamp: Date.now()
        });
      }

      return this.consolidationResults;
    } catch (_error) {
      console.error('❌ _error during folder consolidation:', _error);
      throw new Error(`Folder consolidation failed: ${_error.message}`);
    }
  }

  /**
   * Recursively process folders and consolidate sparse ones
   * @param {string} folderId - Folder ID to process
   * @param {number} depth - Current depth in folder hierarchy
   */
  async _processFolder(folderId, depth) {
    try {
      const children = await chrome.bookmarks.getChildren(folderId);
      const folders = children.filter((child) => !child.url);
      const _bookmarks = children.filter((child) => child.url);

      // Process subfolders first (bottom-up approach)
      for (const folder of folders) {
        await this._processFolder(folder.id, depth + 1);
      }

      // After processing subfolders, check if current folder needs consolidation
      if (depth > 0) {
        // Don't consolidate root folders
        await this._checkAndConsolidateFolder(folderId);
      }
    } catch (_error) {
      console.error(`_error processing folder ${folderId}:`, _error);
    }
  }

  /**
   * Check if a folder should be consolidated and perform consolidation
   * @param {string} folderId - Folder ID to check
   */
  async _checkAndConsolidateFolder(folderId) {
    try {
      const children = await chrome.bookmarks.getChildren(folderId);
      const bookmarks = children.filter((child) => child.url);
      const subfolders = children.filter((child) => !child.url);

      // Get folder info
      const folderInfo = await chrome.bookmarks.get(folderId);
      const folder = folderInfo[0];

      // Skip if this is a root folder or system folder
      if (this._isSystemFolder(folder)) {
        return;
      }

      this.consolidationResults.foldersProcessed++;

      // Check if folder has fewer than threshold bookmarks
      if (bookmarks.length < this.minBookmarksThreshold && bookmarks.length > 0) {
        console.log(`📁 Found sparse folder: "${folder.title}" with ${bookmarks.length} bookmarks`);

        // Get parent folder
        const parentId = folder.parentId;
        if (parentId && !this._isSystemFolder({ parentId: null })) {
          await this._consolidateFolder(folderId, parentId, bookmarks, folder.title);
        }
      }

      // Also check if folder is completely empty (no bookmarks, no subfolders)
      if (bookmarks.length === 0 && subfolders.length === 0) {
        console.log(`📁 Found empty folder: "${folder.title}"`);
        await this._removeEmptyFolder(folderId, folder.title);
      }
    } catch (_error) {
      console.error(`_error checking folder ${folderId}:`, _error);
    }
  }

  /**
   * Consolidate a sparse folder by moving its bookmarks to parent
   * @param {string} folderId - Folder to consolidate
   * @param {string} parentId - Parent folder ID
   * @param {Array} bookmarks - Bookmarks to move
   * @param {string} folderTitle - Title of folder being consolidated
   */
  async _consolidateFolder(folderId, parentId, bookmarks, folderTitle) {
    try {
      console.log(
        `🚚 Consolidating folder "${folderTitle}" (${bookmarks.length} bookmarks) to parent...`
      );

      // Move all bookmarks to parent folder
      for (const bookmark of bookmarks) {
        // Mark bookmark with AI metadata to prevent learning from consolidation moves
        try {
          const metadataKey = `ai_moved_${bookmark.id}`;
          await chrome.storage.local.set({ [metadataKey]: Date.now() });
        } catch (metadataError) {
          console.warn('Failed to set AI metadata:', metadataError);
        }

        await chrome.bookmarks.move(bookmark.id, { parentId: parentId });
        console.log(`   ✅ Moved bookmark: "${bookmark.title}"`);
        this.consolidationResults.bookmarksMoved++;
      }

      // Remove the now-empty folder
      await chrome.bookmarks.remove(folderId);
      console.log(`   🗑️ Removed empty folder: "${folderTitle}"`);

      this.consolidationResults.foldersRemoved++;
      this.consolidationResults.consolidationPaths.push({
        folderName: folderTitle,
        bookmarkCount: bookmarks.length,
        action: 'consolidated'
      });

      // Check if parent folder now needs consolidation too
      await this._checkParentForConsolidation(parentId);
    } catch (_error) {
      console.error(`_error consolidating folder ${folderId}:`, _error);
    }
  }

  /**
   * Remove an empty folder
   * @param {string} folderId - Folder ID to remove
   * @param {string} folderTitle - Folder title for logging
   */
  async _removeEmptyFolder(folderId, folderTitle) {
    try {
      await chrome.bookmarks.remove(folderId);
      console.log(`🗑️ Removed empty folder: "${folderTitle}"`);

      this.consolidationResults.foldersRemoved++;
      this.consolidationResults.consolidationPaths.push({
        folderName: folderTitle,
        bookmarkCount: 0,
        action: 'removed_empty'
      });
    } catch (_error) {
      console.error(`_error removing empty folder ${folderId}:`, _error);
    }
  }

  /**
   * Check if parent folder now needs consolidation after receiving bookmarks
   * @param {string} parentId - Parent folder ID to check
   */
  async _checkParentForConsolidation(parentId) {
    try {
      // Get parent folder info
      const parentInfo = await chrome.bookmarks.get(parentId);
      const parent = parentInfo[0];

      // Skip if this is a root folder
      if (this._isSystemFolder(parent)) {
        return;
      }

      // Get parent's children
      const children = await chrome.bookmarks.getChildren(parentId);
      const bookmarks = children.filter((child) => child.url);

      // If parent still has fewer than threshold bookmarks, consolidate it too
      if (
        bookmarks.length < this.minBookmarksThreshold &&
        bookmarks.length > 0 &&
        parent.parentId
      ) {
        console.log(
          `📁 Parent folder "${parent.title}" also needs consolidation (${bookmarks.length} bookmarks)`
        );
        await this._consolidateFolder(parentId, parent.parentId, bookmarks, parent.title);
      }
    } catch (_error) {
      console.error(`_error checking parent folder ${parentId}:`, _error);
    }
  }

  /**
   * Check if a folder is a system folder that shouldn't be consolidated
   * @param {Object} folder - Folder object
   * @returns {boolean} True if system folder
   */
  _isSystemFolder(folder) {
    if (!folder) return true;

    // Root folders (Bookmarks Bar, Other Bookmarks, Mobile Bookmarks)
    if (!folder.parentId) return true;

    // System folder names
    const systemFolders = [
      'Bookmarks Bar',
      'Other Bookmarks',
      'Mobile Bookmarks',
      'Recently Added'
    ];

    return systemFolders.includes(folder.title);
  }

  /**
   * Get consolidation preview without actually moving bookmarks
   * @returns {Promise<Object>} Preview of what would be consolidated
   */
  async getConsolidationPreview() {
    console.log('🔍 Generating consolidation preview...');

    const preview = {
      sparseFolders: [],
      emptyFolders: [],
      totalBookmarksToMove: 0,
      totalFoldersToRemove: 0
    };

    try {
      const rootFolders = ['1', '2']; // Bookmarks Bar and Other Bookmarks

      for (const rootId of rootFolders) {
        await this._previewFolder(rootId, 0, preview);
      }

      console.log('📊 Consolidation preview:', preview);
      return preview;
    } catch (_error) {
      console.error('❌ _error generating preview:', _error);
      throw new Error(`Preview generation failed: ${_error.message}`);
    }
  }

  /**
   * Preview folder consolidation without making changes
   * @param {string} folderId - Folder ID to preview
   * @param {number} depth - Current depth
   * @param {Object} preview - Preview object to populate
   */
  async _previewFolder(folderId, depth, preview) {
    try {
      const children = await chrome.bookmarks.getChildren(folderId);
      const folders = children.filter((child) => !child.url);
      const bookmarks = children.filter((child) => child.url);

      // Preview subfolders first
      for (const folder of folders) {
        await this._previewFolder(folder.id, depth + 1, preview);
      }

      // Check current folder
      if (depth > 0) {
        const folderInfo = await chrome.bookmarks.get(folderId);
        const folder = folderInfo[0];

        if (!this._isSystemFolder(folder)) {
          // Check for sparse folders
          if (bookmarks.length < this.minBookmarksThreshold && bookmarks.length > 0) {
            preview.sparseFolders.push({
              name: folder.title,
              bookmarkCount: bookmarks.length,
              path: await this._getFolderPath(folderId)
            });
            preview.totalBookmarksToMove += bookmarks.length;
            preview.totalFoldersToRemove++;
          }

          // Check for empty folders
          if (bookmarks.length === 0 && folders.length === 0) {
            preview.emptyFolders.push({
              name: folder.title,
              path: await this._getFolderPath(folderId)
            });
            preview.totalFoldersToRemove++;
          }
        }
      }
    } catch (_error) {
      console.error(`_error previewing folder ${folderId}:`, _error);
    }
  }

  /**
   * Get the full path of a folder
   * @param {string} folderId - Folder ID
   * @returns {Promise<string>} Full folder path
   */
  async _getFolderPath(folderId) {
    try {
      const path = [];
      let currentId = folderId;

      while (currentId) {
        const folderInfo = await chrome.bookmarks.get(currentId);
        const folder = folderInfo[0];

        if (folder.title && !this._isSystemFolder(folder)) {
          path.unshift(folder.title);
        }

        currentId = folder.parentId;

        // Stop at root folders
        if (!currentId || this._isSystemFolder(folder)) {
          break;
        }
      }

      return path.join(' > ') || 'Root';
    } catch (_error) {
      console.error(`_error getting folder path for ${folderId}:`, _error);
      return 'Unknown Path';
    }
  }

  /**
   * Set the minimum bookmarks threshold
   * @param {number} threshold - New threshold value
   */
  setMinBookmarksThreshold(threshold) {
    if (threshold > 0) {
      this.minBookmarksThreshold = threshold;
      console.log(`📊 Updated minimum bookmarks threshold to: ${threshold}`);
    }
  }
}

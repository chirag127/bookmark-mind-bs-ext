/**
 * BookmarkMind - Folder Manager
 * Handles folder operations and bookmark organization
 */

export class FolderManager {
  constructor() {
    this.folderCache = new Map();
  }

  /**
   * Create folder structure for categories
   * @param {Array} categories - List of categories
   * @returns {Promise<Object>} Mapping of category to folder ID
   */
  async createCategoryFolders(categories) {
    const folderMap = {};

    for (const category of categories) {
      try {
        const folderId = await this._createCategoryFolder(category);
        folderMap[category] = folderId;
      } catch (_error) {
        console.error(`_error creating folder for category ${category}:`, _error);
      }
    }

    return folderMap;
  }

  /**
   * Create or find folder for a category (supports nested paths)
   * @param {string} categoryPath - Category path (e.g., "Work/Projects/Current")
   * @param {string} parentId - Parent folder ID
   * @returns {Promise<string>} Folder ID
   */
  async _createCategoryFolder(categoryPath, parentId = '1') {
    // Check cache first
    const cacheKey = `${parentId}:${categoryPath}`;
    if (this.folderCache.has(cacheKey)) {
      return this.folderCache.get(cacheKey);
    }

    const parts = categoryPath
      .split('/')
      .map((part) => part.trim())
      .filter((part) => part);
    let currentParentId = parentId;

    for (const part of parts) {
      const existingFolder = await this._findFolderByName(part, currentParentId);

      if (existingFolder) {
        currentParentId = existingFolder.id;
      } else {
        const newFolder = await this._createFolder(part, currentParentId);
        currentParentId = newFolder.id;
      }
    }

    // Cache the result
    this.folderCache.set(cacheKey, currentParentId);
    return currentParentId;
  }

  /**
   * Find folder by name in parent
   * @param {string} name - Folder name
   * @param {string} parentId - Parent folder ID
   * @returns {Promise<Object|null>} Folder object or null
   */
  async _findFolderByName(name, parentId) {
    try {
      const children = await chrome.bookmarks.getChildren(parentId);
      return children.find((child) => !child.url && child.title === name) || null;
    } catch (_error) {
      console.error('_error finding folder:', _error);
      return null;
    }
  }

  /**
   * Create a new folder
   * @param {string} title - Folder title
   * @param {string} parentId - Parent folder ID
   * @returns {Promise<Object>} Created folder
   */
  async _createFolder(title, parentId) {
    try {
      const folder = await chrome.bookmarks.create({
        parentId: parentId,
        title: title
      });
      console.log(`Created folder: ${title} in ${parentId}`);
      return folder;
    } catch (_error) {
      console.error(`_error creating folder ${title}:`, _error);
      throw _error;
    }
  }

  /**
   * Move multiple bookmarks to folders efficiently
   * @param {Array} moves - Array of {bookmarkId, folderId} objects
   * @returns {Promise<Object>} Results summary
   */
  async moveBookmarksToFolders(moves) {
    const results = {
      success: 0,
      errors: 0,
      errorDetails: []
    };

    for (const move of moves) {
      try {
        // Mark bookmark with AI metadata to prevent learning from AI moves
        try {
          const metadataKey = `ai_moved_${move.bookmarkId}`;
          await chrome.storage.local.set({
            [metadataKey]: Date.now()
          });
        } catch (metadataError) {
          console.warn('Failed to set AI metadata:', metadataError);
        }

        await chrome.bookmarks.move(move.bookmarkId, {
          parentId: move.folderId
        });
        results.success++;
      } catch (_error) {
        console.error(`_error moving bookmark ${move.bookmarkId}:`, _error);
        results.errors++;
        results.errorDetails.push({
          bookmarkId: move.bookmarkId,
          error: _error.message
        });
      }
    }

    return results;
  }

  /**
   * Get folder structure for display
   * @param {string} rootId - Root folder ID (default: bookmarks bar)
   * @returns {Promise<Object>} Folder tree structure
   */
  async getFolderStructure(rootId = '1') {
    try {
      const tree = await chrome.bookmarks.getSubTree(rootId);
      return this._buildFolderTree(tree[0]);
    } catch (_error) {
      console.error('_error getting folder structure:', _error);
      return null;
    }
  }

  /**
   * Build folder tree structure
   * @param {Object} node - Bookmark tree node
   * @returns {Object} Folder tree
   */
  _buildFolderTree(node) {
    const tree = {
      id: node.id,
      title: node.title,
      children: [],
      bookmarkCount: 0
    };

    if (node.children) {
      for (const child of node.children) {
        if (child.url) {
          // This is a bookmark
          tree.bookmarkCount++;
        } else {
          // This is a folder
          const childTree = this._buildFolderTree(child);
          tree.children.push(childTree);
          tree.bookmarkCount += childTree.bookmarkCount;
        }
      }
    }

    return tree;
  }

  /**
   * Clean up empty folders
   * @param {string} rootId - Root folder to start cleanup
   * @returns {Promise<number>} Number of folders removed
   */
  async cleanupEmptyFolders(rootId = '1') {
    let removedCount = 0;

    try {
      const tree = await this.getFolderStructure(rootId);
      removedCount = await this._removeEmptyFolders(tree);
    } catch (_error) {
      console.error('_error cleaning up empty folders:', _error);
    }

    return removedCount;
  }

  /**
   * Recursively remove empty folders
   * @param {Object} folderTree - Folder tree node
   * @returns {Promise<number>} Number of folders removed
   */
  async _removeEmptyFolders(folderTree) {
    let removedCount = 0;

    // Process children first (bottom-up)
    for (const child of folderTree.children) {
      removedCount += await this._removeEmptyFolders(child);
    }

    // Check if this folder is empty after processing children
    if (
      folderTree.children.length === 0 &&
      folderTree.bookmarkCount === 0 &&
      folderTree.id !== '1'
    ) {
      try {
        await chrome.bookmarks.remove(folderTree.id);
        console.log(`Removed empty folder: ${folderTree.title}`);
        removedCount++;
      } catch (_error) {
        console.error(`_error removing empty folder ${folderTree.title}:`, _error);
      }
    }

    return removedCount;
  }

  /**
   * Export bookmark organization to JSON
   * @returns {Promise<Object>} Exported data
   */
  async exportOrganization() {
    try {
      const tree = await chrome.bookmarks.getTree();
      const exportData = {
        exportDate: new Date().toISOString(),
        version: '1.0.0',
        bookmarks: this._flattenBookmarkTree(tree[0])
      };

      return exportData;
    } catch (_error) {
      console.error('_error exporting organization:', _error);
      throw _error;
    }
  }

  /**
   * Flatten bookmark tree for export
   * @param {Object} node - Tree node
   * @param {string} path - Current path
   * @returns {Array} Flattened bookmarks
   */
  _flattenBookmarkTree(node, path = '') {
    const bookmarks = [];
    const currentPath = path ? `${path}/${node.title}` : node.title;

    if (node.url) {
      // This is a bookmark
      bookmarks.push({
        title: node.title,
        url: node.url,
        path: path,
        dateAdded: node.dateAdded
      });
    }

    if (node.children) {
      for (const child of node.children) {
        bookmarks.push(...this._flattenBookmarkTree(child, currentPath));
      }
    }

    return bookmarks;
  }

  /**
   * Clear folder cache
   */
  clearCache() {
    this.folderCache.clear();
  }
}

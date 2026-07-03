/**
 * BookmarkMind - Bookmark Service
 * Handles all Chrome Bookmarks API interactions
 */

export class BookmarkService {
  constructor() {
    this.bookmarkTree = null;
  }

  /**
   * Get all bookmarks from Chrome
   * @returns {Promise<Array>} Array of bookmark objects
   */
  async getAllBookmarks() {
    try {
      // Check if Chrome APIs are available
      if (typeof chrome === 'undefined' || !chrome.bookmarks) {
        throw new Error(
          'Chrome bookmarks API not available. Make sure this runs in extension context.'
        );
      }

      console.log('Accessing Chrome bookmarks API...');
      const tree = await chrome.bookmarks.getTree();

      if (!tree || !tree[0]) {
        throw new Error('Invalid bookmark tree structure received');
      }

      this.bookmarkTree = tree;

      const bookmarks = [];
      this._extractBookmarks(tree[0], bookmarks, '');

      console.log(`Found ${bookmarks.length} bookmarks`);
      console.log('Bookmark distribution by folder:', {
        bookmarksBar: bookmarks.filter((b) => b.parentId === '1').length,
        otherBookmarks: bookmarks.filter((b) => b.parentId === '2').length,
        mobileBookmarks: bookmarks.filter((b) => b.parentId === '3').length,
        other: bookmarks.filter((b) => !['1', '2', '3'].includes(b.parentId)).length
      });

      return bookmarks;
    } catch (_error) {
      console.error('_error getting bookmarks:', _error);
      console.error('Chrome API availability:', {
        chrome: typeof chrome !== 'undefined',
        bookmarks: typeof chrome?.bookmarks !== 'undefined',
        getTree: typeof chrome?.bookmarks?.getTree !== 'undefined'
      });
      throw new Error(`Failed to retrieve bookmarks: ${_error.message}`);
    }
  }

  /**
   * Recursively extract bookmarks from tree structure
   * @param {Object} node - Bookmark tree node
   * @param {Array} bookmarks - Array to collect bookmarks
   * @param {string} currentPath - Current folder path
   */
  _extractBookmarks(node, bookmarks, currentPath = '') {
    if (node.url) {
      // This is a bookmark (has URL)
      bookmarks.push({
        id: node.id,
        title: node.title || 'Untitled',
        url: node.url,
        parentId: node.parentId,
        index: node.index,
        dateAdded: node.dateAdded,
        currentFolder: currentPath || 'Root',
        currentFolderName: this._getFolderName(node.parentId)
      });
    }

    // Recursively process children
    if (node.children) {
      const nodePath = currentPath ? `${currentPath}/${node.title}` : node.title;
      node.children.forEach((child) => {
        this._extractBookmarks(child, bookmarks, nodePath);
      });
    }
  }

  /**
   * Get folder name by ID
   * @param {string} folderId - Folder ID
   * @returns {string} Folder name
   */
  _getFolderName(folderId) {
    const folderNames = {
      0: 'Root',
      1: 'Bookmarks Bar',
      2: 'Other Bookmarks',
      3: 'Mobile Bookmarks'
    };
    return folderNames[folderId] || 'Custom Folder';
  }

  /**
   * Create a new folder
   * @param {string} title - Folder name
   * @param {string} parentId - Parent folder ID (optional)
   * @returns {Promise<Object>} Created folder object
   */
  async createFolder(title, parentId = '1') {
    try {
      const folder = await chrome.bookmarks.create({
        parentId: parentId,
        title: title
      });
      console.log(`Created folder: ${title}`);
      return folder;
    } catch (_error) {
      console.error('_error creating folder:', _error);
      throw new Error(`Failed to create folder: ${title}`);
    }
  }

  /**
   * Move bookmark to a folder
   * @param {string} bookmarkId - Bookmark ID
   * @param {string} parentId - Target folder ID
   * @param {number} index - Position in folder (optional)
   * @returns {Promise<Object>} Moved bookmark object
   */
  async moveBookmark(bookmarkId, parentId, index) {
    try {
      // Get bookmark details before moving
      const bookmarkBefore = await chrome.bookmarks.get(bookmarkId);
      const originalParentId = bookmarkBefore[0].parentId;

      // Get folder names for detailed logging
      let originalFolderName = 'Unknown';
      let targetFolderName = 'Unknown';

      try {
        if (originalParentId) {
          const originalParent = await chrome.bookmarks.get(originalParentId);
          originalFolderName = originalParent[0].title;
        }
      } catch (_e) {
        originalFolderName = `ID:${originalParentId}`;
      }

      try {
        const targetParent = await chrome.bookmarks.get(parentId);
        targetFolderName = targetParent[0].title;
      } catch (_e) {
        targetFolderName = `ID:${parentId}`;
      }

      const moveDetails = { parentId };
      if (index !== undefined) {
        moveDetails.index = index;
      }

      console.log(
        `🔄 Moving "${bookmarkBefore[0].title}" from "${originalFolderName}" to "${targetFolderName}"`
      );

      // Mark bookmark with AI metadata if this is called during AI categorization
      try {
        const metadataKey = `ai_moved_${bookmarkId}`;
        await chrome.storage.local.set({ [metadataKey]: Date.now() });
      } catch (metadataError) {
        console.warn('Failed to set AI metadata:', metadataError);
      }

      const bookmark = await chrome.bookmarks.move(bookmarkId, moveDetails);

      console.log(`✅ Move completed: "${bookmark.title}" is now in "${targetFolderName}"`);

      return bookmark;
    } catch (_error) {
      console.error('_error moving bookmark:', _error);
      throw new Error(`Failed to move bookmark ${bookmarkId}`);
    }
  }

  /**
   * Find or create a folder by hierarchical path (e.g., "Work > Development > Frontend")
   * @param {string} path - Folder path separated by " > " or "/"
   * @param {string} rootParentId - Root parent ID (default: bookmarks bar)
   * @returns {Promise<string>} Folder ID
   */
  async findOrCreateFolderByPath(path, rootParentId = '1') {
    // Support both " > " (new format) and "/" (legacy format) separators
    const separator = path.includes(' > ') ? ' > ' : '/';
    const parts = path.split(separator).filter((part) => part.trim());
    let currentParentId = rootParentId;

    console.log(`Creating hierarchical folder path: ${path} (${parts.length} levels)`);
    console.log(`Folder hierarchy: ${parts.join(' → ')}`);

    let _currentPath = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      _currentPath += (i === 0 ? '' : ' > ') + part;

      const existingFolder = await this._findFolderByName(part, currentParentId);

      if (existingFolder) {
        console.log(`✓ Found existing folder: ${part} (${existingFolder.id})`);
        currentParentId = existingFolder.id;
      } else {
        console.log(`+ Creating new folder: ${part} in parent ${currentParentId}`);
        const newFolder = await this.createFolder(part, currentParentId);
        currentParentId = newFolder.id;
        console.log(`✓ Created folder: ${part} (${newFolder.id})`);
      }
    }

    console.log(`✅ Hierarchical path complete: ${path} → ${currentParentId}`);

    return currentParentId;
  }

  /**
   * Find folder by name within a parent
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
   * Get bookmark statistics
   * @returns {Promise<Object>} Statistics object
   */
  async getBookmarkStats() {
    try {
      const bookmarks = await this.getAllBookmarks();
      const folders = await this._getAllFolders();

      // Count uncategorized bookmarks (those in main folders, not subfolders)
      const uncategorized = bookmarks.filter((b) => {
        // Include bookmarks directly in main folders (Bookmarks Bar, Other Bookmarks, Mobile Bookmarks)
        return ['1', '2', '3'].includes(b.parentId);
      }).length;

      console.log('Stats calculation:', {
        totalBookmarks: bookmarks.length,
        totalFolders: folders.length,
        uncategorized: uncategorized,
        bookmarksByParent: {
          1: bookmarks.filter((b) => b.parentId === '1').length,
          2: bookmarks.filter((b) => b.parentId === '2').length,
          3: bookmarks.filter((b) => b.parentId === '3').length,
          other: bookmarks.filter((b) => !['1', '2', '3'].includes(b.parentId)).length
        }
      });

      return {
        totalBookmarks: bookmarks.length,
        totalFolders: folders.length,
        uncategorized: uncategorized
      };
    } catch (_error) {
      console.error('_error getting stats:', _error);
      return { totalBookmarks: 0, totalFolders: 0, uncategorized: 0 };
    }
  }

  /**
   * Get all folders
   * @returns {Promise<Array>} Array of folder objects
   */
  async _getAllFolders() {
    try {
      const tree = await chrome.bookmarks.getTree();
      const folders = [];
      this._extractFolders(tree[0], folders);
      return folders;
    } catch (_error) {
      console.error('_error getting folders:', _error);
      return [];
    }
  }

  /**
   * Recursively extract folders from tree
   * @param {Object} node - Tree node
   * @param {Array} folders - Array to collect folders
   */
  _extractFolders(node, folders) {
    if (!node.url && node.id !== '0') {
      // This is a folder (no URL and not root)
      folders.push({
        id: node.id,
        title: node.title,
        parentId: node.parentId
      });
    }

    if (node.children) {
      node.children.forEach((child) => {
        this._extractFolders(child, folders);
      });
    }
  }

  /**
   * Move all bookmarks to the Bookmark Bar root
   * @param {Function} progressCallback - Callback for progress updates
   * @returns {Promise<Object>} Result object
   */
  async moveAllToBookmarkBar(progressCallback) {
    try {
      console.log('Starting move all to Bookmark Bar...');

      // Get all bookmarks first
      const allBookmarks = await this.getAllBookmarks();

      // Filter out bookmarks that are already in the Bookmark Bar root (parentId '1')
      // and ensure we don't move folders, only actual bookmarks (url exists)
      const bookmarksToMove = allBookmarks.filter((b) => b.parentId !== '1' && b.url);

      console.log(`Found ${bookmarksToMove.length} bookmarks to move`);

      if (bookmarksToMove.length === 0) {
        return {
          success: true,
          total: 0,
          moved: 0,
          message: 'No bookmarks to move. All are already in Bookmark Bar.'
        };
      }

      let movedCount = 0;
      const errors = [];

      // Process in batches to avoid UI freezing and API limits
      const batchSize = 10;

      for (let i = 0; i < bookmarksToMove.length; i += batchSize) {
        const batch = bookmarksToMove.slice(i, i + batchSize);

        // Update progress
        if (progressCallback) {
          const percent = Math.round((i / bookmarksToMove.length) * 100);
          progressCallback({
            stage: 'moving',
            progress: percent,
            current: i,
            total: bookmarksToMove.length
          });
        }

        // Process batch
        await Promise.all(
          batch.map(async (bookmark) => {
            try {
              await chrome.bookmarks.move(bookmark.id, {
                parentId: '1'
              });
              movedCount++;
            } catch (_error) {
              console.error(`Failed to move bookmark ${bookmark.id}:`, error);
              errors.push({
                id: bookmark.id,
                title: bookmark.title,
                error: _error.message
              });
            }
          })
        );

        // Small delay between batches
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Final progress update
      if (progressCallback) {
        progressCallback({
          stage: 'complete',
          progress: 100,
          current: bookmarksToMove.length,
          total: bookmarksToMove.length
        });
      }

      return {
        success: true,
        total: bookmarksToMove.length,
        moved: movedCount,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (_error) {
      console.error('_error moving all to bookmark bar:', _error);
      throw new Error(`Failed to move bookmarks: ${_error.message}`);
    }
  }
}

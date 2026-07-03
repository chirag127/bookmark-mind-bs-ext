/**
 * BookmarkMind - Category Grouper
 * Handles semantic grouping of categories into parent folders
 */

export class CategoryGrouper {
  constructor() {
    // Map of keywords to parent groups
    // Order matters: specific keywords should be checked before general ones if needed
    this.groupMappings = [
      {
        group: 'Privacy & Security',
        keywords: [
          'Adblocking',
          'Privacy',
          'VPN',
          'Security',
          'Encryption',
          'Firewall',
          'Antivirus',
          'Authenticator',
          'Password'
        ]
      },
      {
        group: 'Development',
        keywords: [
          'Programming',
          'Coding',
          'Git',
          'API',
          'SDK',
          'Library',
          'Framework',
          'Database',
          'Frontend',
          'Backend',
          'DevOps'
        ]
      },
      {
        group: 'Tools & Utilities',
        keywords: ['Converter', 'Calculator', 'Generator', 'Utility', 'Tool']
      },
      {
        group: 'Entertainment',
        keywords: ['Movie', 'Music', 'Game', 'Streaming', 'Video', 'Comic', 'Manga']
      },
      {
        group: 'Shopping',
        keywords: ['Store', 'Shop', 'Marketplace', 'Deal', 'Coupon']
      },
      {
        group: 'Education',
        keywords: ['Course', 'Tutorial', 'Learn', 'University', 'School', 'Documentation']
      }
    ];
  }

  /**
   * Get the grouped category path for a given category
   * @param {string} category - Original category (e.g., "Adblocking")
   * @returns {string} Grouped path (e.g., "Privacy & Security/Adblocking")
   */
  getGroupedCategory(category) {
    if (!category) return 'Uncategorized';

    // If category is already hierarchical (has '/'), check the first part
    // But we might want to regroup even if it is hierarchical if the top level matches a keyword
    // For now, let's assume we want to group top-level categories primarily

    const parts = category.split('/').map((p) => p.trim());
    const topLevel = parts[0];

    for (const mapping of this.groupMappings) {
      // Check if the top-level category contains any of the keywords
      // We use case-insensitive check
      const lowerTopLevel = topLevel.toLowerCase();

      // Check if the top level IS the group name (avoid "Privacy/Privacy")
      if (lowerTopLevel === mapping.group.toLowerCase()) {
        return category;
      }

      const match = mapping.keywords.some((keyword) =>
        lowerTopLevel.includes(keyword.toLowerCase())
      );

      if (match) {
        // Found a match!
        // If the original category was just "Adblocking", result is "Privacy & Security/Adblocking"
        // If it was "Adblocking/Tools", result is "Privacy & Security/Adblocking/Tools"
        return `${mapping.group}/${category}`;
      }
    }

    // No grouping found, return original
    return category;
  }
}

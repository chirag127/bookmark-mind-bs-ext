import { FolderInsights } from '../../bookmarks/folderInsights.js';
/**
 * Folder Insights UI Controller
 */

/* global FolderInsights */

const folderInsights = new FolderInsights();

let currentFolder = null;
let allFolders = [];
let selectedFolders = [];

document.addEventListener('DOMContentLoaded', async () => {
  initializeEventListeners();
  await loadFolders();
  loadFavorites();
});

function initializeEventListeners() {
  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'popup.html';
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  document.getElementById('folderSelect').addEventListener('change', handleFolderSelect);
  document.getElementById('addFavoriteBtn').addEventListener('click', handleAddFavorite);
  document.getElementById('refreshStatsBtn').addEventListener('click', handleRefreshStats);
  document.getElementById('compareBtn').addEventListener('click', handleCompare);
  document.getElementById('generateTreemapBtn').addEventListener('click', handleGenerateTreemap);
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

  document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`${tabName}Tab`).classList.add('active');
}

async function loadFolders() {
  showLoading();
  try {
    const tree = await chrome.bookmarks.getTree();
    allFolders = [];
    extractFolders(tree[0], allFolders, '');

    populateFolderSelect();
    populateFolderCheckboxes();
  } catch (_error) {
    console.error('_error loading folders:', _error);
    showError('Failed to load folders');
  } finally {
    hideLoading();
  }
}

function extractFolders(node, folders, path) {
  if (node.url) return;

  if (node.id !== '0') {
    const folderPath = path ? `${path} > ${node.title}` : node.title;
    folders.push({
      id: node.id,
      title: node.title,
      path: folderPath
    });

    if (node.children) {
      node.children.forEach((child) => extractFolders(child, folders, folderPath));
    }
  } else if (node.children) {
    node.children.forEach((child) => extractFolders(child, folders, ''));
  }
}

function populateFolderSelect() {
  const select = document.getElementById('folderSelect');
  select.innerHTML = '<option value="">Select a folder...</option>';

  allFolders.forEach((folder) => {
    const option = document.createElement('option');
    option.value = folder.id;
    option.textContent = folder.path;
    select.appendChild(option);
  });
}

function populateFolderCheckboxes() {
  const container = document.getElementById('folderCheckboxes');
  container.innerHTML = '';

  allFolders.forEach((folder) => {
    const item = document.createElement('div');
    item.className = 'folder-checkbox-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = folder.id;
    checkbox.id = `folder-${folder.id}`;
    checkbox.addEventListener('change', handleFolderCheckboxChange);

    const label = document.createElement('label');
    label.htmlFor = `folder-${folder.id}`;
    label.textContent = folder.path;
    label.style.cursor = 'pointer';

    item.appendChild(checkbox);
    item.appendChild(label);
    container.appendChild(item);
  });
}

function handleFolderCheckboxChange(e) {
  const folderId = e.target.value;
  if (e.target.checked) {
    if (selectedFolders.length < 3) {
      selectedFolders.push(folderId);
    } else {
      e.target.checked = false;
      alert('You can compare up to 3 folders at a time');
    }
  } else {
    selectedFolders = selectedFolders.filter((id) => id !== folderId);
  }

  document.getElementById('compareBtn').disabled = selectedFolders.length < 2;
}

async function handleFolderSelect(e) {
  const folderId = e.target.value;
  if (!folderId) {
    document.getElementById('folderStatsSection').classList.add('hidden');
    return;
  }

  await loadFolderStats(folderId);
  await folderInsights.trackFolderAccess(folderId);
}

async function loadFolderStats(folderId) {
  showLoading();
  try {
    currentFolder = folderId;
    const stats = await folderInsights.getFolderStats(folderId);
    const health = folderInsights.calculateHealthScore(stats);
    const suggestions = await folderInsights.getSmartSuggestions(stats);

    displayFolderStats(stats);
    displayHealthScore(health);
    displaySuggestions(suggestions);
    displayRecommendations(health.recommendations);

    document.getElementById('folderStatsSection').classList.remove('hidden');
  } catch (_error) {
    console.error('_error loading folder stats:', _error);
    showError('Failed to load folder statistics');
  } finally {
    hideLoading();
  }
}

function displayFolderStats(stats) {
  document.getElementById('totalBookmarks').textContent = stats.bookmarkCount;
  document.getElementById('directBookmarks').textContent = stats.directBookmarkCount;
  document.getElementById('subfolderCount').textContent = stats.subfolderCount;
  document.getElementById('folderDepth').textContent = stats.depth;

  const lastModified = stats.lastModified
    ? new Date(stats.lastModified).toLocaleDateString()
    : 'Unknown';
  document.getElementById('lastModified').textContent = lastModified;

  const confidence = Math.round(stats.averageConfidence * 100);
  document.getElementById('aiConfidence').textContent = `${confidence}%`;
}

function displayHealthScore(health) {
  const scoreValue = document.getElementById('healthScoreValue');
  const scoreStatus = document.getElementById('healthScoreStatus');
  const scoreCircle = document.getElementById('healthScoreCircle');

  scoreValue.textContent = health.totalScore;
  scoreStatus.textContent = health.status;

  const colors = {
    excellent: 'linear-gradient(135deg, #4caf50 0%, #8bc34a 100%)',
    good: 'linear-gradient(135deg, #8bc34a 0%, #cddc39 100%)',
    fair: 'linear-gradient(135deg, #ff9800 0%, #ff5722 100%)',
    poor: 'linear-gradient(135deg, #f44336 0%, #e91e63 100%)'
  };

  scoreCircle.style.background = colors[health.status] || colors.fair;

  updateMetricBar('distributionScore', 'distributionValue', health.breakdown.bookmarkDistribution);
  updateMetricBar('depthScore', 'depthValue', health.breakdown.depthAppropriate);
  updateMetricBar('organizationScore', 'organizationValue', health.breakdown.organizationQuality);
  updateMetricBar('aiConfidenceScore', 'aiConfidenceValue', health.breakdown.aiConfidence);
}

function updateMetricBar(barId, valueId, score) {
  const bar = document.getElementById(barId);
  const value = document.getElementById(valueId);

  bar.style.width = `${score}%`;
  value.textContent = Math.round(score);

  if (score >= 80) {
    bar.style.background = 'linear-gradient(90deg, #4caf50 0%, #8bc34a 100%)';
  } else if (score >= 60) {
    bar.style.background = 'linear-gradient(90deg, #8bc34a 0%, #cddc39 100%)';
  } else if (score >= 40) {
    bar.style.background = 'linear-gradient(90deg, #ff9800 0%, #ff5722 100%)';
  } else {
    bar.style.background = 'linear-gradient(90deg, #f44336 0%, #e91e63 100%)';
  }
}

function displaySuggestions(suggestions) {
  const container = document.getElementById('suggestionsList');

  if (suggestions.length === 0) {
    container.innerHTML =
      '<p class="no-suggestions">No suggestions at this time. Your folder looks good!</p>';
    return;
  }

  container.innerHTML = '';
  suggestions.forEach((suggestion) => {
    const item = document.createElement('div');
    item.className = `suggestion-item priority-${suggestion.priority}`;

    item.innerHTML = `
      <div class="suggestion-header">
        <span class="suggestion-title">${suggestion.title}</span>
        <span class="suggestion-priority priority-${suggestion.priority}">${suggestion.priority}</span>
      </div>
      <p class="suggestion-description">${suggestion.description}</p>
      <button class="suggestion-action" data-action="${suggestion.action}" data-folder="${suggestion.folderId}">
        Take Action
      </button>
    `;

    container.appendChild(item);
  });

  document.querySelectorAll('.suggestion-action').forEach((btn) => {
    btn.addEventListener('click', handleSuggestionAction);
  });
}

function displayRecommendations(recommendations) {
  const list = document.getElementById('recommendationsList');

  if (recommendations.length === 0) {
    list.innerHTML = '<li>No specific recommendations. Keep up the good work!</li>';
    return;
  }

  list.innerHTML = '';
  recommendations.forEach((rec) => {
    const li = document.createElement('li');
    li.textContent = rec;
    list.appendChild(li);
  });
}

async function handleAddFavorite() {
  if (!currentFolder) return;

  try {
    await folderInsights.addFavoriteFolder(currentFolder);
    showSuccess('Folder added to favorites!');
    loadFavorites();
  } catch (_error) {
    console.error('_error adding favorite:', _error);
    showError('Failed to add folder to favorites');
  }
}

async function handleRefreshStats() {
  if (!currentFolder) return;
  await loadFolderStats(currentFolder);
}

function handleSuggestionAction(e) {
  const action = e.target.dataset.action;
  const folderId = e.target.dataset.folder;

  switch (action) {
    case 'split':
      alert(`Split folder functionality would be implemented here for folder ${folderId}`);
      break;
    case 'consolidate':
      alert(`Consolidate folder functionality would be implemented here for folder ${folderId}`);
      break;
    case 'flatten':
      alert(`Flatten folder functionality would be implemented here for folder ${folderId}`);
      break;
    case 'review':
      window.location.href = 'popup.html';
      break;
    default:
      console.log('Unknown action:', action);
  }
}

async function handleCompare() {
  if (selectedFolders.length < 2) return;

  showLoading();
  try {
    const comparison = await folderInsights.compareFolders(selectedFolders);
    displayComparison(comparison);
    document.getElementById('comparisonResults').classList.remove('hidden');
  } catch (_error) {
    console.error('_error comparing folders:', _error);
    showError('Failed to compare folders');
  } finally {
    hideLoading();
  }
}

function displayComparison(comparison) {
  const table = document.getElementById('comparisonTableBody');
  const headers = document.querySelectorAll('.folder-header');

  comparison.folders.forEach((folder, index) => {
    if (headers[index]) {
      headers[index].textContent = folder.title;
    }
  });

  for (let i = comparison.folders.length; i < 3; i++) {
    if (headers[i]) {
      headers[i].textContent = '';
    }
  }

  const metrics = [
    { label: 'Total Bookmarks', key: 'bookmarkCount' },
    { label: 'Direct Bookmarks', key: 'directBookmarkCount' },
    { label: 'Subfolders', key: 'subfolderCount' },
    { label: 'Depth', key: 'depth' },
    { label: 'Health Score', key: 'health.totalScore' },
    {
      label: 'AI Confidence',
      key: 'averageConfidence',
      format: (v) => `${Math.round(v * 100)}%`
    }
  ];

  table.innerHTML = '';
  metrics.forEach((metric) => {
    const row = document.createElement('tr');

    const labelCell = document.createElement('td');
    labelCell.textContent = metric.label;
    labelCell.style.fontWeight = '600';
    row.appendChild(labelCell);

    comparison.folders.forEach((folder) => {
      const cell = document.createElement('td');
      const value = getNestedValue(folder, metric.key);
      cell.textContent = metric.format ? metric.format(value) : value;
      row.appendChild(cell);
    });

    for (let i = comparison.folders.length; i < 3; i++) {
      const cell = document.createElement('td');
      cell.textContent = '-';
      row.appendChild(cell);
    }

    table.appendChild(row);
  });

  if (comparison.bestOrganized) {
    document.getElementById('bestFolder').innerHTML = `
      <strong>${comparison.bestOrganized.title}</strong><br>
      Health Score: ${comparison.bestOrganized.health.totalScore}<br>
      Status: ${comparison.bestOrganized.health.status}
    `;
  }

  const attentionContainer = document.getElementById('attentionFolders');
  attentionContainer.innerHTML = '';

  if (comparison.needsAttention.length === 0) {
    attentionContainer.textContent = 'All folders are in good shape!';
  } else {
    comparison.needsAttention.forEach((folder) => {
      const item = document.createElement('div');
      item.className = 'folder-list-item';
      item.innerHTML = `
        <strong>${folder.title}</strong><br>
        Health Score: ${folder.health.totalScore} (${folder.health.status})
      `;
      attentionContainer.appendChild(item);
    });
  }
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

async function handleGenerateTreemap() {
  const rootId = document.getElementById('treemapRoot').value;

  showLoading();
  try {
    const treeData = await folderInsights.generateTreeMap(rootId);
    displayTreemap(treeData);
  } catch (_error) {
    console.error('_error generating treemap:', _error);
    showError('Failed to generate tree map');
  } finally {
    hideLoading();
  }
}

function displayTreemap(data) {
  const container = document.getElementById('treemapContainer');
  container.innerHTML = '';

  if (!data || !data.children || data.children.length === 0) {
    container.innerHTML =
      '<p style="text-align: center; color: #5f6368; padding: 40px;">No subfolders to display</p>';
    return;
  }

  const containerWidth = container.clientWidth;
  const containerHeight = 500;

  renderTreemapNode(container, data.children, 0, 0, containerWidth, containerHeight);
}

function renderTreemapNode(container, nodes, x, y, width, height) {
  const totalBookmarks = nodes.reduce((sum, node) => sum + node.bookmarkCount, 0);

  let currentX = x;
  let currentY = y;

  nodes.forEach((node) => {
    const ratio = node.bookmarkCount / totalBookmarks;
    const nodeWidth = width > height ? width * ratio : width;
    const nodeHeight = width > height ? height : height * ratio;

    const div = document.createElement('div');
    div.className = 'treemap-node';
    div.style.position = 'absolute';
    div.style.left = `${currentX}px`;
    div.style.top = `${currentY}px`;
    div.style.width = `${nodeWidth}px`;
    div.style.height = `${nodeHeight}px`;

    const healthColor = getHealthColor(node.healthStatus);
    div.style.background = healthColor;

    div.innerHTML = `
      <div class="treemap-label">${node.title}</div>
      <div class="treemap-count">${node.bookmarkCount} bookmarks</div>
    `;

    div.addEventListener('click', () => {
      document.getElementById('folderSelect').value = node.id;
      handleFolderSelect({ target: { value: node.id } });
      switchTab('overview');
    });

    container.appendChild(div);

    if (width > height) {
      currentX += nodeWidth;
    } else {
      currentY += nodeHeight;
    }
  });
}

function getHealthColor(status) {
  const colors = {
    excellent: '#4caf50',
    good: '#8bc34a',
    fair: '#ff9800',
    poor: '#f44336'
  };
  return colors[status] || colors.fair;
}

async function loadFavorites() {
  try {
    const favorites = await folderInsights.getFavoriteFolders();
    const accessStats = await folderInsights.getFolderAccessStats();

    displayFavorites(favorites);
    displayAccessStats(accessStats);
  } catch (_error) {
    console.error('_error loading favorites:', _error);
  }
}

async function displayFavorites(favoriteIds) {
  const container = document.getElementById('favoritesList');

  if (favoriteIds.length === 0) {
    container.innerHTML =
      '<p class="no-favorites">No favorite folders yet. Add folders from the Overview tab.</p>';
    return;
  }

  container.innerHTML = '';

  for (const folderId of favoriteIds) {
    try {
      const stats = await folderInsights.getFolderStats(folderId);
      const health = folderInsights.calculateHealthScore(stats);

      const item = document.createElement('div');
      item.className = 'favorite-item';

      item.innerHTML = `
        <div class="favorite-header">
          <span class="favorite-title">${stats.title}</span>
          <button class="favorite-remove" data-folder="${folderId}">Remove</button>
        </div>
        <div class="favorite-stats">
          <div class="favorite-stat">
            <span class="favorite-stat-label">Bookmarks</span>
            <span class="favorite-stat-value">${stats.bookmarkCount}</span>
          </div>
          <div class="favorite-stat">
            <span class="favorite-stat-label">Health</span>
            <span class="favorite-stat-value">${health.totalScore}</span>
          </div>
          <div class="favorite-stat">
            <span class="favorite-stat-label">Depth</span>
            <span class="favorite-stat-value">${stats.depth}</span>
          </div>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('favorite-remove')) return;
        document.getElementById('folderSelect').value = folderId;
        handleFolderSelect({ target: { value: folderId } });
        switchTab('overview');
      });

      container.appendChild(item);
    } catch (_error) {
      console.error(`_error loading favorite folder ${folderId}:`, _error);
    }
  }

  document.querySelectorAll('.favorite-remove').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const folderId = e.target.dataset.folder;
      await folderInsights.removeFavoriteFolder(folderId);
      loadFavorites();
    });
  });
}

async function displayAccessStats(accessStats) {
  const container = document.getElementById('accessStats');

  const sorted = Object.entries(accessStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sorted.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #5f6368;">No access data yet</p>';
    return;
  }

  container.innerHTML = '';

  for (const [folderId, count] of sorted) {
    try {
      const [folder] = await chrome.bookmarks.get(folderId);

      const item = document.createElement('div');
      item.className = 'access-stat-item';

      const rank = sorted.indexOf([folderId, count]) + 1;

      item.innerHTML = `
        <div class="access-rank">${rank}</div>
        <div class="access-folder-name">${folder.title}</div>
        <div class="access-count">${count} accesses</div>
      `;

      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        document.getElementById('folderSelect').value = folderId;
        handleFolderSelect({ target: { value: folderId } });
        switchTab('overview');
      });

      container.appendChild(item);
    } catch (_error) {
      console.error(`_error loading folder ${folderId}:`, _error);
    }
  }
}

function showLoading() {
  document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.add('hidden');
}

function showSuccess(message) {
  alert(message);
}

function showError(message) {
  alert(message);
}

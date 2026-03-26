/**
 * Code Visualizer — Frontend Application
 * D3.js-based interactive graph visualization
 */

(function () {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
  const CONFIG = {
    nodeRadius: {
      file: 24,
      function: 18,
      component: 22,
      event: 16,
      route: 18,
      'api-call': 16,
      import: 14,
      export: 14,
      class: 22,
      variable: 12,
      hook: 16,
    },
    nodeColors: {
      file: { fill: '#6366f1', stroke: '#4f46e5', icon: '📄' },
      function: { fill: '#10b981', stroke: '#059669', icon: 'ƒ' },
      component: { fill: '#f59e0b', stroke: '#d97706', icon: '⚛' },
      event: { fill: '#ef4444', stroke: '#dc2626', icon: '⚡' },
      route: { fill: '#8b5cf6', stroke: '#7c3aed', icon: '🔀' },
      'api-call': { fill: '#06b6d4', stroke: '#0891b2', icon: '🌐' },
      import: { fill: '#3b82f6', stroke: '#2563eb', icon: '📦' },
      export: { fill: '#f97316', stroke: '#ea580c', icon: '📤' },
      class: { fill: '#ec4899', stroke: '#db2777', icon: '🏗' },
      variable: { fill: '#64748b', stroke: '#475569', icon: '𝑥' },
      hook: { fill: '#ec4899', stroke: '#db2777', icon: '🪝' },
    },
    edgeColors: {
      imports: '#3b82f6',
      calls: '#10b981',
      renders: '#f59e0b',
      triggers: '#ef4444',
      uses: '#6366f1',
      exports: '#f97316',
      extends: '#ec4899',
      'routes-to': '#8b5cf6',
    },
    simulation: {
      chargeStrength: -1200,
      linkDistance: 250,
      collisionRadius: 60,
      centerStrength: 0.01,
    },
  };

  // ============================================
  // STATE
  // ============================================
  let state = {
    nodes: [],
    edges: [],
    errors: [],
    metadata: null,
    selectedNode: null,
    activeFilters: new Set(),
    searchQuery: '',
    theme: 'dark',
    layout: 'clustered',
  };

  // D3 references
  let svg, g, simulation, zoom;
  let nodeElements, edgeElements, edgeLabelElements;
  let tooltip;

  // ============================================
  // INITIALIZATION
  // ============================================
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    setupTheme();
    setupEventListeners();
    setupGraph();
    setupTooltip();
    populateLegend();
    console.log('🔍 Code Visualizer initialized');
  }

  // ============================================
  // THEME
  // ============================================
  function setupTheme() {
    const saved = localStorage.getItem('cv-theme') || 'dark';
    state.theme = saved;
    document.documentElement.setAttribute('data-theme', saved);
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('cv-theme', state.theme);
  }

  // ============================================
  // EVENT LISTENERS
  // ============================================
  function setupEventListeners() {
    // Tab switching
    document.getElementById('tabPaste').addEventListener('click', () => switchTab('paste'));
    document.getElementById('tabFolder').addEventListener('click', () => switchTab('folder'));

    // Actions
    document.getElementById('btnVisualize').addEventListener('click', visualizeCode);
    document.getElementById('btnLoadSample').addEventListener('click', loadSample);
    document.getElementById('btnGetStarted').addEventListener('click', loadSample);
    document.getElementById('btnParseProject').addEventListener('click', parseProject);
    document.getElementById('btnThemeToggle').addEventListener('click', toggleTheme);

    // Controls
    document.getElementById('btnZoomIn').addEventListener('click', () => zoomBy(1.3));
    document.getElementById('btnZoomOut').addEventListener('click', () => zoomBy(0.7));
    document.getElementById('btnFitView').addEventListener('click', fitToView);
    document.getElementById('btnResetHighlight').addEventListener('click', resetViewAndHighlights);
    document.getElementById('btnLayoutClustered').addEventListener('click', () => setLayout('clustered'));
    document.getElementById('btnLayoutForce').addEventListener('click', () => setLayout('force'));

    // Detail panel
    document.getElementById('btnCloseDetail').addEventListener('click', closeDetailPanel);

    // Help modal
    document.getElementById('btnHelp').addEventListener('click', () => toggleModal('helpModal', true));
    document.getElementById('btnCloseHelp').addEventListener('click', () => toggleModal('helpModal', false));
    document.getElementById('btnDismissError').addEventListener('click', hideError);

    // Search
    document.getElementById('searchInput').addEventListener('input', onSearch);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);

    // Code textarea ctrl+enter
    document.getElementById('codeInput').addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        visualizeCode();
      }
    });
  }

  function handleKeyboard(e) {
    if (e.key === 'Escape') {
      resetHighlights();
      closeDetailPanel();
      toggleModal('helpModal', false);
    }
    if (e.key === 'f' && !isInputFocused()) fitToView();
    if (e.key === 'r' && !isInputFocused()) resetHighlights();
  }

  function isInputFocused() {
    const tag = document.activeElement?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA';
  }

  // ============================================
  // TAB SWITCHING
  // ============================================
  function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    if (tab === 'paste') {
      document.getElementById('tabPaste').classList.add('active');
      document.getElementById('tabContentPaste').classList.add('active');
    } else {
      document.getElementById('tabFolder').classList.add('active');
      document.getElementById('tabContentFolder').classList.add('active');
    }
  }

  // ============================================
  // API CALLS
  // ============================================
  async function visualizeCode() {
    const code = document.getElementById('codeInput').value.trim();
    if (!code) {
      showError('Please paste some code first.');
      return;
    }

    showLoading(true);
    try {
      const response = await fetch('/api/parse-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, fileName: 'input.js' }),
      });
      const data = await response.json();

      if (data.error && data.nodes.length === 0) {
        showError(data.error);
      } else {
        loadGraphData(data);
      }
    } catch (err) {
      showError(`Network error: ${err.message}`);
    } finally {
      showLoading(false);
    }
  }

  async function parseProject() {
    const folderPath = document.getElementById('folderPath').value.trim();
    if (!folderPath) {
      showError('Please enter a project folder path.');
      return;
    }

    showLoading(true);
    try {
      const response = await fetch('/api/parse-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: folderPath }),
      });
      const data = await response.json();

      if (data.error && data.nodes.length === 0) {
        showError(data.error);
      } else {
        loadGraphData(data);
      }
    } catch (err) {
      showError(`Network error: ${err.message}`);
    } finally {
      showLoading(false);
    }
  }

  async function loadSample() {
    showLoading(true);
    try {
      const response = await fetch('/api/sample');
      const data = await response.json();
      loadGraphData(data);

      // Also fill the textarea with sample note
      document.getElementById('codeInput').value = '// Sample React App loaded!\n// Click on nodes to explore the code structure.';
    } catch (err) {
      showError(`Failed to load sample: ${err.message}`);
    } finally {
      showLoading(false);
    }
  }

  // ============================================
  // GRAPH DATA LOADING
  // ============================================
  function loadGraphData(data) {
    state.nodes = data.nodes || [];
    state.edges = data.edges || [];
    state.errors = data.errors || [];
    state.metadata = data.metadata || null;
    state.selectedNode = null;
    state.activeFilters = new Set();

    // Update stats
    updateStats();
    // Populate filters
    populateFilters();
    // Hide empty state, show graph
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('errorState').classList.add('hidden');
    document.getElementById('graphSvg').classList.remove('hidden');
    document.getElementById('graphControls').classList.remove('hidden');
    document.getElementById('minimap').classList.remove('hidden');

    // Render graph
    renderGraph();

    // Show warnings if any
    if (state.errors.length > 0) {
      console.warn('Parse warnings:', state.errors);
    }
  }

  // ============================================
  // STATS UPDATE
  // ============================================
  function updateStats() {
    const fileCount = state.nodes.filter(n => n.type === 'file').length;
    document.querySelector('#statNodes .stat-value').textContent = state.nodes.length;
    document.querySelector('#statEdges .stat-value').textContent = state.edges.length;
    document.querySelector('#statFiles .stat-value').textContent = fileCount;
  }

  // ============================================
  // FILTERS
  // ============================================
  function populateFilters() {
    const container = document.getElementById('filterChips');
    container.innerHTML = '';

    const typeCounts = {};
    state.nodes.forEach(n => {
      typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
    });

    Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
      const colors = CONFIG.nodeColors[type] || CONFIG.nodeColors.variable;
      const chip = document.createElement('div');
      chip.className = 'filter-chip active';
      chip.style.setProperty('--chip-color', colors.fill);
      chip.style.setProperty('--chip-bg', colors.fill + '20');
      chip.dataset.type = type;
      chip.innerHTML = `
        <span class="chip-dot" style="background:${colors.fill}"></span>
        <span>${type}</span>
        <span class="chip-count">${count}</span>
      `;
      chip.addEventListener('click', () => toggleFilter(type, chip));
      container.appendChild(chip);
      state.activeFilters.add(type);
    });
  }

  function toggleFilter(type, chipEl) {
    if (state.activeFilters.has(type)) {
      state.activeFilters.delete(type);
      chipEl.classList.remove('active');
    } else {
      state.activeFilters.add(type);
      chipEl.classList.add('active');
    }
    applyFiltersAndSearch();
  }

  function applyFiltersAndSearch() {
    const query = state.searchQuery.toLowerCase();

    if (nodeElements) {
      nodeElements.classed('dimmed', d => {
        const typeVisible = state.activeFilters.has(d.type);
        const matchesSearch = !query || d.label.toLowerCase().includes(query);
        return !typeVisible || !matchesSearch;
      });
    }

    if (edgeElements) {
      edgeElements.classed('dimmed', d => {
        const sourceNode = state.nodes.find(n => n.id === (d.source.id || d.source));
        const targetNode = state.nodes.find(n => n.id === (d.target.id || d.target));

        if (!sourceNode || !targetNode) return true;

        const sourceVisible = state.activeFilters.has(sourceNode.type) &&
          (!query || sourceNode.label.toLowerCase().includes(query));
        const targetVisible = state.activeFilters.has(targetNode.type) &&
          (!query || targetNode.label.toLowerCase().includes(query));

        return !sourceVisible || !targetVisible;
      });
    }
  }

  function onSearch(e) {
    state.searchQuery = e.target.value;
    applyFiltersAndSearch();
  }

  // ============================================
  // LEGEND
  // ============================================
  function populateLegend() {
    const container = document.getElementById('legendItems');
    container.innerHTML = '';

    const types = [
      { type: 'file', label: 'File' },
      { type: 'function', label: 'Function' },
      { type: 'component', label: 'Component' },
      { type: 'class', label: 'Class' },
      { type: 'event', label: 'Event Handler' },
      { type: 'route', label: 'Route' },
      { type: 'api-call', label: 'API Call' },
      { type: 'hook', label: 'React Hook' },
      { type: 'import', label: 'Import' },
      { type: 'export', label: 'Export' },
    ];

    types.forEach(({ type, label }) => {
      const colors = CONFIG.nodeColors[type];
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `
        <span class="legend-dot" style="background:${colors.fill}"></span>
        <span>${label}</span>
      `;
      container.appendChild(item);
    });
  }

  // ============================================
  // D3 GRAPH SETUP
  // ============================================
  function setupGraph() {
    const svgEl = document.getElementById('graphSvg');
    svg = d3.select(svgEl);

    // Zoom behavior
    zoom = d3.zoom()
      .scaleExtent([0.1, 5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        updateMinimap();
      });

    svg.call(zoom);

    // Main group for zoom/pan
    g = svg.append('g').attr('class', 'graph-main');

    // Arrow marker defs
    const defs = svg.append('defs');

    // Create arrow markers for each edge color
    Object.entries(CONFIG.edgeColors).forEach(([type, color]) => {
      defs.append('marker')
        .attr('id', `arrow-${type}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 28)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-4L10,0L0,4')
        .attr('fill', color)
        .attr('opacity', 0.6);
    });

    // Default arrow
    defs.append('marker')
      .attr('id', 'arrow-default')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 28)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L10,0L0,4')
      .attr('fill', '#3a3a4a')
      .attr('opacity', 0.6);
  }

  // ============================================
  // GRAPH RENDERING — MULTI-LAYOUT ENGINE
  // ============================================
  let collapsedFiles = new Set();

  function renderGraph() {
    g.selectAll('*').remove();
    if (state.nodes.length === 0) return;

    switch (state.layout) {
      case 'clustered':
        renderClusteredLayout();
        break;
      case 'hierarchy':
        renderHierarchyLayout();
        break;
      case 'force':
      default:
        renderForceLayout();
        break;
    }

    // Fit to view after render
    setTimeout(fitToView, 800);
    setTimeout(() => updateMinimap(), 1200);
  }

  // ============================================
  // CLUSTERED LAYOUT — Files as containers
  // ============================================
  function renderClusteredLayout() {
    const width = document.getElementById('graphWrapper').clientWidth;
    const height = document.getElementById('graphWrapper').clientHeight;

    // Group nodes by parent file
    const fileGroups = new Map(); // fileNodeId -> { fileNode, children: [] }
    const orphanNodes = [];

    // First pass: identify file nodes
    state.nodes.forEach(n => {
      if (n.type === 'file') {
        fileGroups.set(n.id, { fileNode: n, children: [] });
      }
    });

    // Second pass: assign children to files
    state.nodes.forEach(n => {
      if (n.type === 'file') return;

      // Find which file this node belongs to via edges
      const parentEdge = state.edges.find(e =>
        e.from && fileGroups.has(e.from) &&
        e.to === n.id &&
        (e.type === 'uses' || e.type === 'imports' || e.type === 'exports')
      );

      if (parentEdge) {
        fileGroups.get(parentEdge.from).children.push(n);
      } else {
        // Try matching by filePath
        const matchingFile = state.nodes.find(f =>
          f.type === 'file' && f.filePath && n.filePath &&
          f.filePath === n.filePath
        );
        if (matchingFile && fileGroups.has(matchingFile.id)) {
          fileGroups.get(matchingFile.id).children.push(n);
        } else {
          orphanNodes.push(n);
        }
      }
    });

    // Calculate container sizes and positions
    const containerPadding = 20;
    const childNodeSize = 32;
    const childSpacingX = 90;
    const childSpacingY = 65;
    const containerSpacingX = 40;
    const containerSpacingY = 40;
    const headerHeight = 40;

    const containers = [];
    fileGroups.forEach((group, fileId) => {
      const isCollapsed = collapsedFiles.has(fileId);
      const visibleChildren = isCollapsed ? [] : group.children.filter(c =>
        state.activeFilters.size === 0 || state.activeFilters.has(c.type)
      );

      const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(visibleChildren.length))));
      const rows = Math.max(1, Math.ceil(visibleChildren.length / cols));

      const containerW = Math.max(160, cols * childSpacingX + containerPadding * 2);
      const containerH = isCollapsed
        ? headerHeight + 12
        : headerHeight + rows * childSpacingY + containerPadding;

      containers.push({
        id: fileId,
        fileNode: group.fileNode,
        children: visibleChildren,
        allChildren: group.children,
        cols,
        rows,
        w: containerW,
        h: containerH,
        x: 0,
        y: 0,
        collapsed: isCollapsed,
      });
    });

    // Sort containers: larger ones first, to center them
    containers.sort((a, b) => b.allChildren.length - a.allChildren.length);

    // Position containers in a grid with smart spacing
    const gridCols = Math.max(1, Math.ceil(Math.sqrt(containers.length)));
    let curX = 0, curY = 0, rowMaxH = 0, col = 0;

    containers.forEach((c, i) => {
      c.x = curX;
      c.y = curY;
      rowMaxH = Math.max(rowMaxH, c.h);
      col++;

      if (col >= gridCols) {
        col = 0;
        curX = 0;
        curY += rowMaxH + containerSpacingY;
        rowMaxH = 0;
      } else {
        curX += c.w + containerSpacingX;
      }
    });

    // Position children within each container
    containers.forEach(container => {
      if (container.collapsed) return;
      container.children.forEach((child, idx) => {
        const col = idx % container.cols;
        const row = Math.floor(idx / container.cols);
        child._cx = container.x + containerPadding + col * childSpacingX + childSpacingX / 2;
        child._cy = container.y + headerHeight + containerPadding / 2 + row * childSpacingY + childSpacingY / 2;
      });
    });

    // Position orphan nodes below containers
    const maxY = containers.reduce((m, c) => Math.max(m, c.y + c.h), 0);
    orphanNodes.forEach((n, i) => {
      const col = i % 8;
      const row = Math.floor(i / 8);
      n._cx = col * 100 + 60;
      n._cy = maxY + 80 + row * 80;
    });

    // Set fixed positions for D3 nodes
    state.nodes.forEach(n => {
      if (n._cx !== undefined) {
        n.x = n._cx;
        n.y = n._cy;
        n.fx = n._cx;
        n.fy = n._cy;
      }
    });

    // --- DRAW FILE CONTAINERS ---
    const containerGroup = g.append('g').attr('class', 'file-containers');

    containers.forEach(container => {
      const cg = containerGroup.append('g')
        .attr('class', 'file-container-group')
        .attr('data-file-id', container.id);

      const colors = CONFIG.nodeColors.file;

      // Container background
      cg.append('rect')
        .attr('class', 'file-container-bg')
        .attr('x', container.x)
        .attr('y', container.y)
        .attr('width', container.w)
        .attr('height', container.h)
        .attr('rx', 12)
        .attr('ry', 12)
        .attr('fill', colors.fill + '08')
        .attr('stroke', colors.fill + '30')
        .attr('stroke-width', 1.5)
        .style('filter', 'drop-shadow(0 2px 8px rgba(0,0,0,0.15))');

      // Container header bar
      cg.append('rect')
        .attr('class', 'file-container-header')
        .attr('x', container.x)
        .attr('y', container.y)
        .attr('width', container.w)
        .attr('height', headerHeight)
        .attr('rx', 12)
        .attr('ry', 12)
        .attr('fill', colors.fill + '15')
        .style('cursor', 'pointer')
        .on('click', (event) => {
          event.stopPropagation();
          toggleFileCollapse(container.id);
        });

      // Clip the bottom corners of header
      cg.append('rect')
        .attr('x', container.x)
        .attr('y', container.y + headerHeight - 12)
        .attr('width', container.w)
        .attr('height', 12)
        .attr('fill', colors.fill + '15');

      // File icon + name
      cg.append('text')
        .attr('class', 'file-container-title')
        .attr('x', container.x + 14)
        .attr('y', container.y + headerHeight / 2 + 5)
        .text(`📄 ${container.fileNode.label}`)
        .style('font-size', '12px')
        .style('font-weight', '600')
        .style('fill', colors.fill)
        .style('font-family', 'var(--font-mono)')
        .style('cursor', 'pointer')
        .on('click', (event) => {
          event.stopPropagation();
          selectNode(container.fileNode);
        });

      // Child count badge
      cg.append('text')
        .attr('x', container.x + container.w - 14)
        .attr('y', container.y + headerHeight / 2 + 4)
        .attr('text-anchor', 'end')
        .text(container.collapsed
          ? `▶ ${container.allChildren.length}`
          : `▼ ${container.allChildren.length}`)
        .style('font-size', '10px')
        .style('fill', colors.fill + '80')
        .style('cursor', 'pointer')
        .on('click', (event) => {
          event.stopPropagation();
          toggleFileCollapse(container.id);
        });

      // Purpose description under header (if not collapsed)
      if (!container.collapsed && container.fileNode.metadata?.purpose) {
        const purposeText = container.fileNode.metadata.purpose.split('.')[0];
        cg.append('text')
          .attr('class', 'file-container-purpose')
          .attr('x', container.x + 14)
          .attr('y', container.y + headerHeight + 14)
          .text(purposeText.length > 45 ? purposeText.slice(0, 45) + '…' : purposeText)
          .style('font-size', '9px')
          .style('fill', 'var(--text-muted)')
          .style('font-style', 'italic');
      }
    });

    // --- DO NOT DRAW GROSS CROSS-FILE EDGES IN CLUSTER MODE ---
    // User requested to hide unnecessary lines in grouping mode so it's clean
    const edgeGroup = g.append('g').attr('class', 'edges');
    edgeElements = edgeGroup.selectAll('.graph-edge').data([]);
    edgeLabelElements = edgeGroup.selectAll('.edge-label').data([]);

    // --- DRAW CHILD NODES (inside containers) ---
    const allVisibleChildren = [];
    containers.forEach(c => {
      if (!c.collapsed) allVisibleChildren.push(...c.children);
    });
    allVisibleChildren.push(...orphanNodes);

    const nodeGroup = g.append('g').attr('class', 'nodes');
    nodeElements = nodeGroup.selectAll('.graph-node')
      .data(allVisibleChildren)
      .join('g')
      .attr('class', 'graph-node')
      .attr('transform', d => `translate(${d.x || 0}, ${d.y || 0})`)
      .style('cursor', 'pointer')
      // Dragging removed from grouped nodes to maintain layout rigidity
      .on('click', (event, d) => {
        event.stopPropagation();
        selectNode(d);
      })
      .on('mouseenter', (event, d) => showTooltip(event, d))
      .on('mousemove', (event) => moveTooltip(event))
      .on('mouseleave', () => hideTooltip());

    // Node shapes (smaller than force layout)
    nodeElements.each(function (d) {
      const el = d3.select(this);
      const radius = Math.min(getNodeRadius(d), 16);
      const colors = CONFIG.nodeColors[d.type] || CONFIG.nodeColors.variable;

      if (d.type === 'component') {
        const s = radius;
        el.append('polygon')
          .attr('class', 'node-shape')
          .attr('points', `0,${-s} ${s},0 0,${s} ${-s},0`)
          .attr('fill', colors.fill + '25')
          .attr('stroke', colors.fill)
          .attr('stroke-width', 1.5);
      } else if (d.type === 'event' || d.type === 'hook') {
        const s = radius;
        const points = [];
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          points.push(`${s * Math.cos(angle)},${s * Math.sin(angle)}`);
        }
        el.append('polygon')
          .attr('class', 'node-shape')
          .attr('points', points.join(' '))
          .attr('fill', colors.fill + '25')
          .attr('stroke', colors.fill)
          .attr('stroke-width', 1.5);
      } else {
        el.append('circle')
          .attr('class', 'node-shape')
          .attr('r', radius)
          .attr('fill', colors.fill + '25')
          .attr('stroke', colors.fill)
          .attr('stroke-width', 1.5);
      }
    });

    // Node icons
    nodeElements.append('text')
      .attr('class', 'node-icon')
      .attr('dy', '0.35em')
      .style('font-size', '10px')
      .text(d => (CONFIG.nodeColors[d.type] || CONFIG.nodeColors.variable).icon);

    // Node labels
    nodeElements.append('text')
      .attr('class', 'node-label')
      .attr('dy', d => Math.min(getNodeRadius(d), 16) + 14)
      .style('font-size', '9px')
      .text(d => truncateLabel(d.label, 14));

    // Entry animation
    nodeElements.style('opacity', 0)
      .transition().delay((d, i) => i * 15).duration(300)
      .style('opacity', 1);

    containerGroup.selectAll('.file-container-bg')
      .style('opacity', 0)
      .transition().duration(500)
      .style('opacity', 1);

    // No simulation needed — positions are fixed

    // Click background to deselect
    svg.on('click', () => { resetHighlights(); closeDetailPanel(); });
  }

  function toggleFileCollapse(fileId) {
    if (collapsedFiles.has(fileId)) {
      collapsedFiles.delete(fileId);
    } else {
      collapsedFiles.add(fileId);
    }
    renderGraph();
  }

  function getCurvedPath(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const curvature = Math.min(dist * 0.2, 60);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 - curvature;
    return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
  }

  // ============================================
  // HIERARCHY LAYOUT — Dependency tree
  // ============================================
  function renderHierarchyLayout() {
    const width = document.getElementById('graphWrapper').clientWidth;
    const height = document.getElementById('graphWrapper').clientHeight;

    // Build a tree from file dependencies
    const fileNodes = state.nodes.filter(n => n.type === 'file');
    const nonFileNodes = state.nodes.filter(n => n.type !== 'file');

    // Find entry point (index.jsx or App.jsx or first file)
    let rootFile = fileNodes.find(f => /index\.(js|jsx|ts|tsx)$/i.test(f.label))
      || fileNodes.find(f => /App\.(js|jsx|ts|tsx)$/i.test(f.label))
      || fileNodes[0];

    if (!rootFile) {
      renderForceLayout();
      return;
    }

    // Build adjacency from import edges
    const fileImports = new Map(); // fileId -> [importedFileId]
    state.edges.forEach(e => {
      if (e.type === 'imports') {
        const fromNode = state.nodes.find(n => n.id === e.from);
        const toNode = state.nodes.find(n => n.id === e.to);
        if (fromNode?.type === 'file' || toNode?.type === 'file') {
          const fromFile = fromNode?.type === 'file' ? fromNode : fileNodes.find(f => f.filePath === fromNode?.filePath);
          const toFile = toNode?.type === 'file' ? toNode : fileNodes.find(f => f.filePath === toNode?.filePath);
          if (fromFile && toFile && fromFile.id !== toFile.id) {
            if (!fileImports.has(fromFile.id)) fileImports.set(fromFile.id, new Set());
            fileImports.get(fromFile.id).add(toFile.id);
          }
        }
      }
    });

    // Build tree data for d3.tree()
    const visited = new Set();
    function buildTreeData(fileNode) {
      if (visited.has(fileNode.id)) return null;
      visited.add(fileNode.id);

      const childrenIds = fileImports.get(fileNode.id) || new Set();
      const treeChildren = [];
      childrenIds.forEach(childId => {
        const childFile = fileNodes.find(f => f.id === childId);
        if (childFile) {
          const subtree = buildTreeData(childFile);
          if (subtree) treeChildren.push(subtree);
        }
      });

      // Add non-file children (functions, components) as leaf nodes
      const memberNodes = nonFileNodes.filter(n => n.filePath === fileNode.filePath);
      const importantMembers = memberNodes.filter(n =>
        n.type === 'function' || n.type === 'component' || n.type === 'class'
      ).slice(0, 6); // Limit to 6 for readability

      importantMembers.forEach(m => {
        treeChildren.push({ name: m.label, nodeData: m, children: [] });
      });

      return {
        name: fileNode.label,
        nodeData: fileNode,
        children: treeChildren,
      };
    }

    const treeData = buildTreeData(rootFile);

    // Add unvisited files as separate roots
    const unvisitedFiles = fileNodes.filter(f => !visited.has(f.id));
    let rootData;
    if (unvisitedFiles.length > 0) {
      const additionalTrees = unvisitedFiles.map(f => buildTreeData(f)).filter(Boolean);
      rootData = {
        name: 'Project',
        nodeData: null,
        children: [treeData, ...additionalTrees].filter(Boolean),
      };
    } else {
      rootData = treeData;
    }

    if (!rootData) { renderForceLayout(); return; }

    // Create d3 hierarchy
    const root = d3.hierarchy(rootData);
    const treeLayout = d3.tree()
      .nodeSize([90, 200])
      .separation((a, b) => (a.parent === b.parent ? 1.5 : 3));

    treeLayout(root);

    // Draw edges
    const edgeGroup = g.append('g').attr('class', 'edges');
    edgeElements = edgeGroup.selectAll('.tree-link')
      .data(root.links())
      .join('path')
      .attr('class', 'graph-edge tree-link')
      .attr('d', d => {
        return `M${d.source.x},${d.source.y}
                C${d.source.x},${(d.source.y + d.target.y) / 2}
                 ${d.target.x},${(d.source.y + d.target.y) / 2}
                 ${d.target.x},${d.target.y}`;
      })
      .style('stroke', d => {
        const nd = d.target.data.nodeData;
        if (!nd) return '#3a3a4a';
        return nd.type === 'file'
          ? CONFIG.edgeColors.imports
          : CONFIG.edgeColors.uses;
      })
      .style('fill', 'none')
      .style('stroke-width', 1.5)
      .style('opacity', 0.4);

    edgeLabelElements = edgeGroup.selectAll('.edge-label').data([]);

    // Draw nodes
    const nodeGroup = g.append('g').attr('class', 'nodes');
    const treeNodes = root.descendants().filter(d => d.data.nodeData);

    treeNodes.forEach(d => {
      if (d.data.nodeData) {
        d.data.nodeData.x = d.x;
        d.data.nodeData.y = d.y;
        d.data.nodeData.fx = d.x;
        d.data.nodeData.fy = d.y;
      }
    });

    nodeElements = nodeGroup.selectAll('.graph-node')
      .data(treeNodes.map(d => d.data.nodeData))
      .join('g')
      .attr('class', 'graph-node')
      .attr('transform', d => `translate(${d.x}, ${d.y})`)
      .style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', function (event, d) {
          d3.select(this).raise().classed('dragging', true);
        })
        .on('drag', function (event, d) {
          d.x = event.x;
          d.y = event.y;
          d3.select(this).attr('transform', `translate(${event.x}, ${event.y})`);
          // Update connected tree edges
          if (edgeElements) {
            edgeElements.attr('d', ed => {
              const srcData = ed.source.data?.nodeData;
              const tgtData = ed.target.data?.nodeData;
              if (!srcData || !tgtData) return '';
              return `M${srcData.x},${srcData.y} C${srcData.x},${(srcData.y + tgtData.y) / 2} ${tgtData.x},${(srcData.y + tgtData.y) / 2} ${tgtData.x},${tgtData.y}`;
            });
          }
        })
        .on('end', function (event, d) {
          d3.select(this).classed('dragging', false);
        })
      )
      .on('click', (event, d) => {
        event.stopPropagation();
        selectNode(d);
      })
      .on('mouseenter', (event, d) => showTooltip(event, d))
      .on('mousemove', (event) => moveTooltip(event))
      .on('mouseleave', () => hideTooltip());

    // Node shapes
    nodeElements.each(function (d) {
      const el = d3.select(this);
      const colors = CONFIG.nodeColors[d.type] || CONFIG.nodeColors.variable;

      if (d.type === 'file') {
        el.append('rect')
          .attr('class', 'node-shape')
          .attr('x', -50).attr('y', -16)
          .attr('width', 100).attr('height', 32)
          .attr('rx', 8)
          .attr('fill', colors.fill + '20')
          .attr('stroke', colors.fill)
          .attr('stroke-width', 2);
      } else if (d.type === 'component') {
        const s = 14;
        el.append('polygon')
          .attr('class', 'node-shape')
          .attr('points', `0,${-s} ${s},0 0,${s} ${-s},0`)
          .attr('fill', colors.fill + '25')
          .attr('stroke', colors.fill)
          .attr('stroke-width', 1.5);
      } else {
        el.append('circle')
          .attr('class', 'node-shape')
          .attr('r', 12)
          .attr('fill', colors.fill + '25')
          .attr('stroke', colors.fill)
          .attr('stroke-width', 1.5);
      }
    });

    // Labels
    nodeElements.append('text')
      .attr('class', 'node-icon')
      .attr('dy', d => d.type === 'file' ? '0.35em' : '0.35em')
      .style('font-size', d => d.type === 'file' ? '11px' : '9px')
      .text(d => (CONFIG.nodeColors[d.type] || CONFIG.nodeColors.variable).icon);

    nodeElements.append('text')
      .attr('class', 'node-label')
      .attr('dy', d => d.type === 'file' ? 28 : 22)
      .style('font-size', d => d.type === 'file' ? '11px' : '9px')
      .style('font-weight', d => d.type === 'file' ? '600' : '400')
      .text(d => truncateLabel(d.label, d.type === 'file' ? 24 : 16));

    // Animation
    nodeElements.style('opacity', 0)
      .transition().delay((d, i) => i * 25).duration(400)
      .style('opacity', 1);

    svg.on('click', () => { resetHighlights(); closeDetailPanel(); });
  }

  // ============================================
  // FORCE LAYOUT — Physics-based with file grouping
  // ============================================
  function renderForceLayout() {
    const width = document.getElementById('graphWrapper').clientWidth;
    const height = document.getElementById('graphWrapper').clientHeight;

    // Prepare edge data
    const edgeData = state.edges.map(e => ({
      ...e, source: e.from, target: e.to,
    })).filter(e =>
      state.nodes.find(n => n.id === e.source) &&
      state.nodes.find(n => n.id === e.target)
    );

    // Unfix nodes from other layouts
    state.nodes.forEach(n => { n.fx = null; n.fy = null; });

    // Create simulation with file-grouping force
    simulation = d3.forceSimulation(state.nodes)
      .force('link', d3.forceLink(edgeData).id(d => d.id).distance(CONFIG.simulation.linkDistance))
      .force('charge', d3.forceManyBody().strength(CONFIG.simulation.chargeStrength))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(CONFIG.simulation.centerStrength))
      .force('collision', d3.forceCollide().radius(d => getNodeRadius(d) + 15))
      .force('x', d3.forceX(width / 2).strength(0.03))
      .force('y', d3.forceY(height / 2).strength(0.03));

    // Draw edges as curved paths
    const edgeGroup = g.append('g').attr('class', 'edges');
    edgeElements = edgeGroup.selectAll('.graph-edge')
      .data(edgeData)
      .join('path')
      .attr('class', d => `graph-edge edge-${d.type || 'uses'}`)
      .attr('marker-end', d => `url(#arrow-${d.type || 'default'})`)
      .style('stroke', d => CONFIG.edgeColors[d.type] || '#3a3a4a')
      .style('fill', 'none');

    edgeLabelElements = edgeGroup.selectAll('.edge-label')
      .data(edgeData)
      .join('text')
      .attr('class', 'edge-label')
      .text(d => d.label || d.type || '');

    // Draw nodes
    const nodeGroup = g.append('g').attr('class', 'nodes');
    nodeElements = nodeGroup.selectAll('.graph-node')
      .data(state.nodes)
      .join('g')
      .attr('class', 'graph-node')
      .call(d3.drag()
        .on('start', dragStarted)
        .on('drag', dragged)
        .on('end', dragEnded)
      )
      .on('click', (event, d) => { event.stopPropagation(); selectNode(d); })
      .on('mouseenter', (event, d) => showTooltip(event, d))
      .on('mousemove', (event) => moveTooltip(event))
      .on('mouseleave', () => hideTooltip());

    // Node shapes
    nodeElements.each(function (d) {
      const el = d3.select(this);
      const radius = getNodeRadius(d);
      const colors = CONFIG.nodeColors[d.type] || CONFIG.nodeColors.variable;

      if (d.type === 'file' || d.type === 'class') {
        el.append('rect')
          .attr('class', 'node-shape')
          .attr('x', -radius).attr('y', -radius * 0.75)
          .attr('width', radius * 2).attr('height', radius * 1.5)
          .attr('rx', 6).attr('ry', 6)
          .attr('fill', colors.fill + '20')
          .attr('stroke', colors.fill)
          .style('--node-glow', colors.fill + '80');
      } else if (d.type === 'component') {
        const s = radius;
        el.append('polygon')
          .attr('class', 'node-shape')
          .attr('points', `0,${-s} ${s},0 0,${s} ${-s},0`)
          .attr('fill', colors.fill + '20')
          .attr('stroke', colors.fill)
          .style('--node-glow', colors.fill + '80');
      } else if (d.type === 'event' || d.type === 'hook') {
        const s = radius;
        const points = [];
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          points.push(`${s * Math.cos(angle)},${s * Math.sin(angle)}`);
        }
        el.append('polygon')
          .attr('class', 'node-shape')
          .attr('points', points.join(' '))
          .attr('fill', colors.fill + '20')
          .attr('stroke', colors.fill)
          .style('--node-glow', colors.fill + '80');
      } else {
        el.append('circle')
          .attr('class', 'node-shape')
          .attr('r', radius)
          .attr('fill', colors.fill + '20')
          .attr('stroke', colors.fill)
          .style('--node-glow', colors.fill + '80');
      }
    });

    nodeElements.append('text')
      .attr('class', 'node-icon')
      .attr('dy', '0.35em')
      .text(d => (CONFIG.nodeColors[d.type] || CONFIG.nodeColors.variable).icon);

    nodeElements.append('text')
      .attr('class', 'node-label')
      .attr('dy', d => getNodeRadius(d) + 16)
      .text(d => truncateLabel(d.label, 20));

    // Animation
    nodeElements.style('opacity', 0)
      .transition().delay((d, i) => i * 30).duration(400)
      .style('opacity', 1);

    edgeElements.style('opacity', 0)
      .transition().delay(200).duration(600)
      .style('opacity', 0.5);

    // Simulation tick
    simulation.on('tick', () => {
      edgeElements.attr('d', d => `M${d.source.x},${d.source.y} L${d.target.x},${d.target.y}`);

      edgeLabelElements
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2);

      nodeElements.attr('transform', d => `translate(${d.x}, ${d.y})`);
    });

    svg.on('click', () => { resetHighlights(); closeDetailPanel(); });
    simulation.on('end', () => setTimeout(fitToView, 100));
    setTimeout(fitToView, 1500);
    setTimeout(() => updateMinimap(), 2000);
  }

  // ============================================
  // NODE UTILITIES
  // ============================================
  function getNodeRadius(d) {
    return CONFIG.nodeRadius[d.type] || 14;
  }

  function truncateLabel(label, maxLen) {
    if (label.length <= maxLen) return label;
    return label.slice(0, maxLen - 2) + '…';
  }

  // ============================================
  // DRAG BEHAVIOR
  // ============================================
  function dragStarted(event, d) {
    if (!event.active && simulation && state.layout === 'force') {
      simulation.alphaTarget(0.01).restart();
    }
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
    d.x = event.x;
    d.y = event.y;

    if (state.layout === 'force') {
      d3.select(this).attr('transform', `translate(${d.x}, ${d.y})`);
      if (edgeElements) {
        edgeElements.attr('d', el => `M${el.source.x},${el.source.y} L${el.target.x},${el.target.y}`);
      }
      if (edgeLabelElements) {
        edgeLabelElements
          .attr('x', el => (el.source.x + el.target.x) / 2)
          .attr('y', el => (el.source.y + el.target.y) / 2);
      }
    }
  }

  function dragEnded(event, d) {
    if (!event.active && simulation && state.layout === 'force') {
      simulation.alphaTarget(0);
    }
    // We leave d.fx and d.fy set so the node stays pinned where the user dropped it
  }

  // ============================================
  // NODE SELECTION & HIGHLIGHTING
  // ============================================
  function selectNode(node) {
    state.selectedNode = node;

    // Find connected edges
    const connectedEdgeData = state.edges.filter(e =>
      e.from === node.id || e.to === node.id
    );

    // Find connected node IDs
    const connectedIds = new Set([node.id]);
    connectedEdgeData.forEach(e => {
      connectedIds.add(e.from);
      connectedIds.add(e.to);
    });

    // Highlight nodes
    nodeElements
      .classed('selected', d => d.id === node.id)
      .classed('dimmed', d => !connectedIds.has(d.id));

    // Highlight edges
    edgeElements
      .classed('highlighted', d => {
        const srcId = d.source.id || d.source;
        const tgtId = d.target.id || d.target;
        return srcId === node.id || tgtId === node.id;
      })
      .classed('dimmed', d => {
        const srcId = d.source.id || d.source;
        const tgtId = d.target.id || d.target;
        return srcId !== node.id && tgtId !== node.id;
      });

    // Show edge labels for connected edges
    edgeLabelElements
      .classed('visible', d => {
        const srcId = d.source.id || d.source;
        const tgtId = d.target.id || d.target;
        return srcId === node.id || tgtId === node.id;
      });

    // Show detail panel
    showDetailPanel(node, connectedEdgeData);
  }

  function resetViewAndHighlights() {
    // Unfix nodes and reset simulation/layout completely
    state.nodes.forEach(n => { n.fx = null; n.fy = null; });
    resetHighlights();
    renderGraph();
    setTimeout(fitToView, 100);
  }

  function resetHighlights() {
    state.selectedNode = null;

    if (nodeElements) {
      nodeElements.classed('selected', false).classed('dimmed', false);
    }
    if (edgeElements) {
      edgeElements.classed('highlighted', false).classed('dimmed', false);
    }
    if (edgeLabelElements) {
      edgeLabelElements.classed('visible', false);
    }
  }

  // ============================================
  // DETAIL PANEL (TABBED)
  // ============================================
  let currentDetailNode = null;
  let currentDetailEdges = [];

  function showDetailPanel(node, connectedEdges) {
    currentDetailNode = node;
    currentDetailEdges = connectedEdges;

    const panel = document.getElementById('detailPanel');
    const title = document.getElementById('detailTitle');

    title.textContent = node.label;
    panel.classList.remove('hidden');

    // Setup tab click handlers
    setupDetailTabs();

    // Build all three tabs
    buildInfoTab(node, connectedEdges);
    buildCodeTab(node);
    buildUsageTab(node, connectedEdges);

    // Activate the "Info" tab by default
    switchDetailTab('info');
  }

  function setupDetailTabs() {
    const tabs = document.querySelectorAll('.detail-tab');
    tabs.forEach(tab => {
      // Remove old listeners by cloning
      const newTab = tab.cloneNode(true);
      tab.parentNode.replaceChild(newTab, tab);
      newTab.addEventListener('click', () => {
        switchDetailTab(newTab.dataset.detailTab);
      });
    });
  }

  function switchDetailTab(tabName) {
    document.querySelectorAll('.detail-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.detailTab === tabName);
    });
    document.getElementById('detailTabInfo').classList.toggle('active', tabName === 'info');
    document.getElementById('detailTabCode').classList.toggle('active', tabName === 'code');
    document.getElementById('detailTabUsage').classList.toggle('active', tabName === 'usage');
  }

  // --- INFO TAB ---
  function buildInfoTab(node, connectedEdges) {
    const body = document.getElementById('detailBody');
    const colors = CONFIG.nodeColors[node.type] || CONFIG.nodeColors.variable;

    let html = '';

    // Type badge
    html += `<div class="detail-field">
      <div class="detail-label">Type</div>
      <div class="detail-badge" style="background:${colors.fill}20;color:${colors.fill}">
        ${colors.icon} ${node.type}
      </div>
    </div>`;

    // Purpose description (auto-generated)
    if (node.metadata && node.metadata.purpose) {
      html += `<div class="detail-purpose">
        <div class="purpose-icon">💡</div>
        <div class="purpose-text">${escapeHtml(node.metadata.purpose)}</div>
      </div>`;
    }

    // Tags
    if (node.metadata && node.metadata.tags && node.metadata.tags.length > 0) {
      html += `<div class="detail-tags">`;
      node.metadata.tags.forEach(tag => {
        const tagColor = getTagColor(tag);
        html += `<span class="detail-tag" style="background:${tagColor}18;color:${tagColor};border:1px solid ${tagColor}30">${tag}</span>`;
      });
      html += `</div>`;
    }

    // File path
    if (node.filePath) {
      html += `<div class="detail-field">
        <div class="detail-label">File Path</div>
        <div class="detail-value mono">${escapeHtml(node.filePath)}</div>
      </div>`;
    }

    // ID
    html += `<div class="detail-field">
      <div class="detail-label">ID</div>
      <div class="detail-value mono" style="font-size:10px;color:var(--text-muted)">${escapeHtml(node.id)}</div>
    </div>`;

    // Metadata
    if (node.metadata) {
      const meta = node.metadata;
      if (meta.line) {
        html += `<div class="detail-field">
          <div class="detail-label">Line${meta.endLine ? 's' : ''}</div>
          <div class="detail-value">${meta.line}${meta.endLine ? ' → ' + meta.endLine : ''}</div>
        </div>`;
      }
      if (meta.params && meta.params.length) {
        html += `<div class="detail-field">
          <div class="detail-label">Parameters</div>
          <div class="detail-value mono">(${meta.params.join(', ')})</div>
        </div>`;
      }
      if (meta.async) {
        html += `<div class="detail-field">
          <div class="detail-label">Async</div>
          <div class="detail-value">✅ Yes</div>
        </div>`;
      }
      if (meta.specifiers && meta.specifiers.length) {
        html += `<div class="detail-field">
          <div class="detail-label">Specifiers</div>
          <div class="detail-value mono">${meta.specifiers.join(', ')}</div>
        </div>`;
      }
      if (meta.url) {
        html += `<div class="detail-field">
          <div class="detail-label">URL</div>
          <div class="detail-value mono">${escapeHtml(meta.url)}</div>
        </div>`;
      }
      if (meta.lines && node.type === 'file') {
        html += `<div class="detail-field">
          <div class="detail-label">Total Lines</div>
          <div class="detail-value">${meta.lines}</div>
        </div>`;
      }
      if (meta.size && node.type === 'file') {
        html += `<div class="detail-field">
          <div class="detail-label">Size</div>
          <div class="detail-value">${(meta.size / 1024).toFixed(1)} KB</div>
        </div>`;
      }
    }

    // Connections — split into outgoing & incoming
    if (connectedEdges.length > 0) {
      const outgoing = connectedEdges.filter(e => e.from === node.id);
      const incoming = connectedEdges.filter(e => e.to === node.id);

      html += `<div class="detail-connections">
        <h4>Connections (${connectedEdges.length})</h4>`;

      if (outgoing.length > 0) {
        html += `<div class="connections-group">
          <div class="connections-group-label">Outgoing → (${outgoing.length})</div>`;
        outgoing.forEach(edge => {
          html += renderConnectionItem(node, edge);
        });
        html += '</div>';
      }

      if (incoming.length > 0) {
        html += `<div class="connections-group">
          <div class="connections-group-label">← Incoming (${incoming.length})</div>`;
        incoming.forEach(edge => {
          html += renderConnectionItem(node, edge);
        });
        html += '</div>';
      }

      html += '</div>';
    }

    body.innerHTML = html;

    // Click on connection items to navigate
    body.querySelectorAll('.connection-item').forEach(item => {
      item.addEventListener('click', () => {
        const targetId = item.dataset.nodeId;
        const targetNode = state.nodes.find(n => n.id === targetId);
        if (targetNode) selectNode(targetNode);
      });
    });
  }

  function renderConnectionItem(node, edge) {
    const isOutgoing = edge.from === node.id;
    const otherId = isOutgoing ? edge.to : edge.from;
    const otherNode = state.nodes.find(n => n.id === otherId);
    const otherLabel = otherNode ? otherNode.label : otherId;
    const otherColors = otherNode ? (CONFIG.nodeColors[otherNode.type] || CONFIG.nodeColors.variable) : CONFIG.nodeColors.variable;

    return `<div class="connection-item" data-node-id="${otherId}">
      <span class="legend-dot" style="background:${otherColors.fill};width:8px;height:8px"></span>
      <span class="connection-arrow">${isOutgoing ? '→' : '←'}</span>
      <span>${escapeHtml(truncateLabel(otherLabel, 25))}</span>
      <span style="color:var(--text-muted);font-size:10px;margin-left:auto">${edge.type}</span>
    </div>`;
  }

  // --- CODE TAB ---
  function buildCodeTab(node) {
    const container = document.getElementById('detailCodeContent');
    const meta = node.metadata || {};

    // Get source code from metadata
    let sourceCode = meta.sourceCode || null;
    let startLine = meta.line || 1;
    let fileName = node.filePath || node.label;

    if (!sourceCode) {
      container.innerHTML = `<div class="code-no-code">
        <p>📄 No source code available for this node type.</p>
        <p style="margin-top:8px;font-size:11px;color:var(--text-muted)">
          Code preview is available for: files, functions, components, classes, imports, and exports.
        </p>
      </div>`;
      return;
    }

    // Apply syntax highlighting
    const highlighted = highlightSyntax(sourceCode);
    const lines = sourceCode.split('\n');

    let lineNumbersHtml = '';
    let codeHtml = highlighted;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = startLine + i;
      lineNumbersHtml += `<span class="line-num">${lineNum}</span>`;
    }

    const endLine = meta.endLine || (startLine + lines.length - 1);
    const lineInfo = node.type === 'file' ? `${lines.length} lines` : `L${startLine}–${endLine}`;

    container.innerHTML = `
      <div class="code-preview">
        <div class="code-preview-header">
          <span class="file-name">📄 ${escapeHtml(fileName)}</span>
          <span class="line-range">${lineInfo}</span>
        </div>
        <div class="code-preview-body">
          <div class="code-line-numbers">${lineNumbersHtml}</div>
          <pre class="code-content">${codeHtml}</pre>
        </div>
      </div>`;
  }

  // Basic JS/JSX syntax highlighting
  function highlightSyntax(code) {
    // Escape HTML first
    let escaped = escapeHtml(code);

    // Comments (single-line and multi-line)
    escaped = escaped.replace(/(\/\/[^\n]*)/g, '<span class="code-comment">$1</span>');
    escaped = escaped.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="code-comment">$1</span>');

    // Strings (single, double, template)
    escaped = escaped.replace(/(&#39;[^&#]*?(?:&#39;|$))/g, '<span class="code-string">$1</span>');
    escaped = escaped.replace(/(&#x27;[^&#]*?(?:&#x27;|$))/g, '<span class="code-string">$1</span>');
    escaped = escaped.replace(/(&quot;[^&]*?(?:&quot;|$))/g, '<span class="code-string">$1</span>');
    escaped = escaped.replace(/(`[^`]*?`)/g, '<span class="code-string">$1</span>');

    // Keywords
    const keywords = ['import', 'export', 'from', 'default', 'function', 'const', 'let', 'var',
      'return', 'if', 'else', 'for', 'while', 'class', 'extends', 'new', 'this',
      'async', 'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof',
      'switch', 'case', 'break', 'continue', 'of', 'in', 'void', 'delete', 'yield'];
    keywords.forEach(kw => {
      const regex = new RegExp(`\\b(${kw})\\b`, 'g');
      escaped = escaped.replace(regex, '<span class="code-keyword">$1</span>');
    });

    // Numbers
    escaped = escaped.replace(/\b(\d+\.?\d*)\b/g, '<span class="code-number">$1</span>');

    // JSX tags like <Component or </div>
    escaped = escaped.replace(/(&lt;\/?)([\w.]+)/g, '$1<span class="code-tag">$2</span>');

    return escaped;
  }

  // --- USAGE TAB ---
  function buildUsageTab(node, connectedEdges) {
    const container = document.getElementById('detailUsageContent');
    const meta = node.metadata || {};

    let html = '';

    // Purpose summary at top of Usage tab
    if (meta.purpose) {
      html += `<div class="usage-purpose-summary">
        <div class="usage-purpose-title">💡 What this does</div>
        <div class="usage-purpose-text">${escapeHtml(meta.purpose)}</div>
      </div>`;
    }

    // Tags display
    if (meta.tags && meta.tags.length > 0) {
      html += `<div class="usage-tags-row">`;
      meta.tags.forEach(tag => {
        const tagColor = getTagColor(tag);
        html += `<span class="detail-tag" style="background:${tagColor}18;color:${tagColor};border:1px solid ${tagColor}30">${tag}</span>`;
      });
      html += `</div>`;
    }

    // "Called From" section — where this function/component is used
    if (meta.calledFrom && meta.calledFrom.length > 0) {
      html += `<div class="usage-section">
        <div class="usage-header">📌 Called From (${meta.calledFrom.length})</div>`;

      meta.calledFrom.forEach(site => {
        // Find the file node to get its purpose
        const fileNode = state.nodes.find(n => n.type === 'file' && n.label === site.file);
        const filePurpose = fileNode?.metadata?.purpose || '';

        html += `<div class="usage-item" data-file="${escapeHtml(site.file)}">
          <div>
            <div class="usage-file">${escapeHtml(site.file)}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
              <span class="usage-line">Line ${site.line}</span>
            </div>
            ${site.context ? `<div class="usage-context">${escapeHtml(site.context)}</div>` : ''}
            ${filePurpose ? `<div class="usage-file-purpose">↳ ${escapeHtml(filePurpose.split('.')[0])}</div>` : ''}
          </div>
        </div>`;
      });

      html += '</div>';
    }

    // "Imported By" — which files import this
    const importedByEdges = state.edges.filter(e => {
      if (e.type !== 'imports') return false;
      const targetNode = state.nodes.find(n => n.id === e.to);
      return targetNode && (targetNode.id === node.id ||
        (node.type === 'file' && targetNode.label === node.label));
    });

    if (importedByEdges.length > 0) {
      html += `<div class="usage-section">
        <div class="usage-header">📦 Imported By (${importedByEdges.length})</div>`;

      importedByEdges.forEach(edge => {
        const importerNode = state.nodes.find(n => n.id === edge.from);
        if (importerNode) {
          const importerPurpose = importerNode?.metadata?.purpose || '';
          html += `<div class="usage-item" data-node-id="${importerNode.id}">
            <div>
              <div class="usage-file">${escapeHtml(importerNode.label)}</div>
              <div style="color:var(--text-muted);font-size:11px;margin-top:2px;">${escapeHtml(edge.label || edge.type)}</div>
              ${importerPurpose ? `<div class="usage-file-purpose">↳ ${escapeHtml(importerPurpose.split('.')[0])}</div>` : ''}
            </div>
          </div>`;
        }
      });

      html += '</div>';
    }

    // "Renders / Uses" — which components render this
    const usedByEdges = state.edges.filter(e =>
      e.to === node.id && (e.type === 'uses' || e.type === 'calls' || e.type === 'renders')
    );

    if (usedByEdges.length > 0) {
      html += `<div class="usage-section">
        <div class="usage-header">🔗 Used By (${usedByEdges.length})</div>`;

      usedByEdges.forEach(edge => {
        const userNode = state.nodes.find(n => n.id === edge.from);
        if (userNode) {
          const userPurpose = userNode?.metadata?.purpose || '';
          html += `<div class="usage-item" data-node-id="${userNode.id}">
            <div>
              <div class="usage-file">${escapeHtml(userNode.label)}</div>
              <div style="color:var(--text-muted);font-size:11px;margin-top:2px;">${edge.type}: ${escapeHtml(edge.label || '')}</div>
              ${userPurpose ? `<div class="usage-file-purpose">↳ ${escapeHtml(userPurpose.split('.')[0])}</div>` : ''}
            </div>
          </div>`;
        }
      });

      html += '</div>';
    }

    // "Exports To" — what this node exports
    const exportsEdges = state.edges.filter(e =>
      e.from === node.id && e.type === 'exports'
    );
    if (exportsEdges.length > 0) {
      html += `<div class="usage-section">
        <div class="usage-header">📤 Exports (${exportsEdges.length})</div>`;
      exportsEdges.forEach(edge => {
        const exportNode = state.nodes.find(n => n.id === edge.to);
        if (exportNode) {
          const exportPurpose = exportNode?.metadata?.purpose || '';
          html += `<div class="usage-item" data-node-id="${exportNode.id}">
            <div>
              <div class="usage-file">${escapeHtml(exportNode.label)}</div>
              ${exportPurpose ? `<div class="usage-file-purpose">↳ ${escapeHtml(exportPurpose.split('.')[0])}</div>` : ''}
            </div>
          </div>`;
        }
      });
      html += '</div>';
    }

    if (!html) {
      html = `<div class="usage-empty">
        <p>No usage data for this node.</p>
        <p style="margin-top:8px;font-size:11px;color:var(--text-muted)">
          Usage tracking shows where functions are called and where imports are used across files.
        </p>
      </div>`;
    }

    container.innerHTML = html;

    // Click on usage items to navigate
    container.querySelectorAll('.usage-item[data-node-id]').forEach(item => {
      item.addEventListener('click', () => {
        const targetId = item.dataset.nodeId;
        const targetNode = state.nodes.find(n => n.id === targetId);
        if (targetNode) selectNode(targetNode);
      });
    });
  }

  // Get color for a tag
  function getTagColor(tag) {
    const tagColors = {
      'event-handler': '#f59e0b',
      'async': '#8b5cf6',
      'api': '#06b6d4',
      'state-mutation': '#10b981',
      'error-handling': '#ef4444',
      'returns-value': '#6366f1',
      'array-ops': '#3b82f6',
      'timer': '#f97316',
      'storage': '#64748b',
      'component': '#f59e0b',
      'stateful': '#10b981',
      'side-effects': '#8b5cf6',
      'context-consumer': '#ec4899',
      'context-provider': '#ec4899',
      'renders-list': '#3b82f6',
      'form': '#f59e0b',
    };
    return tagColors[tag] || '#64748b';
  }

  function closeDetailPanel() {
    document.getElementById('detailPanel').classList.add('hidden');
    currentDetailNode = null;
    currentDetailEdges = [];
  }

  // ============================================
  // TOOLTIP
  // ============================================
  function setupTooltip() {
    tooltip = document.createElement('div');
    tooltip.className = 'graph-tooltip';
    document.body.appendChild(tooltip);
  }

  function showTooltip(event, d) {
    const colors = CONFIG.nodeColors[d.type] || CONFIG.nodeColors.variable;
    tooltip.innerHTML = `
      <div class="tooltip-type" style="color:${colors.fill}">${colors.icon} ${d.type}</div>
      <div class="tooltip-label">${escapeHtml(d.label)}</div>
      ${d.filePath ? `<div class="tooltip-path">${escapeHtml(d.filePath)}</div>` : ''}
    `;
    tooltip.classList.add('visible');
    moveTooltip(event);
  }

  function moveTooltip(event) {
    tooltip.style.left = (event.pageX + 14) + 'px';
    tooltip.style.top = (event.pageY - 10) + 'px';
  }

  function hideTooltip() {
    tooltip.classList.remove('visible');
  }

  // ============================================
  // ZOOM & LAYOUT CONTROLS
  // ============================================
  function zoomBy(factor) {
    svg.transition().duration(300).call(zoom.scaleBy, factor);
  }

  function fitToView() {
    if (state.nodes.length === 0) return;

    const width = document.getElementById('graphWrapper').clientWidth;
    const height = document.getElementById('graphWrapper').clientHeight;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    state.nodes.forEach(d => {
      if (d.x !== undefined && d.y !== undefined) {
        minX = Math.min(minX, d.x);
        maxX = Math.max(maxX, d.x);
        minY = Math.min(minY, d.y);
        maxY = Math.max(maxY, d.y);
      }
    });

    if (!isFinite(minX)) return;

    const padding = 80;
    const graphWidth = maxX - minX + padding * 2;
    const graphHeight = maxY - minY + padding * 2;
    const scale = Math.min(width / graphWidth, height / graphHeight, 2);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    svg.transition().duration(600).call(
      zoom.transform,
      d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(scale)
        .translate(-centerX, -centerY)
    );
  }

  function setLayout(mode) {
    state.layout = mode;

    // Update button states
    document.getElementById('btnLayoutClustered').classList.toggle('active', mode === 'clustered');
    document.getElementById('btnLayoutForce').classList.toggle('active', mode === 'force');

    // Stop existing simulation if any
    if (simulation) {
      simulation.stop();
      simulation = null;
    }

    // Re-render graph with new layout
    if (state.nodes.length > 0) {
      renderGraph();
    }
  }

  // ============================================
  // MINIMAP
  // ============================================
  function updateMinimap() {
    const canvas = document.getElementById('minimapCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cw = canvas.width;
    const ch = canvas.height;

    ctx.clearRect(0, 0, cw, ch);

    if (state.nodes.length === 0) return;

    // Find bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    state.nodes.forEach(d => {
      if (d.x !== undefined && d.y !== undefined) {
        minX = Math.min(minX, d.x);
        maxX = Math.max(maxX, d.x);
        minY = Math.min(minY, d.y);
        maxY = Math.max(maxY, d.y);
      }
    });

    if (!isFinite(minX)) return;

    const padding = 30;
    const graphW = maxX - minX + padding * 2;
    const graphH = maxY - minY + padding * 2;
    const scale = Math.min(cw / graphW, ch / graphH);

    // Draw edges
    ctx.strokeStyle = state.theme === 'dark' ? 'rgba(100,100,150,0.3)' : 'rgba(100,100,150,0.2)';
    ctx.lineWidth = 0.5;
    state.edges.forEach(e => {
      const src = state.nodes.find(n => n.id === (e.from || e.source?.id || e.source));
      const tgt = state.nodes.find(n => n.id === (e.to || e.target?.id || e.target));
      if (src && tgt && src.x !== undefined && tgt.x !== undefined) {
        ctx.beginPath();
        ctx.moveTo((src.x - minX + padding) * scale, (src.y - minY + padding) * scale);
        ctx.lineTo((tgt.x - minX + padding) * scale, (tgt.y - minY + padding) * scale);
        ctx.stroke();
      }
    });

    // Draw nodes
    state.nodes.forEach(d => {
      if (d.x === undefined) return;
      const colors = CONFIG.nodeColors[d.type] || CONFIG.nodeColors.variable;
      ctx.fillStyle = colors.fill;
      ctx.beginPath();
      ctx.arc(
        (d.x - minX + padding) * scale,
        (d.y - minY + padding) * scale,
        2.5,
        0,
        Math.PI * 2
      );
      ctx.fill();
    });
  }

  // ============================================
  // UI STATE HELPERS
  // ============================================
  function showLoading(show) {
    document.getElementById('loadingOverlay').classList.toggle('hidden', !show);
  }

  function showError(message) {
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('errorState').classList.remove('hidden');
    document.getElementById('errorMessage').textContent = message;
  }

  function hideError() {
    document.getElementById('errorState').classList.add('hidden');
  }

  function toggleModal(modalId, show) {
    document.getElementById(modalId).classList.toggle('hidden', !show);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

})();

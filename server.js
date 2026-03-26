/**
 * Code Visualizer - Express Server
 * Serves the frontend and provides API endpoints for code parsing
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { parseProject, parseCodeString, NODE_TYPES, EDGE_TYPES } = require('./src/parser/codeParser');

const app = express();
const PORT = process.env.PORT || 3000;
let lastProjectPath = ''; // Track last parsed project for file content serving

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

/**
 * POST /api/parse-code
 * Parse raw code string and return graph data
 */
app.post('/api/parse-code', (req, res) => {
  try {
    const { code, fileName } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid "code" field. Please provide code as a string.',
        nodes: [],
        edges: [],
      });
    }

    const result = parseCodeString(code, fileName || 'input.js');

    res.json({
      nodes: result.nodes,
      edges: result.edges,
      errors: result.errors || [],
      metadata: {
        source: 'paste',
        fileName: fileName || 'input.js',
        parsedAt: new Date().toISOString(),
        nodeCount: result.nodes.length,
        edgeCount: result.edges.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: `Parse failed: ${error.message}`,
      nodes: [],
      edges: [],
    });
  }
});

/**
 * POST /api/parse-project
 * Parse a project directory and return graph data
 */
app.post('/api/parse-project', (req, res) => {
  try {
    const { projectPath } = req.body;

    if (!projectPath || typeof projectPath !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid "projectPath" field.',
        nodes: [],
        edges: [],
      });
    }

    // Resolve and validate path
    const resolvedPath = path.resolve(projectPath);

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({
        error: `Path not found: ${resolvedPath}`,
        nodes: [],
        edges: [],
      });
    }

    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({
        error: `Path is not a directory: ${resolvedPath}`,
        nodes: [],
        edges: [],
      });
    }

    const result = parseProject(resolvedPath);
    lastProjectPath = resolvedPath;

    res.json({
      nodes: result.nodes,
      edges: result.edges,
      errors: result.errors || [],
      metadata: result.metadata || {
        projectPath: resolvedPath,
        parsedAt: new Date().toISOString(),
        nodeCount: result.nodes.length,
        edgeCount: result.edges.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: `Project parse failed: ${error.message}`,
      nodes: [],
      edges: [],
    });
  }
});

/**
 * GET /api/schema
 * Return the shared data contract (node types, edge types)
 */
app.get('/api/schema', (req, res) => {
  res.json({
    nodeTypes: Object.values(NODE_TYPES),
    edgeTypes: Object.values(EDGE_TYPES),
    nodeFormat: {
      id: 'string (unique)',
      label: 'string (human readable)',
      type: `string (${Object.values(NODE_TYPES).join(', ')})`,
      filePath: 'string (source file)',
      metadata: 'object (optional extra details)',
    },
    edgeFormat: {
      from: 'string (source node id)',
      to: 'string (target node id)',
      type: `string (${Object.values(EDGE_TYPES).join(', ')})`,
      label: 'string (relationship name)',
      metadata: 'object (optional extra details)',
    },
  });
});

/**
 * GET /api/sample
 * Return sample graph data for testing the UI
 */
app.get('/api/sample', (req, res) => {
  const sampleCode = `
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Header from './components/Header';
import UserList from './components/UserList';
import './App.css';

function App() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      setLoading(true);
      const response = await axios.get('/api/users');
      setUsers(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleDelete(userId) {
    setUsers(users.filter(u => u.id !== userId));
    axios.delete(\`/api/users/\${userId}\`);
  }

  function handleRefresh() {
    fetchUsers();
  }

  return (
    <div className="App">
      <Header title="User Manager" onRefresh={handleRefresh} />
      {loading && <div className="spinner">Loading...</div>}
      {error && <div className="error">{error}</div>}
      {!loading && !error && (
        <UserList users={users} onDelete={handleDelete} />
      )}
    </div>
  );
}

export default App;
  `.trim();

  const result = parseCodeString(sampleCode, 'App.jsx');
  res.json({
    nodes: result.nodes,
    edges: result.edges,
    errors: result.errors || [],
    metadata: {
      source: 'sample',
      fileName: 'App.jsx',
      parsedAt: new Date().toISOString(),
      nodeCount: result.nodes.length,
      edgeCount: result.edges.length,
    },
  });
});

/**
 * POST /api/file-content
 * Return actual file content for code preview
 */
app.post('/api/file-content', (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: 'Missing filePath' });
    }

    // Try resolving against last project path
    let fullPath = filePath;
    if (lastProjectPath && !path.isAbsolute(filePath)) {
      fullPath = path.join(lastProjectPath, filePath);
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found', filePath: fullPath });
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    res.json({
      filePath: filePath,
      content: content,
      lines: content.split('\n').length,
    });
  } catch (error) {
    res.status(500).json({ error: `Failed to read file: ${error.message}` });
  }
});

/**
 * GET / - serve the main page
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║   🔍 Code Visualizer is running!         ║`);
  console.log(`  ║   🌐 Open: http://localhost:${PORT}            ║`);
  console.log(`  ╚══════════════════════════════════════════╝\n`);
});

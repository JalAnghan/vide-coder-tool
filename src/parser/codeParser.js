/**
 * Code Parser Module
 * Parses JavaScript/React code into structured graph data (nodes + edges)
 * following the shared data contract.
 */

const acorn = require('acorn');
const acornWalk = require('acorn-walk');
const acornJsx = require('acorn-jsx');
const path = require('path');
const fs = require('fs');

// Create JSX-capable parser
const JSXParser = acorn.Parser.extend(acornJsx());

// Node type constants
const NODE_TYPES = {
  FILE: 'file',
  FUNCTION: 'function',
  COMPONENT: 'component',
  EVENT: 'event',
  ROUTE: 'route',
  API_CALL: 'api-call',
  IMPORT: 'import',
  EXPORT: 'export',
  CLASS: 'class',
  VARIABLE: 'variable',
  HOOK: 'hook',
};

// Edge type constants
const EDGE_TYPES = {
  IMPORTS: 'imports',
  CALLS: 'calls',
  RENDERS: 'renders',
  TRIGGERS: 'triggers',
  ROUTES_TO: 'routes-to',
  USES: 'uses',
  EXPORTS: 'exports',
  EXTENDS: 'extends',
};

// Event-related patterns
const EVENT_PATTERNS = [
  'onClick', 'onChange', 'onSubmit', 'onInput', 'onBlur', 'onFocus',
  'onKeyDown', 'onKeyUp', 'onKeyPress', 'onMouseDown', 'onMouseUp',
  'onMouseEnter', 'onMouseLeave', 'onScroll', 'onResize', 'onLoad',
  'onError', 'onDrag', 'onDrop', 'onTouchStart', 'onTouchEnd',
  'addEventListener', 'removeEventListener', 'emit', 'on', 'once',
];

// API call patterns
const API_PATTERNS = [
  'fetch', 'axios', 'XMLHttpRequest', 'request',
  'get', 'post', 'put', 'delete', 'patch',
];

// React hook patterns
const HOOK_PATTERNS = [
  'useState', 'useEffect', 'useContext', 'useReducer',
  'useCallback', 'useMemo', 'useRef', 'useLayoutEffect',
  'useImperativeHandle', 'useDebugValue',
];

// Route patterns
const ROUTE_PATTERNS = [
  'Route', 'Router', 'Switch', 'Link', 'NavLink',
  'app.get', 'app.post', 'app.put', 'app.delete',
  'router.get', 'router.post', 'router.put', 'router.delete',
  'app.use', 'router.use',
];

/**
 * Generate a stable, unique ID for nodes
 */
function generateNodeId(filePath, name, type) {
  const cleanPath = filePath.replace(/[\\\/]/g, '_').replace(/\./g, '_');
  return `${cleanPath}__${type}__${name}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Extract source code lines from content
 */
function extractSourceLines(content, startLine, endLine) {
  const lines = content.split('\n');
  const s = Math.max(0, (startLine || 1) - 1);
  const e = Math.min(lines.length, endLine || lines.length);
  return lines.slice(s, e).join('\n');
}

/**
 * Parse a single JavaScript/JSX file and extract nodes and edges
 */
function parseFile(filePath, content) {
  const nodes = [];
  const edges = [];
  const errors = [];
  const contentLines = content.split('\n');

  const fileName = path.basename(filePath);
  const fileNodeId = generateNodeId(filePath, fileName, NODE_TYPES.FILE);

  // Add file node
  nodes.push({
    id: fileNodeId,
    label: fileName,
    type: NODE_TYPES.FILE,
    filePath: filePath,
    metadata: {
      size: content.length,
      lines: contentLines.length,
      sourceCode: content,
    },
  });

  let ast;
  try {
    // Try parsing as JSX first
    ast = JSXParser.parse(content, {
      sourceType: 'module',
      ecmaVersion: 'latest',
      locations: true,
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      allowHashBang: true,
    });
  } catch (e1) {
    try {
      // Fallback to standard parser
      ast = acorn.parse(content, {
        sourceType: 'module',
        ecmaVersion: 'latest',
        locations: true,
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        allowHashBang: true,
      });
    } catch (e2) {
      try {
        // Try as script
        ast = acorn.parse(content, {
          sourceType: 'script',
          ecmaVersion: 'latest',
          locations: true,
          allowReturnOutsideFunction: true,
          allowHashBang: true,
        });
      } catch (e3) {
        errors.push({
          file: filePath,
          message: `Failed to parse: ${e3.message}`,
          line: e3.loc ? e3.loc.line : null,
        });
        return { nodes, edges, errors };
      }
    }
  }

  const declaredFunctions = new Set();
  const calledFunctions = new Map(); // name -> [{ line, context }]
  const importedModules = new Map();
  const exportedItems = new Set();
  const components = new Set();
  const eventHandlers = new Set();
  const apiCalls = new Set();
  const hooks = new Set();
  const classes = new Set();
  const routes = new Set();

  // Walk the AST to find all entities
  try {
    // --- IMPORTS ---
    walkSafe(ast, 'ImportDeclaration', (node) => {
      const source = node.source.value;
      const specifiers = node.specifiers.map((s) => {
        if (s.type === 'ImportDefaultSpecifier') return s.local.name;
        if (s.type === 'ImportSpecifier') return s.imported.name;
        if (s.type === 'ImportNamespaceSpecifier') return `* as ${s.local.name}`;
        return s.local.name;
      });
      importedModules.set(source, specifiers);

      const importLine = node.loc?.start?.line;
      const importEndLine = node.loc?.end?.line;
      const importNodeId = generateNodeId(filePath, source, NODE_TYPES.IMPORT);
      nodes.push({
        id: importNodeId,
        label: source,
        type: NODE_TYPES.IMPORT,
        filePath: filePath,
        metadata: {
          specifiers,
          line: importLine,
          endLine: importEndLine,
          sourceCode: extractSourceLines(content, importLine, importEndLine),
        },
      });
      edges.push({
        from: fileNodeId,
        to: importNodeId,
        type: EDGE_TYPES.IMPORTS,
        label: `imports ${specifiers.join(', ')}`,
        metadata: { specifiers },
      });
    });

    // --- FUNCTION DECLARATIONS ---
    walkSafe(ast, 'FunctionDeclaration', (node) => {
      if (node.id) {
        const name = node.id.name;
        declaredFunctions.add(name);

        const isComponent = /^[A-Z]/.test(name) && hasJSXReturn(node);
        const nodeType = isComponent ? NODE_TYPES.COMPONENT : NODE_TYPES.FUNCTION;

        if (isComponent) components.add(name);

        const funcStartLine = node.loc?.start?.line;
        const funcEndLine = node.loc?.end?.line;
        const funcNodeId = generateNodeId(filePath, name, nodeType);
        nodes.push({
          id: funcNodeId,
          label: name,
          type: nodeType,
          filePath: filePath,
          metadata: {
            params: node.params.map(p => getParamName(p)),
            line: funcStartLine,
            endLine: funcEndLine,
            async: node.async || false,
            generator: node.generator || false,
            sourceCode: extractSourceLines(content, funcStartLine, funcEndLine),
          },
        });
        edges.push({
          from: fileNodeId,
          to: funcNodeId,
          type: EDGE_TYPES.USES,
          label: `declares ${name}`,
          metadata: {},
        });
      }
    });

    // --- ARROW FUNCTIONS & VARIABLE DECLARATIONS ---
    walkSafe(ast, 'VariableDeclaration', (node) => {
      node.declarations.forEach((decl) => {
        if (decl.id && decl.id.name && decl.init) {
          const name = decl.id.name;

          if (decl.init.type === 'ArrowFunctionExpression' || decl.init.type === 'FunctionExpression') {
            declaredFunctions.add(name);
            const isComponent = /^[A-Z]/.test(name) && hasJSXReturn(decl.init);
            const nodeType = isComponent ? NODE_TYPES.COMPONENT : NODE_TYPES.FUNCTION;

            if (isComponent) components.add(name);

            const arrowStartLine = node.loc?.start?.line;
            const arrowEndLine = node.loc?.end?.line;
            const funcNodeId = generateNodeId(filePath, name, nodeType);
            nodes.push({
              id: funcNodeId,
              label: name,
              type: nodeType,
              filePath: filePath,
              metadata: {
                params: decl.init.params.map(p => getParamName(p)),
                line: arrowStartLine,
                endLine: arrowEndLine,
                async: decl.init.async || false,
                arrow: decl.init.type === 'ArrowFunctionExpression',
                sourceCode: extractSourceLines(content, arrowStartLine, arrowEndLine),
              },
            });
            edges.push({
              from: fileNodeId,
              to: funcNodeId,
              type: EDGE_TYPES.USES,
              label: `declares ${name}`,
              metadata: {},
            });
          }
        }
      });
    });

    // --- CLASS DECLARATIONS ---
    walkSafe(ast, 'ClassDeclaration', (node) => {
      if (node.id) {
        const name = node.id.name;
        classes.add(name);

        const classStartLine = node.loc?.start?.line;
        const classEndLine = node.loc?.end?.line;
        const classNodeId = generateNodeId(filePath, name, NODE_TYPES.CLASS);
        nodes.push({
          id: classNodeId,
          label: name,
          type: NODE_TYPES.CLASS,
          filePath: filePath,
          metadata: {
            line: classStartLine,
            endLine: classEndLine,
            superClass: node.superClass ? getNodeName(node.superClass) : null,
            sourceCode: extractSourceLines(content, classStartLine, classEndLine),
          },
        });
        edges.push({
          from: fileNodeId,
          to: classNodeId,
          type: EDGE_TYPES.USES,
          label: `declares class ${name}`,
          metadata: {},
        });

        if (node.superClass) {
          const superName = getNodeName(node.superClass);
          if (superName) {
            const superNodeId = generateNodeId(filePath, superName, NODE_TYPES.CLASS);
            edges.push({
              from: classNodeId,
              to: superNodeId,
              type: EDGE_TYPES.EXTENDS,
              label: `extends ${superName}`,
              metadata: {},
            });
          }
        }

        // Extract methods from the class body
        if (node.body && node.body.body) {
          node.body.body.forEach((member) => {
            if (member.type === 'MethodDefinition' && member.key) {
              const methodName = member.key.name || member.key.value;
              if (methodName) {
                const methodNodeId = generateNodeId(filePath, `${name}.${methodName}`, NODE_TYPES.FUNCTION);
                nodes.push({
                  id: methodNodeId,
                  label: `${name}.${methodName}`,
                  type: NODE_TYPES.FUNCTION,
                  filePath: filePath,
                  metadata: {
                    line: member.loc?.start?.line,
                    endLine: member.loc?.end?.line,
                    kind: member.kind,
                    static: member.static || false,
                    sourceCode: extractSourceLines(content, member.loc?.start?.line, member.loc?.end?.line),
                  },
                });
                edges.push({
                  from: classNodeId,
                  to: methodNodeId,
                  type: EDGE_TYPES.USES,
                  label: `has method ${methodName}`,
                  metadata: {},
                });
              }
            }
          });
        }
      }
    });

    // --- EXPORTS ---
    walkSafe(ast, 'ExportNamedDeclaration', (node) => {
      if (node.declaration) {
        const names = extractDeclarationNames(node.declaration);
        names.forEach(name => {
          exportedItems.add(name);
          const exportNodeId = generateNodeId(filePath, name, NODE_TYPES.EXPORT);
          nodes.push({
            id: exportNodeId,
            label: `export: ${name}`,
            type: NODE_TYPES.EXPORT,
            filePath: filePath,
            metadata: {
              line: node.loc?.start?.line,
              endLine: node.loc?.end?.line,
              sourceCode: extractSourceLines(content, node.loc?.start?.line, node.loc?.end?.line),
            },
          });
          edges.push({
            from: fileNodeId,
            to: exportNodeId,
            type: EDGE_TYPES.EXPORTS,
            label: `exports ${name}`,
            metadata: {},
          });
        });
      }
      if (node.specifiers) {
        node.specifiers.forEach((spec) => {
          const name = spec.exported ? spec.exported.name : spec.local.name;
          exportedItems.add(name);
        });
      }
    });

    walkSafe(ast, 'ExportDefaultDeclaration', (node) => {
      let name = 'default';
      if (node.declaration) {
        if (node.declaration.id) name = node.declaration.id.name;
        else if (node.declaration.name) name = node.declaration.name;
      }
      exportedItems.add(name);
    });

    // --- CALL EXPRESSIONS (function calls, API calls, hooks, events) ---
    walkSafe(ast, 'CallExpression', (node) => {
      const callName = getCallName(node);
      if (!callName) return;

      // Check for React hooks
      if (HOOK_PATTERNS.some(h => callName === h || callName.startsWith('use'))) {
        hooks.add(callName);
        const hookNodeId = generateNodeId(filePath, callName, NODE_TYPES.HOOK);
        if (!nodes.find(n => n.id === hookNodeId)) {
          nodes.push({
            id: hookNodeId,
            label: callName,
            type: NODE_TYPES.HOOK,
            filePath: filePath,
            metadata: { line: node.loc?.start?.line },
          });
        }
      }

      // Check for API calls
      if (API_PATTERNS.some(p => callName.includes(p))) {
        const urlArg = node.arguments[0];
        const url = urlArg && urlArg.type === 'Literal' ? urlArg.value : callName;
        apiCalls.add(callName);
        const apiNodeId = generateNodeId(filePath, callName + '_' + (node.loc?.start?.line || ''), NODE_TYPES.API_CALL);
        nodes.push({
          id: apiNodeId,
          label: `${callName}(${typeof url === 'string' && url !== callName ? url : '...'})`,
          type: NODE_TYPES.API_CALL,
          filePath: filePath,
          metadata: {
            line: node.loc?.start?.line,
            url: typeof url === 'string' ? url : null,
          },
        });
      }

      // Check for event listeners
      if (EVENT_PATTERNS.some(e => callName.includes(e))) {
        eventHandlers.add(callName);
        const eventNodeId = generateNodeId(filePath, callName + '_' + (node.loc?.start?.line || ''), NODE_TYPES.EVENT);
        nodes.push({
          id: eventNodeId,
          label: callName,
          type: NODE_TYPES.EVENT,
          filePath: filePath,
          metadata: { line: node.loc?.start?.line },
        });
      }

      // Check for route definitions
      if (ROUTE_PATTERNS.some(r => callName.includes(r)) && callName.includes('.')) {
        const routeArg = node.arguments[0];
        const routePath = routeArg && routeArg.type === 'Literal' ? routeArg.value : null;
        if (routePath) {
          routes.add(routePath);
          const routeNodeId = generateNodeId(filePath, `${callName}_${routePath}`, NODE_TYPES.ROUTE);
          nodes.push({
            id: routeNodeId,
            label: `${callName} → ${routePath}`,
            type: NODE_TYPES.ROUTE,
            filePath: filePath,
            metadata: { line: node.loc?.start?.line, method: callName, path: routePath },
          });
        }
      }

      // Track general function calls with location
      const callLine = node.loc?.start?.line;
      if (!calledFunctions.has(callName)) {
        calledFunctions.set(callName, []);
      }
      calledFunctions.get(callName).push({
        line: callLine,
        context: contentLines[Math.max(0, (callLine || 1) - 1)]?.trim() || '',
      });
    });

    // --- Build call edges ---
    calledFunctions.forEach((callSites, callName) => {
      const baseName = callName.split('.').pop();
      const targetNode = nodes.find(n =>
        (n.type === NODE_TYPES.FUNCTION || n.type === NODE_TYPES.COMPONENT) &&
        (n.label === callName || n.label === baseName)
      );
      if (targetNode) {
        const existing = edges.find(e => e.to === targetNode.id && e.type === EDGE_TYPES.CALLS);
        if (!existing) {
          edges.push({
            from: fileNodeId,
            to: targetNode.id,
            type: EDGE_TYPES.CALLS,
            label: `calls ${callName}`,
            metadata: { callSites },
          });
        }
        // Also store call sites in the target node's metadata
        if (!targetNode.metadata.calledFrom) {
          targetNode.metadata.calledFrom = [];
        }
        callSites.forEach(site => {
          targetNode.metadata.calledFrom.push({
            file: filePath,
            line: site.line,
            context: site.context,
          });
        });
      }
    });

  } catch (walkError) {
    errors.push({
      file: filePath,
      message: `Walk error: ${walkError.message}`,
      line: null,
    });
  }

  return { nodes, edges, errors };
}

/**
 * Parse an entire project directory
 */
function parseProject(projectPath) {
  const allNodes = [];
  const allEdges = [];
  const allErrors = [];
  const seenNodeIds = new Set();

  const jsFiles = findJSFiles(projectPath);

  if (jsFiles.length === 0) {
    allErrors.push({
      file: projectPath,
      message: 'No JavaScript/JSX files found in the project directory.',
      line: null,
    });
    return { nodes: allNodes, edges: allEdges, errors: allErrors };
  }

  // Parse each file
  jsFiles.forEach((file) => {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const relativePath = path.relative(projectPath, file).replace(/\\/g, '/');
      const result = parseFile(relativePath, content);

      result.nodes.forEach(n => {
        if (!seenNodeIds.has(n.id)) {
          seenNodeIds.add(n.id);
          allNodes.push(n);
        }
      });
      allEdges.push(...result.edges);
      allErrors.push(...result.errors);
    } catch (fileError) {
      allErrors.push({
        file: file,
        message: `Could not read file: ${fileError.message}`,
        line: null,
      });
    }
  });

  // Build cross-file relationships (imports → file nodes)
  buildCrossFileEdges(allNodes, allEdges, projectPath);

  // Enrich all nodes with purpose descriptions and tags
  enrichNodesWithPurpose(allNodes, allEdges);

  return {
    nodes: allNodes,
    edges: allEdges,
    errors: allErrors,
    metadata: {
      projectPath,
      fileCount: jsFiles.length,
      nodeCount: allNodes.length,
      edgeCount: allEdges.length,
      parsedAt: new Date().toISOString(),
    },
  };
}

/**
 * Build cross-file edges based on import paths
 */
function buildCrossFileEdges(nodes, edges, projectPath) {
  const fileNodes = nodes.filter(n => n.type === NODE_TYPES.FILE);
  const importNodes = nodes.filter(n => n.type === NODE_TYPES.IMPORT);

  importNodes.forEach(importNode => {
    const importSource = importNode.label;
    if (importSource.startsWith('.')) {
      // Relative import - try to match to a file node
      const importingFile = importNode.filePath;
      const resolvedPath = resolveImportPath(importingFile, importSource);

      const targetFile = fileNodes.find(f => {
        const fPath = f.filePath.replace(/\\/g, '/');
        return (
          fPath === resolvedPath ||
          fPath === resolvedPath + '.js' ||
          fPath === resolvedPath + '.jsx' ||
          fPath === resolvedPath + '.ts' ||
          fPath === resolvedPath + '.tsx' ||
          fPath === resolvedPath + '/index.js' ||
          fPath === resolvedPath + '/index.jsx'
        );
      });

      if (targetFile) {
        edges.push({
          from: importNode.id,
          to: targetFile.id,
          type: EDGE_TYPES.IMPORTS,
          label: `resolves to ${targetFile.label}`,
          metadata: { resolved: true },
        });
      }
    }
  });
}

/**
 * Resolve a relative import path
 */
function resolveImportPath(fromFile, importSource) {
  const dir = path.dirname(fromFile).replace(/\\/g, '/');
  const resolved = path.posix.resolve('/' + dir, importSource).slice(1);
  return resolved;
}

/**
 * Find all JS/JSX/TS/TSX files in a directory recursively
 */
function findJSFiles(dirPath, maxDepth = 10) {
  const files = [];
  const extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
  const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__', '.cache'];

  function walk(currentPath, depth) {
    if (depth > maxDepth) return;
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          if (!ignoreDirs.includes(entry.name) && !entry.name.startsWith('.')) {
            walk(fullPath, depth + 1);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (e) {
      // Skip unreadable directories
    }
  }

  walk(dirPath, 0);
  return files;
}

// --- Utility helpers ---

function walkSafe(ast, nodeType, callback) {
  try {
    acornWalk.simple(ast, { [nodeType]: callback }, {
      ...acornWalk.base,
      JSXElement(node, st, c) {
        if (node.children) node.children.forEach(child => c(child, st));
        if (node.openingElement) {
          if (node.openingElement.attributes) {
            node.openingElement.attributes.forEach(attr => {
              if (attr.value && attr.value.type === 'JSXExpressionContainer') {
                c(attr.value.expression, st);
              }
            });
          }
        }
      },
      JSXFragment(node, st, c) {
        if (node.children) node.children.forEach(child => c(child, st));
      },
      JSXExpressionContainer(node, st, c) {
        if (node.expression) c(node.expression, st);
      },
      JSXText() {},
      JSXOpeningElement() {},
      JSXClosingElement() {},
      JSXOpeningFragment() {},
      JSXClosingFragment() {},
      JSXAttribute() {},
      JSXSpreadAttribute(node, st, c) {
        c(node.argument, st);
      },
      JSXEmptyExpression() {},
      JSXIdentifier() {},
      JSXMemberExpression() {},
      JSXNamespacedName() {},
    });
  } catch (e) {
    // Silently skip if walk fails for a node type
  }
}

function hasJSXReturn(node) {
  let hasJSX = false;
  try {
    const source = JSON.stringify(node);
    hasJSX = source.includes('JSXElement') || source.includes('JSXFragment');
  } catch (e) {
    // ignore
  }
  return hasJSX;
}

function getParamName(param) {
  if (param.type === 'Identifier') return param.name;
  if (param.type === 'AssignmentPattern' && param.left) return getParamName(param.left);
  if (param.type === 'RestElement' && param.argument) return `...${getParamName(param.argument)}`;
  if (param.type === 'ObjectPattern') return '{...}';
  if (param.type === 'ArrayPattern') return '[...]';
  return '?';
}

function getNodeName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') {
    const obj = getNodeName(node.object);
    const prop = getNodeName(node.property);
    return obj && prop ? `${obj}.${prop}` : (prop || obj);
  }
  if (node.type === 'Literal') return String(node.value);
  return null;
}

function getCallName(node) {
  if (node.callee) {
    return getNodeName(node.callee);
  }
  return null;
}

function extractDeclarationNames(decl) {
  if (!decl) return [];
  if (decl.id && decl.id.name) return [decl.id.name];
  if (decl.declarations) {
    return decl.declarations
      .filter(d => d.id && d.id.name)
      .map(d => d.id.name);
  }
  return [];
}

// ============================================
// PURPOSE & DESCRIPTION ANALYSIS ENGINE
// ============================================

/**
 * Analyze a node and generate a human-readable purpose description.
 * Uses naming conventions, code body patterns, parameters, and relationships.
 */
function generateNodePurpose(node, allNodes, allEdges) {
  const name = node.label || '';
  const type = node.type;
  const meta = node.metadata || {};
  const code = meta.sourceCode || '';
  const codeLower = code.toLowerCase();

  const purposes = [];
  const tags = [];

  switch (type) {
    case NODE_TYPES.FILE:
      purposes.push(...analyzeFilePurpose(node, allNodes, allEdges));
      break;
    case NODE_TYPES.FUNCTION:
      purposes.push(...analyzeFunctionPurpose(name, meta, code, codeLower));
      tags.push(...analyzeFunctionTags(name, code, codeLower));
      break;
    case NODE_TYPES.COMPONENT:
      purposes.push(...analyzeComponentPurpose(name, meta, code, codeLower, allNodes, allEdges));
      tags.push(...analyzeComponentTags(code, codeLower));
      break;
    case NODE_TYPES.IMPORT:
      purposes.push(...analyzeImportPurpose(name, meta));
      break;
    case NODE_TYPES.EXPORT:
      purposes.push(...analyzeExportPurpose(name, node, allNodes));
      break;
    case NODE_TYPES.CLASS:
      purposes.push(...analyzeClassPurpose(name, meta, code, codeLower));
      break;
    case NODE_TYPES.HOOK:
      purposes.push(...analyzeHookPurpose(name, code));
      break;
    case NODE_TYPES.EVENT:
      purposes.push(...analyzeEventPurpose(name));
      break;
    case NODE_TYPES.API_CALL:
      purposes.push(...analyzeApiPurpose(name, meta));
      break;
    case NODE_TYPES.ROUTE:
      purposes.push(...analyzeRoutePurpose(name, meta));
      break;
    default:
      purposes.push('General code entity');
  }

  return {
    description: purposes.filter(Boolean).join('. ') || 'No description available',
    tags: [...new Set(tags)],
  };
}

function analyzeFilePurpose(node, allNodes, allEdges) {
  const purposes = [];
  const fileName = node.label || '';
  const childEdges = allEdges.filter(e => e.from === node.id);
  const childNodes = childEdges.map(e => allNodes.find(n => n.id === e.to)).filter(Boolean);

  const componentCount = childNodes.filter(n => n.type === NODE_TYPES.COMPONENT).length;
  const functionCount = childNodes.filter(n => n.type === NODE_TYPES.FUNCTION).length;
  const exportCount = childNodes.filter(n => n.type === NODE_TYPES.EXPORT).length;
  const importCount = childNodes.filter(n => n.type === NODE_TYPES.IMPORT).length;

  // Detect file role by name and content
  if (/index\.(js|jsx|ts|tsx)$/i.test(fileName)) {
    purposes.push('Entry point module that bootstraps and initializes the application');
  } else if (/App\.(js|jsx|ts|tsx)$/i.test(fileName)) {
    purposes.push('Root application component that orchestrates the main UI layout and state');
  } else if (/api|service|client/i.test(fileName)) {
    purposes.push('API service module providing data fetching and backend communication');
  } else if (/util|helper|lib/i.test(fileName)) {
    purposes.push('Utility module containing reusable helper functions');
  } else if (/context|provider|store/i.test(fileName)) {
    purposes.push('State management module providing shared data via Context or Store pattern');
  } else if (/hook/i.test(fileName)) {
    purposes.push('Custom hooks module providing reusable stateful logic');
  } else if (/style|css|theme/i.test(fileName)) {
    purposes.push('Styling/theme configuration module');
  } else if (/config|setting/i.test(fileName)) {
    purposes.push('Configuration module with app settings and constants');
  } else if (/route|navigation/i.test(fileName)) {
    purposes.push('Routing module defining navigation paths and route mappings');
  } else if (/test|spec/i.test(fileName)) {
    purposes.push('Test file containing unit or integration tests');
  }

  // Summarize contents
  const parts = [];
  if (componentCount > 0) parts.push(`${componentCount} component${componentCount > 1 ? 's' : ''}`);
  if (functionCount > 0) parts.push(`${functionCount} function${functionCount > 1 ? 's' : ''}`);
  if (exportCount > 0) parts.push(`${exportCount} export${exportCount > 1 ? 's' : ''}`);
  if (importCount > 0) parts.push(`${importCount} import${importCount > 1 ? 's' : ''}`);
  if (parts.length > 0) {
    purposes.push(`Contains ${parts.join(', ')}`);
  }

  return purposes;
}

function analyzeFunctionPurpose(name, meta, code, codeLower) {
  const purposes = [];

  // Naming pattern analysis
  if (/^handle[A-Z]/.test(name)) {
    const action = name.replace(/^handle/, '');
    const readable = action.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    purposes.push(`Event handler that responds to ${readable} user interactions`);
  } else if (/^on[A-Z]/.test(name)) {
    const event = name.replace(/^on/, '');
    const readable = event.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    purposes.push(`Callback function triggered on ${readable} events`);
  } else if (/^(get|fetch|load|retrieve|read)/i.test(name)) {
    const subject = name.replace(/^(get|fetch|load|retrieve|read)/i, '');
    const readable = subject.replace(/([A-Z])/g, ' $1').trim().toLowerCase() || 'data';
    purposes.push(`Data retrieval function that fetches ${readable}`);
  } else if (/^(set|update|save|write|store|put)/i.test(name)) {
    const subject = name.replace(/^(set|update|save|write|store|put)/i, '');
    const readable = subject.replace(/([A-Z])/g, ' $1').trim().toLowerCase() || 'data';
    purposes.push(`Mutator function that updates ${readable}`);
  } else if (/^(create|add|insert|make|build|generate)/i.test(name)) {
    const subject = name.replace(/^(create|add|insert|make|build|generate)/i, '');
    const readable = subject.replace(/([A-Z])/g, ' $1').trim().toLowerCase() || 'items';
    purposes.push(`Creator function that produces new ${readable}`);
  } else if (/^(delete|remove|destroy|clear|reset)/i.test(name)) {
    const subject = name.replace(/^(delete|remove|destroy|clear|reset)/i, '');
    const readable = subject.replace(/([A-Z])/g, ' $1').trim().toLowerCase() || 'items';
    purposes.push(`Cleanup function that removes ${readable}`);
  } else if (/^(toggle|switch|flip)/i.test(name)) {
    const subject = name.replace(/^(toggle|switch|flip)/i, '');
    const readable = subject.replace(/([A-Z])/g, ' $1').trim().toLowerCase() || 'state';
    purposes.push(`Toggle function that switches the ${readable} between states`);
  } else if (/^(validate|check|verify|is|has|can)/i.test(name)) {
    const subject = name.replace(/^(validate|check|verify|is|has|can)/i, '');
    const readable = subject.replace(/([A-Z])/g, ' $1').trim().toLowerCase() || 'input';
    purposes.push(`Validation function that checks ${readable}`);
  } else if (/^(format|transform|convert|parse|serialize|map)/i.test(name)) {
    const subject = name.replace(/^(format|transform|convert|parse|serialize|map)/i, '');
    const readable = subject.replace(/([A-Z])/g, ' $1').trim().toLowerCase() || 'data';
    purposes.push(`Transformer function that formats or converts ${readable}`);
  } else if (/^(filter|sort|search|find|select)/i.test(name)) {
    const subject = name.replace(/^(filter|sort|search|find|select)/i, '');
    const readable = subject.replace(/([A-Z])/g, ' $1').trim().toLowerCase() || 'items';
    purposes.push(`Filter/search function that selects ${readable} based on criteria`);
  } else if (/^(render|display|show|draw|paint)/i.test(name)) {
    const subject = name.replace(/^(render|display|show|draw|paint)/i, '');
    const readable = subject.replace(/([A-Z])/g, ' $1').trim().toLowerCase() || 'content';
    purposes.push(`Renderer function that displays ${readable} in the UI`);
  } else if (/^(init|setup|bootstrap|configure|mount)/i.test(name)) {
    purposes.push('Initialization function that sets up the module or component');
  } else if (/^(debounce|throttle)/i.test(name)) {
    purposes.push('Rate-limiting utility that controls execution frequency');
  }

  // Body analysis for additional context
  if (meta.async) {
    if (!purposes.some(p => /fetch|retriev|data/i.test(p))) {
      purposes.push('Performs asynchronous operations');
    }
  }

  if (codeLower.includes('setstate') || codeLower.includes('usestate') || /set[A-Z]\w*\(/.test(code)) {
    purposes.push('Manages component state updates');
  }

  if (codeLower.includes('fetch(') || codeLower.includes('axios') || codeLower.includes('api')) {
    if (!purposes.some(p => /api|fetch|backend/i.test(p))) {
      purposes.push('Communicates with an external API');
    }
  }

  if (codeLower.includes('try') && codeLower.includes('catch')) {
    purposes.push('Includes error handling with try/catch');
  }

  if (codeLower.includes('localstorage') || codeLower.includes('sessionstorage')) {
    purposes.push('Interacts with browser local/session storage');
  }

  if (codeLower.includes('console.log') || codeLower.includes('console.error')) {
    purposes.push('Contains logging for debugging');
  }

  // Parameter analysis
  if (meta.params && meta.params.length > 0) {
    const paramStr = meta.params.join(', ');
    purposes.push(`Accepts parameters: (${paramStr})`);
  }

  return purposes;
}

function analyzeFunctionTags(name, code, codeLower) {
  const tags = [];
  if (/^handle|^on[A-Z]/.test(name)) tags.push('event-handler');
  if (codeLower.includes('async') || codeLower.includes('await') || codeLower.includes('.then(')) tags.push('async');
  if (codeLower.includes('fetch(') || codeLower.includes('axios')) tags.push('api');
  if (/set[A-Z]\w*\(/.test(code) || codeLower.includes('setstate')) tags.push('state-mutation');
  if (codeLower.includes('try') && codeLower.includes('catch')) tags.push('error-handling');
  if (codeLower.includes('return')) tags.push('returns-value');
  if (codeLower.includes('map(') || codeLower.includes('filter(') || codeLower.includes('reduce(')) tags.push('array-ops');
  if (codeLower.includes('settimeout') || codeLower.includes('setinterval')) tags.push('timer');
  if (codeLower.includes('localstorage') || codeLower.includes('sessionstorage')) tags.push('storage');
  return tags;
}

function analyzeComponentPurpose(name, meta, code, codeLower, allNodes, allEdges) {
  const purposes = [];

  // Component name patterns
  if (/Header/i.test(name)) {
    purposes.push('Header UI component that provides top-level navigation or branding');
  } else if (/Footer/i.test(name)) {
    purposes.push('Footer UI component displayed at the bottom of the page');
  } else if (/Nav|Navigation|Menu|Sidebar/i.test(name)) {
    purposes.push('Navigation component that provides links and menu structure');
  } else if (/List/i.test(name)) {
    purposes.push('List container component that renders a collection of items');
  } else if (/Item|Card|Row/i.test(name)) {
    purposes.push('Item component that renders a single entry in a collection');
  } else if (/Form|Input|Editor/i.test(name)) {
    purposes.push('Form/input component for collecting user data');
  } else if (/Button/i.test(name)) {
    purposes.push('Interactive button component for triggering actions');
  } else if (/Modal|Dialog|Popup|Overlay/i.test(name)) {
    purposes.push('Modal/dialog component for focused user interactions');
  } else if (/Empty|Placeholder|Skeleton|Loading|Spinner/i.test(name)) {
    purposes.push('Placeholder component shown during empty or loading states');
  } else if (/Error|NotFound|Fallback/i.test(name)) {
    purposes.push('Error boundary or fallback component for error states');
  } else if (/Provider|Context/i.test(name)) {
    purposes.push('Context provider component that shares state with child components');
  } else if (/Toggle|Switch/i.test(name)) {
    purposes.push('Toggle component for switching between two states');
  } else if (/Table|Grid|DataGrid/i.test(name)) {
    purposes.push('Data display component organized in tabular/grid format');
  } else if (/Search|Filter/i.test(name)) {
    purposes.push('Search/filter component for narrowing down displayed content');
  } else if (/App/i.test(name)) {
    purposes.push('Root application component that composes the main layout');
  } else {
    purposes.push(`React UI component that renders the ${name.replace(/([A-Z])/g, ' $1').trim()} section`);
  }

  // Props analysis
  if (meta.params && meta.params.length > 0) {
    const props = meta.params.join(', ');
    purposes.push(`Receives props: ${props}`);
  }

  // Hooks analysis
  if (codeLower.includes('usestate')) purposes.push('Uses local state management');
  if (codeLower.includes('useeffect')) purposes.push('Performs side effects (e.g., data fetching, subscriptions)');
  if (codeLower.includes('usecontext')) purposes.push('Consumes shared context data');
  if (codeLower.includes('usememo') || codeLower.includes('usecallback')) purposes.push('Optimized with memoization for performance');
  if (codeLower.includes('useref')) purposes.push('Uses refs for direct DOM access or persistent values');

  return purposes;
}

function analyzeComponentTags(code, codeLower) {
  const tags = ['component'];
  if (codeLower.includes('usestate')) tags.push('stateful');
  if (codeLower.includes('useeffect')) tags.push('side-effects');
  if (codeLower.includes('usecontext')) tags.push('context-consumer');
  if (codeLower.includes('createcontext')) tags.push('context-provider');
  if (codeLower.includes('map(')) tags.push('renders-list');
  if (codeLower.includes('onsubmit') || codeLower.includes('onchange')) tags.push('form');
  return tags;
}

function analyzeImportPurpose(name, meta) {
  const purposes = [];
  const specifiers = meta.specifiers || [];

  // Library-specific descriptions
  if (/^react$/i.test(name)) {
    purposes.push('Core React library for building UI components');
    if (specifiers.some(s => /useState|useEffect|useContext/.test(s))) {
      purposes.push(`Uses hooks: ${specifiers.filter(s => /^use/.test(s)).join(', ')}`);
    }
  } else if (/react-dom/i.test(name)) {
    purposes.push('React DOM renderer for mounting components to the browser');
  } else if (/react-router/i.test(name)) {
    purposes.push('Client-side routing library for page navigation');
  } else if (/axios/i.test(name)) {
    purposes.push('HTTP client library for making API requests');
  } else if (/redux/i.test(name)) {
    purposes.push('State management library for centralized app state');
  } else if (/express/i.test(name)) {
    purposes.push('Node.js web framework for building HTTP servers and APIs');
  } else if (/\.css|\.scss|\.less|\.style/i.test(name)) {
    purposes.push('Stylesheet import for visual styling');
  } else if (/^\./.test(name)) {
    // Relative import
    const cleanPath = name.replace(/^\.\//, '').replace(/\.\w+$/, '');
    const readableName = cleanPath.split('/').pop().replace(/([A-Z])/g, ' $1').trim();
    purposes.push(`Local module import: ${readableName}`);
    if (specifiers.length > 0) {
      purposes.push(`Imports: ${specifiers.join(', ')}`);
    }
  } else {
    // npm package
    purposes.push(`Third-party package: ${name}`);
    if (specifiers.length > 0) {
      purposes.push(`Uses: ${specifiers.join(', ')}`);
    }
  }

  return purposes;
}

function analyzeExportPurpose(name, node, allNodes) {
  const purposes = [];
  const exportedName = name.replace(/^export:\s*/, '');

  // Find what's being exported
  const matchedNode = allNodes.find(n =>
    n.label === exportedName &&
    n.type !== NODE_TYPES.EXPORT &&
    n.filePath === node.filePath
  );

  if (matchedNode) {
    purposes.push(`Exposes the ${matchedNode.type} "${exportedName}" for use by other modules`);
  } else if (/default/i.test(exportedName)) {
    purposes.push('Default export — the primary entity provided by this module');
  } else {
    purposes.push(`Named export making "${exportedName}" available to other files`);
  }

  return purposes;
}

function analyzeClassPurpose(name, meta, code, codeLower) {
  const purposes = [];

  if (meta.superClass) {
    purposes.push(`Extends ${meta.superClass} to inherit and customize behavior`);
  }

  if (codeLower.includes('render') && codeLower.includes('jsx')) {
    purposes.push('Class-based React component with render method');
  } else if (/Service|Api|Client/i.test(name)) {
    purposes.push('Service class encapsulating business logic or API communication');
  } else if (/Model|Entity|Record/i.test(name)) {
    purposes.push('Data model class representing a domain entity');
  } else if (/Controller|Handler/i.test(name)) {
    purposes.push('Controller class that handles requests and coordinates responses');
  } else if (/Store|Repository/i.test(name)) {
    purposes.push('Data store class managing persistence or caching');
  } else {
    purposes.push(`Class definition encapsulating ${name.replace(/([A-Z])/g, ' $1').trim().toLowerCase()} logic`);
  }

  return purposes;
}

function analyzeHookPurpose(name) {
  const purposes = [];
  const hookMap = {
    useState: 'Manages a reactive state variable in a functional component',
    useEffect: 'Runs side effects like data fetching, subscriptions, or DOM manipulation',
    useContext: 'Accesses shared context data from a parent Provider',
    useReducer: 'Manages complex state transitions with a reducer pattern',
    useCallback: 'Memoizes a callback function to prevent unnecessary re-renders',
    useMemo: 'Memoizes an expensive computation result for performance optimization',
    useRef: 'Creates a persistent ref for DOM access or stable values between renders',
    useLayoutEffect: 'Runs synchronous side effects after DOM mutations (before paint)',
    useImperativeHandle: 'Customizes the ref value exposed to parent components',
    useDebugValue: 'Displays a debug label in React DevTools for custom hooks',
  };

  if (hookMap[name]) {
    purposes.push(hookMap[name]);
  } else if (/^use/.test(name)) {
    const hookSubject = name.replace(/^use/, '');
    const readable = hookSubject.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    purposes.push(`Custom hook providing reusable ${readable} logic`);
  }

  return purposes;
}

function analyzeEventPurpose(name) {
  const purposes = [];
  const eventMap = {
    onClick: 'Responds to click/tap user interactions',
    onChange: 'Handles input value changes in form elements',
    onSubmit: 'Processes form submissions',
    onInput: 'Reacts to real-time input character changes',
    onBlur: 'Triggered when an element loses focus (e.g., validation)',
    onFocus: 'Triggered when an element receives focus',
    onKeyDown: 'Handles keyboard key press events',
    onKeyUp: 'Handles keyboard key release events',
    onKeyPress: 'Handles keyboard character input',
    onMouseEnter: 'Triggered on mouse hover entry (e.g., tooltips)',
    onMouseLeave: 'Triggered on mouse hover exit',
    onScroll: 'Handles container or page scroll events',
    onResize: 'Responds to window or element resize changes',
    onLoad: 'Triggered when a resource finishes loading',
    onError: 'Handles error events (e.g., failed image loads)',
    onDrag: 'Handles drag interactions for drag-and-drop',
    onDrop: 'Handles drop events in drag-and-drop workflows',
    addEventListener: 'Registers a native DOM event listener',
    removeEventListener: 'Cleans up a previously registered event listener',
  };

  if (eventMap[name]) {
    purposes.push(eventMap[name]);
  } else if (/^on[A-Z]/.test(name)) {
    const event = name.replace(/^on/, '');
    const readable = event.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    purposes.push(`Event listener for ${readable} interactions`);
  } else {
    purposes.push(`Event binding for "${name}" interactions`);
  }

  return purposes;
}

function analyzeApiPurpose(name, meta) {
  const purposes = [];

  if (meta.url) {
    purposes.push(`Makes an HTTP request to: ${meta.url}`);
  }

  if (/fetch/i.test(name)) {
    purposes.push('Uses the Fetch API for network requests');
  } else if (/axios/i.test(name)) {
    purposes.push('Uses Axios HTTP client for network requests');
  }

  if (/get/i.test(name) && !/forget/i.test(name)) {
    purposes.push('Retrieves data from the server (GET request)');
  } else if (/post/i.test(name)) {
    purposes.push('Sends new data to the server (POST request)');
  } else if (/put|patch/i.test(name)) {
    purposes.push('Updates existing data on the server (PUT/PATCH request)');
  } else if (/delete/i.test(name)) {
    purposes.push('Removes data from the server (DELETE request)');
  }

  return purposes;
}

function analyzeRoutePurpose(name, meta) {
  const purposes = [];

  if (meta.path) {
    purposes.push(`Defines a route endpoint at path: ${meta.path}`);
  }

  if (meta.method) {
    const method = meta.method.split('.').pop().toUpperCase();
    purposes.push(`Handles ${method} HTTP method`);
  }

  return purposes;
}

/**
 * Post-process all nodes to add purpose descriptions
 */
function enrichNodesWithPurpose(nodes, edges) {
  nodes.forEach(node => {
    const { description, tags } = generateNodePurpose(node, nodes, edges);
    node.metadata = node.metadata || {};
    node.metadata.purpose = description;
    node.metadata.tags = tags;
  });
}

/**
 * Parse raw code string (for single-file/paste mode)
 */
function parseCodeString(code, fileName = 'input.js') {
  return parseFile(fileName, code);
}

module.exports = {
  parseFile,
  parseProject,
  parseCodeString,
  findJSFiles,
  NODE_TYPES,
  EDGE_TYPES,
};

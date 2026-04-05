/**
 * server.js
 * y-websocket collaboration server entry point.
 *
 * Responsibilities:
 *  - Accept WebSocket connections from React SPA clients.
 *  - Synchronise Yjs CRDT state between all connected clients in a room.
 *  - Broadcast Yjs Awareness (cursor positions, selections, user presence).
 *  - Load and persist document snapshots via persistence.js.
 *  - Handle graceful shutdown: flush all dirty documents before exit.
 *
 * Architecture notes (from the assignment spec):
 *  - This server has NO dependency on the FastAPI backend at runtime.
 *    Auth is handled at the HTTP layer before the WS upgrade (see JWT check below).
 *  - Known limitation: single-instance, no horizontal scaling.
 *    Upgrade path: replace with Hocuspocus + Redis pub/sub.
 *  - The FastAPI backend shares the same PostgreSQL database for document
 *    metadata; this server only touches document_versions.
 */

'use strict';

require('dotenv').config({ path: '../../.env' });

const http = require('http');
const { WebSocketServer } = require('ws');
const { setupWSConnection, docs } = require('y-websocket/bin/utils');
const { bindPersistence, forceFlush, closePool, persistenceEnabled } = require('./persistence');

// -------------------------------------------------------------------
// Configuration
// -------------------------------------------------------------------
const PORT = parseInt(process.env.PORT ?? process.env.COLLAB_PORT ?? '1234', 10);
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// -------------------------------------------------------------------
// JWT verification (lightweight — no full FastAPI dependency)
// We validate the access token on the WebSocket upgrade request.
// If invalid, the connection is rejected before y-websocket touches it.
// -------------------------------------------------------------------
const jwt = require('jsonwebtoken');

/**
 * Extract and verify the JWT from the WebSocket upgrade request.
 * Clients must pass the token as a query parameter:
 *   wss://collab.example.com?token=<access_token>
 *
 * @param {http.IncomingMessage} req
 * @returns {{ userId: string, email: string } | null}
 */
function verifyRequest(req) {
  try {
    const url = new URL(req.url, `http://localhost`);
    const token = url.searchParams.get('token');
    if (!token) return null;

    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

// -------------------------------------------------------------------
// HTTP server (y-websocket needs a plain http.Server)
// -------------------------------------------------------------------
const server = http.createServer((_req, res) => {
  // Health check endpoint — used by Render and CI
  if (_req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

// -------------------------------------------------------------------
// WebSocket server
// -------------------------------------------------------------------
const wss = new WebSocketServer({ noServer: true });

/**
 * Track active ydocs that have had persistence bound.
 * Prevents binding persistence twice if a second client joins
 * a room that is already loaded in memory.
 * @type {Set<string>}
 */
const persistenceBound = new Set();


wss.on('connection', (ws, req, context) => {
  const { docName } = context;
  setupWSConnection(ws, req, { docName, gc: true }); // creates ydoc first

  if (!persistenceBound.has(docName)) {
    persistenceBound.add(docName);
    const ydoc = docs.get(docName); // now guaranteed to exist
    if (ydoc) {
      bindPersistence(docName, ydoc).catch((err) => {
        console.error(`[server] Failed to bind persistence for "${docName}":`, err.message);
      });
    }
  }
});

// -------------------------------------------------------------------
// WebSocket upgrade — authenticate before accepting the connection
// -------------------------------------------------------------------
server.on('upgrade', (req, socket, head) => {
  const user = verifyRequest(req);

  if (!user) {
    console.warn('[server] Rejected unauthenticated WebSocket upgrade');
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  // Extract docName from the path: /doc/<uuid>
  const url = new URL(req.url, 'http://localhost');
  const pathMatch = url.pathname.match(/^\/doc\/([^/?]+)/);

  if (!pathMatch) {
    console.warn('[server] Rejected WebSocket upgrade — invalid path:', req.url);
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  const docName = pathMatch[1];

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, { docName, user });
  });
});

// -------------------------------------------------------------------
// Start listening
// -------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`[server] y-websocket collaboration server running on port ${PORT}`);
  console.log(`[server] Health check: http://localhost:${PORT}/health`);
  if (!persistenceEnabled) {
    console.log('[server] Snapshot persistence disabled for this run (no DATABASE_URL / COLLAB_SYSTEM_USER_ID)');
  }
});

// -------------------------------------------------------------------
// Graceful shutdown
// On SIGTERM (Render deploy) or SIGINT (Ctrl+C), flush all dirty
// documents before closing the PostgreSQL pool and exiting.
// -------------------------------------------------------------------
async function shutdown(signal) {
  console.log(`[server] Received ${signal} — flushing dirty documents...`);

  const flushPromises = [];
  for (const [docName, ydoc] of docs.entries()) {
    flushPromises.push(forceFlush(docName, ydoc));
  }

  try {
    await Promise.allSettled(flushPromises);
    console.log('[server] All documents flushed');
  } catch (err) {
    console.error('[server] Error during flush:', err.message);
  }

  await closePool();
  server.close(() => {
    console.log('[server] HTTP server closed — exiting');
    process.exit(0);
  });

  // Force exit after 10 seconds if server hasn't closed cleanly
  setTimeout(() => {
    console.error('[server] Forced exit after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

/**
 * persistence.js
 * PostgreSQL snapshot adapter for the y-websocket collaboration server.
 *
 * Responsibilities:
 *  - Load the latest Yjs binary snapshot from PostgreSQL when a document
 *    room is first opened, so new clients receive full document state.
 *  - Persist the current Yjs state to PostgreSQL every 30 seconds when
 *    the document has changed (debounced write — no write on idle rooms).
 *  - Expose a forceFlush(docName) helper used on clean server shutdown
 *    to persist any pending state before the process exits.
 *
 * Design notes:
 *  - Content is stored as bytea in document_versions (append-only).
 *    Revert operations are handled by the FastAPI backend, not here.
 *  - The system user UUID (COLLAB_SYSTEM_USER_ID) is used as created_by
 *    for auto-snapshots. Set this to a real user UUID in your .env.
 *  - This module has no dependency on the FastAPI backend at runtime;
 *    it talks directly to PostgreSQL via pg.
 */

'use strict';

const { Pool } = require('pg');
const Y = require('yjs');

// -------------------------------------------------------------------
// Configuration
// -------------------------------------------------------------------
const SNAPSHOT_INTERVAL_MS = 30_000; // 30 seconds between writes
const DATABASE_URL = process.env.DATABASE_URL;
const SYSTEM_USER_ID = process.env.COLLAB_SYSTEM_USER_ID;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}
if (!SYSTEM_USER_ID) {
  throw new Error(
    'COLLAB_SYSTEM_USER_ID environment variable is required. ' +
    'Set it to a valid UUID from the users table (e.g. a "system" service account).'
  );
}

// -------------------------------------------------------------------
// PostgreSQL connection pool
// -------------------------------------------------------------------
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 5,                   // small pool — collab server has few concurrent DB needs
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('[persistence] Unexpected PostgreSQL pool error:', err.message);
});

// -------------------------------------------------------------------
// In-memory state tracking
// Tracks which documents have unsaved changes and their pending timers.
// -------------------------------------------------------------------

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const pendingTimers = new Map();

/** @type {Set<string>} */
const dirtyDocs = new Set();

// -------------------------------------------------------------------
// Internal helpers
// -------------------------------------------------------------------

/**
 * Resolve a document name to a UUID, handling both cases:
 *  - docName is already a valid UUID (most common in production)
 *  - docName is a slug/alias (look it up in documents.title — dev only)
 *
 * @param {string} docName
 * @returns {Promise<string|null>} UUID or null if not found
 */
async function resolveDocId(docName) {
  // Fast path: docName looks like a UUID
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(docName)) {
    return docName;
  }

  // Slow path: treat docName as a title slug (development convenience only)
  const result = await pool.query(
    'SELECT id FROM documents WHERE title = $1 AND is_deleted = FALSE LIMIT 1',
    [docName]
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Write a Yjs document snapshot to PostgreSQL.
 * Inserts a new row in document_versions (append-only — never overwrites).
 *
 * @param {string} docId   UUID of the document
 * @param {Uint8Array} snapshot  Full Yjs state vector encoded as binary
 */
async function writeSnapshot(docId, snapshot) {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO document_versions (doc_id, snapshot, created_by)
       VALUES ($1, $2, $3)`,
      [docId, Buffer.from(snapshot), SYSTEM_USER_ID]
    );
    console.log(`[persistence] Snapshot saved for doc ${docId} (${snapshot.byteLength} bytes)`);
  } finally {
    client.release();
  }
}

// -------------------------------------------------------------------
// Public API — consumed by server.js
// -------------------------------------------------------------------

/**
 * bindPersistence(docName, ydoc)
 *
 * Called by the y-websocket server when a room is first created.
 * 1. Loads the latest snapshot from PostgreSQL and applies it to ydoc.
 * 2. Observes ydoc for changes; schedules a debounced write on each change.
 *
 * @param {string} docName  Document identifier (UUID or slug)
 * @param {Y.Doc} ydoc      The Yjs document instance for this room
 * @returns {Promise<void>}
 */
async function bindPersistence(docName, ydoc) {
  const docId = await resolveDocId(docName);

  if (!docId) {
    console.warn(`[persistence] Document not found for name "${docName}" — starting empty`);
    return;
  }

  // 1. Load the latest snapshot
  try {
    const result = await pool.query(
      `SELECT snapshot FROM document_versions
       WHERE doc_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [docId]
    );

    if (result.rows.length > 0) {
      const snapshotBuffer = result.rows[0].snapshot;
      Y.applyUpdate(ydoc, new Uint8Array(snapshotBuffer));
      console.log(`[persistence] Loaded snapshot for doc ${docId} (${snapshotBuffer.length} bytes)`);
    } else {
      console.log(`[persistence] No existing snapshot for doc ${docId} — starting fresh`);
    }
  } catch (err) {
    console.error(`[persistence] Failed to load snapshot for doc ${docId}:`, err.message);
    // Non-fatal: the document starts empty. Clients will push their local state.
  }

  // 2. Observe changes and schedule debounced writes
  ydoc.on('update', (_update, _origin) => {
    dirtyDocs.add(docId);

    // Clear any existing timer for this doc and set a fresh one
    if (pendingTimers.has(docId)) {
      clearTimeout(pendingTimers.get(docId));
    }

    const timer = setTimeout(async () => {
      pendingTimers.delete(docId);
      if (!dirtyDocs.has(docId)) return;
      dirtyDocs.delete(docId);

      const snapshot = Y.encodeStateAsUpdate(ydoc);
      try {
        await writeSnapshot(docId, snapshot);
      } catch (err) {
        console.error(`[persistence] Auto-snapshot failed for doc ${docId}:`, err.message);
        // Re-mark as dirty so the next update triggers another attempt
        dirtyDocs.add(docId);
      }
    }, SNAPSHOT_INTERVAL_MS);

    pendingTimers.set(docId, timer);
  });
}

/**
 * forceFlush(docName, ydoc)
 *
 * Immediately persists the current state of a document, bypassing the
 * 30-second debounce. Called on SIGTERM / server shutdown to prevent
 * data loss for documents with pending writes.
 *
 * @param {string} docName
 * @param {Y.Doc} ydoc
 * @returns {Promise<void>}
 */
async function forceFlush(docName, ydoc) {
  const docId = await resolveDocId(docName);
  if (!docId) return;

  // Cancel any pending debounced timer
  if (pendingTimers.has(docId)) {
    clearTimeout(pendingTimers.get(docId));
    pendingTimers.delete(docId);
  }

  if (!dirtyDocs.has(docId)) {
    return; // Nothing changed since last write
  }

  dirtyDocs.delete(docId);
  const snapshot = Y.encodeStateAsUpdate(ydoc);

  try {
    await writeSnapshot(docId, snapshot);
    console.log(`[persistence] Force-flushed doc ${docId} on shutdown`);
  } catch (err) {
    console.error(`[persistence] Force-flush failed for doc ${docId}:`, err.message);
  }
}

/**
 * closePool()
 *
 * Gracefully closes the PostgreSQL connection pool.
 * Called after all forceFlush calls complete during shutdown.
 *
 * @returns {Promise<void>}
 */
async function closePool() {
  await pool.end();
  console.log('[persistence] PostgreSQL pool closed');
}

module.exports = { bindPersistence, forceFlush, closePool };
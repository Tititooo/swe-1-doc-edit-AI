/**
 * persistence.js
 * PostgreSQL snapshot adapter for the y-websocket collaboration server.
 *
 * In production and on Render, DATABASE_URL is required so the collab server
 * can persist Yjs snapshots to document_versions. For local development, the
 * server may run without DATABASE_URL; in that case persistence is disabled and
 * rooms stay in-memory only.
 */

'use strict';

const { Pool } = require('pg');
const Y = require('yjs');

const SNAPSHOT_INTERVAL_MS = 30_000;
const DATABASE_URL = process.env.DATABASE_URL;
const SYSTEM_USER_ID = process.env.COLLAB_SYSTEM_USER_ID;
const persistenceEnabled = Boolean(DATABASE_URL && SYSTEM_USER_ID);

/** @type {Pool | null} */
let pool = null;

if (persistenceEnabled) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  pool.on('error', (err) => {
    console.error('[persistence] Unexpected PostgreSQL pool error:', err.message);
  });
} else {
  console.warn('[persistence] DATABASE_URL or COLLAB_SYSTEM_USER_ID missing — running in no-persistence mode');
}

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const pendingTimers = new Map();
/** @type {Set<string>} */
const dirtyDocs = new Set();

async function resolveDocId(docName) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(docName)) {
    return docName;
  }

  if (!pool) {
    return docName;
  }

  const result = await pool.query(
    'SELECT id FROM documents WHERE title = $1 AND is_deleted = FALSE LIMIT 1',
    [docName]
  );
  return result.rows[0]?.id ?? null;
}

async function writeSnapshot(docId, snapshot) {
  if (!pool || !SYSTEM_USER_ID) {
    return;
  }
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

async function bindPersistence(docName, ydoc) {
  const docId = await resolveDocId(docName);

  if (!docId) {
    console.warn(`[persistence] Document not found for name "${docName}" — starting empty`);
    return;
  }

  if (pool) {
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
    }
  }

  ydoc.on('update', () => {
    dirtyDocs.add(docId);

    if (pendingTimers.has(docId)) {
      clearTimeout(pendingTimers.get(docId));
    }

    const timer = setTimeout(async () => {
      pendingTimers.delete(docId);
      if (!dirtyDocs.has(docId)) return;
      dirtyDocs.delete(docId);

      if (!pool) {
        return;
      }

      const snapshot = Y.encodeStateAsUpdate(ydoc);
      try {
        await writeSnapshot(docId, snapshot);
      } catch (err) {
        console.error(`[persistence] Auto-snapshot failed for doc ${docId}:`, err.message);
        dirtyDocs.add(docId);
      }
    }, SNAPSHOT_INTERVAL_MS);

    pendingTimers.set(docId, timer);
  });
}

async function forceFlush(docName, ydoc) {
  const docId = await resolveDocId(docName);
  if (!docId) return;

  if (pendingTimers.has(docId)) {
    clearTimeout(pendingTimers.get(docId));
    pendingTimers.delete(docId);
  }

  if (!dirtyDocs.has(docId)) {
    return;
  }

  dirtyDocs.delete(docId);

  if (!pool) {
    return;
  }

  const snapshot = Y.encodeStateAsUpdate(ydoc);

  try {
    await writeSnapshot(docId, snapshot);
    console.log(`[persistence] Force-flushed doc ${docId} on shutdown`);
  } catch (err) {
    console.error(`[persistence] Force-flush failed for doc ${docId}:`, err.message);
  }
}

async function closePool() {
  if (!pool) {
    return;
  }
  await pool.end();
  console.log('[persistence] PostgreSQL pool closed');
}

module.exports = { bindPersistence, forceFlush, closePool, persistenceEnabled };

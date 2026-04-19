/**
 * auth.js
 * Doc-scoped JWT verification for y-websocket upgrades.
 *
 * Factored out of server.js so it can be exercised by node:test without
 * spinning up the full WebSocket server. The contract is: the token must
 * have been minted by POST /api/realtime/session — it must be signed with
 * the shared JWT_SECRET, have type === 'doc_access', and carry a doc_id
 * claim that matches the document UUID parsed from the upgrade path.
 *
 * Rejecting anything else closes the A1 review deduction that a generic
 * bearer could be replayed against any document.
 */

'use strict';

const jwt = require('jsonwebtoken');

/**
 * @param {import('http').IncomingMessage} req
 * @param {string} expectedDocId  docName parsed from /doc/<uuid>.
 * @param {string} secret         Shared JWT secret (same as FastAPI).
 * @returns {{ userId: string, role: string, docId: string } | null}
 */
function verifyRequest(req, expectedDocId, secret) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    if (!token) return null;

    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (payload.type !== 'doc_access') return null;
    if (!payload.doc_id || payload.doc_id !== expectedDocId) return null;
    return { userId: payload.sub, role: payload.role, docId: payload.doc_id };
  } catch {
    return null;
  }
}

module.exports = { verifyRequest };

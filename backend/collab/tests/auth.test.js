'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { verifyRequest } = require('../auth');

const SECRET = 'test-secret-must-match-fastapi';
const DOC_ID = '8c1d0e5d-bfcd-4a36-9d27-2b0ff1a0a001';
const OTHER_DOC = '11111111-1111-1111-1111-111111111111';

function mintDocToken(overrides = {}) {
  return jwt.sign(
    {
      sub: 'user-1',
      doc_id: DOC_ID,
      role: 'owner',
      type: 'doc_access',
      ...overrides,
    },
    SECRET,
    { algorithm: 'HS256', expiresIn: '10m' }
  );
}

function upgradeReq(token, path = `/doc/${DOC_ID}`) {
  return { url: token === null ? path : `${path}?token=${token}` };
}

test('verifyRequest accepts a correctly scoped doc_access token', () => {
  const token = mintDocToken();
  const result = verifyRequest(upgradeReq(token), DOC_ID, SECRET);
  assert.ok(result);
  assert.equal(result.userId, 'user-1');
  assert.equal(result.role, 'owner');
  assert.equal(result.docId, DOC_ID);
});

test('verifyRequest rejects when doc_id claim does not match the path', () => {
  // Token minted for DOC_ID but connecting to OTHER_DOC — the exact
  // attack the A1 review asked us to block.
  const token = mintDocToken();
  const result = verifyRequest(upgradeReq(token, `/doc/${OTHER_DOC}`), OTHER_DOC, SECRET);
  assert.equal(result, null);
});

test('verifyRequest rejects a generic type=access bearer', () => {
  const token = jwt.sign(
    { sub: 'user-1', email: 'u@x', type: 'access' },
    SECRET,
    { algorithm: 'HS256', expiresIn: '15m' }
  );
  const result = verifyRequest(upgradeReq(token), DOC_ID, SECRET);
  assert.equal(result, null);
});

test('verifyRequest rejects a token with the wrong signature', () => {
  const token = jwt.sign(
    { sub: 'user-1', doc_id: DOC_ID, role: 'owner', type: 'doc_access' },
    'different-secret',
    { algorithm: 'HS256', expiresIn: '10m' }
  );
  const result = verifyRequest(upgradeReq(token), DOC_ID, SECRET);
  assert.equal(result, null);
});

test('verifyRequest rejects when the token is missing', () => {
  const result = verifyRequest(upgradeReq(null), DOC_ID, SECRET);
  assert.equal(result, null);
});

test('verifyRequest rejects an expired token', () => {
  const token = jwt.sign(
    { sub: 'user-1', doc_id: DOC_ID, role: 'owner', type: 'doc_access' },
    SECRET,
    { algorithm: 'HS256', expiresIn: -1 }
  );
  const result = verifyRequest(upgradeReq(token), DOC_ID, SECRET);
  assert.equal(result, null);
});

test('verifyRequest rejects when doc_id claim is absent', () => {
  const token = jwt.sign(
    { sub: 'user-1', role: 'owner', type: 'doc_access' },
    SECRET,
    { algorithm: 'HS256', expiresIn: '10m' }
  );
  const result = verifyRequest(upgradeReq(token), DOC_ID, SECRET);
  assert.equal(result, null);
});

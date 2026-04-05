/**
 * Mock API for local development and testing.
 * Mirrors the strict document routes used by the real frontend.
 */

import type { Document, DocumentListItem, APIError } from '../types/document'

// Simulated server state
let serverDocument: Document = {
  id: 'doc-001',
  title: 'Sample Document',
  content: `The quick brown fox jumps over the lazy dog. This is a sample document for testing the editor.

Try selecting some text and clicking "Rewrite" to see the AI assistant in action.

You can edit this content freely, and the version control system will track changes.`,
  versionId: 1,
  lastModified: new Date().toISOString(),
}

// Mock delay to simulate network latency
const MOCK_DELAY = 800 // ms

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const mockListDocuments = async (): Promise<DocumentListItem[]> => {
  await delay(MOCK_DELAY)
  return [
    {
      id: serverDocument.id,
      title: serverDocument.title,
      role: 'owner',
      updatedAt: serverDocument.lastModified,
    },
  ]
}

export const mockCreateDocument = async (title: string): Promise<Document> => {
  await delay(MOCK_DELAY)
  serverDocument = {
    id: `doc-${Math.random().toString(36).slice(2, 8)}`,
    title,
    content: '',
    versionId: 1,
    lastModified: new Date().toISOString(),
  }
  return { ...serverDocument }
}

export const mockFetchDocument = async (docId: string): Promise<Document> => {
  await delay(MOCK_DELAY)
  if (docId !== serverDocument.id) {
    throw { message: 'Document not found', status: 404 } satisfies APIError
  }
  return { ...serverDocument }
}

export const mockUpdateDocument = async (
  docId: string,
  content: string,
  versionId: number
): Promise<Document> => {
  await delay(MOCK_DELAY)

  if (docId !== serverDocument.id) {
    throw { message: 'Document not found', status: 404 } satisfies APIError
  }

  if (versionId !== serverDocument.versionId) {
    throw new Error('Version conflict: Document has been updated by another user')
  }

  serverDocument = {
    ...serverDocument,
    content,
    versionId: versionId + 1,
    lastModified: new Date().toISOString(),
  }

  return { ...serverDocument }
}

export const mockCheckDocumentVersion = async (docId: string): Promise<{ versionId: number }> => {
  await delay(300)
  if (docId !== serverDocument.id) {
    throw { message: 'Document not found', status: 404 } satisfies APIError
  }
  return { versionId: serverDocument.versionId }
}

export const enableMockAPI = () => {
  console.log('✓ Mock API enabled for local development')
  window.__MOCK_MODE__ = true
}

export default {
  mockListDocuments,
  mockCreateDocument,
  mockFetchDocument,
  mockUpdateDocument,
  mockCheckDocumentVersion,
  enableMockAPI,
}

/**
 * Mock API for local development and testing.
 * Mirrors the frontend's document, sharing, and version routes.
 */

import type {
  APIError,
  Document,
  DocumentListItem,
  DocumentPermissionItem,
  DocumentRole,
  DocumentVersionItem,
} from '../types/document'

interface MockVersionEntry extends DocumentVersionItem {
  content: string
}

const MOCK_DELAY = 250
const CURRENT_USER_ID = 'mock-owner'
const CURRENT_USER_EMAIL = 'mock@local'
const CURRENT_USER_NAME = 'Mock Preview'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const nowIso = () => new Date().toISOString()

const createDocumentRecord = (title: string, content: string): Document => ({
  id: `doc-${Math.random().toString(36).slice(2, 8)}`,
  title,
  content,
  versionId: 1,
  lastModified: nowIso(),
})

const initialDocuments: Document[] = [
  {
    id: 'doc-001',
    title: 'Sample Document',
    content: `The quick brown fox jumps over the lazy dog. This is a sample document for testing the editor.

Try selecting some text and clicking "Rewrite" to see the AI assistant in action.

You can edit this content freely, and the version control system will track changes.`,
    versionId: 1,
    lastModified: nowIso(),
  },
  createDocumentRecord(
    'Project Notes',
    `Sprint planning notes

- Review sharing UX
- Finalize version history panel
- Record demo walkthrough`
  ),
]

let serverDocuments = [...initialDocuments]

const permissionStore: Record<string, DocumentPermissionItem[]> = Object.fromEntries(
  initialDocuments.map((document) => [
    document.id,
    [
      {
        permissionId: `perm-${document.id}-owner`,
        userId: CURRENT_USER_ID,
        email: CURRENT_USER_EMAIL,
        name: CURRENT_USER_NAME,
        role: 'owner',
      },
    ],
  ])
)

const versionStore: Record<string, MockVersionEntry[]> = Object.fromEntries(
  initialDocuments.map((document) => [
    document.id,
    [
      {
        versionId: 1,
        createdAt: document.lastModified,
        createdBy: CURRENT_USER_NAME,
        content: document.content,
      },
    ],
  ])
)

const getDocumentOrThrow = (docId: string): Document => {
  const document = serverDocuments.find((item) => item.id === docId)
  if (!document) {
    throw { message: 'Document not found', status: 404 } satisfies APIError
  }
  return document
}

const updateDocumentInStore = (nextDocument: Document) => {
  serverDocuments = serverDocuments.map((item) => (item.id === nextDocument.id ? nextDocument : item))
}

const normalizeRole = (role: DocumentRole): DocumentRole => role

export const mockListDocuments = async (): Promise<DocumentListItem[]> => {
  await delay(MOCK_DELAY)

  return [...serverDocuments]
    .sort((left, right) => right.lastModified.localeCompare(left.lastModified))
    .map((document) => ({
      id: document.id,
      title: document.title,
      role: permissionStore[document.id]?.[0]?.role || 'owner',
      updatedAt: document.lastModified,
    }))
}

export const mockCreateDocument = async (title: string): Promise<Document> => {
  await delay(MOCK_DELAY)

  const created: Document = {
    id: `doc-${Math.random().toString(36).slice(2, 8)}`,
    title,
    content: '',
    versionId: 1,
    lastModified: nowIso(),
  }

  serverDocuments = [created, ...serverDocuments]
  permissionStore[created.id] = [
    {
      permissionId: `perm-${created.id}-owner`,
      userId: CURRENT_USER_ID,
      email: CURRENT_USER_EMAIL,
      name: CURRENT_USER_NAME,
      role: 'owner',
    },
  ]
  versionStore[created.id] = [
    {
      versionId: 1,
      createdAt: created.lastModified,
      createdBy: CURRENT_USER_NAME,
      content: created.content,
    },
  ]

  return { ...created }
}

export const mockFetchDocument = async (docId: string): Promise<Document> => {
  await delay(MOCK_DELAY)
  return { ...getDocumentOrThrow(docId) }
}

export const mockRenameDocument = async (
  docId: string,
  title: string
): Promise<{ id: string; title: string; updatedAt: string }> => {
  await delay(MOCK_DELAY)

  const current = getDocumentOrThrow(docId)
  const updatedAt = nowIso()
  updateDocumentInStore({
    ...current,
    title,
    lastModified: updatedAt,
  })

  return { id: docId, title, updatedAt }
}

export const mockUpdateDocument = async (
  docId: string,
  content: string,
  versionId: number
): Promise<Document> => {
  await delay(MOCK_DELAY)

  const current = getDocumentOrThrow(docId)

  if (versionId !== current.versionId) {
    throw {
      message: `Version conflict: expected ${current.versionId}, got ${versionId}`,
      status: 409,
      code: 'VERSION_CONFLICT',
    } satisfies APIError
  }

  const updated: Document = {
    ...current,
    content,
    versionId: current.versionId + 1,
    lastModified: nowIso(),
  }

  updateDocumentInStore(updated)
  versionStore[docId] = [
    {
      versionId: updated.versionId,
      createdAt: updated.lastModified,
      createdBy: CURRENT_USER_NAME,
      content: updated.content,
    },
    ...versionStore[docId],
  ]

  return { ...updated }
}

export const mockCheckDocumentVersion = async (docId: string): Promise<{ versionId: number }> => {
  await delay(MOCK_DELAY)
  return { versionId: getDocumentOrThrow(docId).versionId }
}

export const mockListDocumentPermissions = async (docId: string): Promise<DocumentPermissionItem[]> => {
  await delay(MOCK_DELAY)
  getDocumentOrThrow(docId)
  return [...(permissionStore[docId] || [])]
}

export const mockCreateDocumentPermission = async (
  docId: string,
  userEmail: string,
  role: DocumentRole
): Promise<{ permission_id: string; user_id: string; role: DocumentRole }> => {
  await delay(MOCK_DELAY)

  getDocumentOrThrow(docId)

  const trimmedEmail = userEmail.trim().toLowerCase()
  if (!trimmedEmail) {
    throw { message: 'Email is required.', status: 400, code: 'INVALID_REQUEST' } satisfies APIError
  }

  const permissions = permissionStore[docId] || []
  const existing = permissions.find((item) => item.email.toLowerCase() === trimmedEmail)
  if (existing) {
    throw {
      message: 'This user already has access to the document.',
      status: 400,
      code: 'INVALID_REQUEST',
    } satisfies APIError
  }

  const created = {
    permissionId: `perm-${Math.random().toString(36).slice(2, 8)}`,
    userId: `user-${Math.random().toString(36).slice(2, 8)}`,
    email: trimmedEmail,
    name: trimmedEmail.split('@')[0],
    role: normalizeRole(role),
  } satisfies DocumentPermissionItem

  permissionStore[docId] = [...permissions, created]

  return {
    permission_id: created.permissionId,
    user_id: created.userId,
    role: created.role,
  }
}

export const mockDeleteDocumentPermission = async (docId: string, permissionId: string): Promise<void> => {
  await delay(MOCK_DELAY)

  getDocumentOrThrow(docId)

  const existing = permissionStore[docId] || []
  permissionStore[docId] = existing.filter((item) => item.permissionId !== permissionId)
}

export const mockListDocumentVersions = async (docId: string): Promise<DocumentVersionItem[]> => {
  await delay(MOCK_DELAY)
  getDocumentOrThrow(docId)
  return (versionStore[docId] || []).map(({ versionId, createdAt, createdBy }) => ({ versionId, createdAt, createdBy }))
}

export const mockRevertDocumentVersion = async (
  docId: string,
  versionId: number
): Promise<{ versionId: number; createdAt: string }> => {
  await delay(MOCK_DELAY)

  const current = getDocumentOrThrow(docId)
  const target = (versionStore[docId] || []).find((item) => item.versionId === versionId)

  if (!target) {
    throw { message: 'Document or version not found.', status: 404 } satisfies APIError
  }

  const reverted: Document = {
    ...current,
    content: target.content,
    versionId: current.versionId + 1,
    lastModified: nowIso(),
  }

  updateDocumentInStore(reverted)
  versionStore[docId] = [
    {
      versionId: reverted.versionId,
      createdAt: reverted.lastModified,
      createdBy: CURRENT_USER_NAME,
      content: reverted.content,
    },
    ...versionStore[docId],
  ]

  return {
    versionId: reverted.versionId,
    createdAt: reverted.lastModified,
  }
}

export const enableMockAPI = () => {
  console.log('✓ Mock API enabled for local development')
  window.__MOCK_MODE__ = true
}

export default {
  mockListDocuments,
  mockCreateDocument,
  mockFetchDocument,
  mockRenameDocument,
  mockUpdateDocument,
  mockCheckDocumentVersion,
  mockListDocumentPermissions,
  mockCreateDocumentPermission,
  mockDeleteDocumentPermission,
  mockListDocumentVersions,
  mockRevertDocumentVersion,
  enableMockAPI,
}

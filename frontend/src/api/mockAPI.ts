/**
 * Mock API for local development and testing
 * Simulates backend responses without needing a server
 * Replace with real API calls once backend is ready
 */

import { AIRewriteRequest, AIRewriteResponse, Document } from '../types/document'

// Simulated server state
let serverDocument: Document = {
  id: 'doc-001',
  content: `The quick brown fox jumps over the lazy dog. This is a sample document for testing the editor.

Try selecting some text and clicking "Rewrite" to see the AI assistant in action.

You can edit this content freely, and the version control system will track changes.`,
  versionId: 1,
  lastModified: new Date().toISOString(),
  title: 'Sample Document',
}

// Mock delay to simulate network latency
const MOCK_DELAY = 800 // ms

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Mock: Fetch document
 */
export const mockFetchDocument = async (): Promise<Document> => {
  await delay(MOCK_DELAY)
  return { ...serverDocument }
}

/**
 * Mock: Update document
 */
export const mockUpdateDocument = async (
  content: string,
  versionId: number
): Promise<Document> => {
  await delay(MOCK_DELAY)

  // Simulate conflict: if version doesn't match, this would fail in real app
  if (versionId !== serverDocument.versionId) {
    throw new Error('Version conflict: Document has been updated by another user')
  }

  // Update server state
  serverDocument = {
    ...serverDocument,
    content,
    versionId: versionId + 1,
    lastModified: new Date().toISOString(),
  }

  return { ...serverDocument }
}

/**
 * Mock: Request AI rewrite
 * Simulates AI service rewriting selected text
 */
export const mockRequestAIRewrite = async (request: AIRewriteRequest): Promise<AIRewriteResponse> => {
  await delay(MOCK_DELAY + 1000) // AI takes longer

  const feature = request.feature || 'rewrite'
  const selectedText = request.selectedText.trim()
  const documentText = request.documentText?.trim() || ''

  if (!selectedText && feature !== 'continue') {
    return {
      success: false,
      error: 'No text provided for the requested AI action',
    }
  }

  let result: string

  if (feature === 'summarize') {
    result = `Summary: ${selectedText.slice(0, 80)}`
  } else if (feature === 'translate') {
    result = `[${request.targetLanguage || 'English'}] ${selectedText}`
  } else if (feature === 'restructure') {
    result = `${selectedText} [Restructured with notes: ${request.notes || 'none'}]`
  } else if (feature === 'continue') {
    result = `${documentText || selectedText} ...and then the paragraph continues with more detail.`
  } else {
    result = `${selectedText} [Enhanced version${request.style ? `: ${request.style}` : ''}]`
  }

  return {
    success: true,
    result,
    feature,
  }
}

/**
 * Mock: Check document version
 */
export const mockCheckDocumentVersion = async (): Promise<{ versionId: number }> => {
  await delay(300)
  return { versionId: serverDocument.versionId }
}

/**
 * Enable mock mode: patches axios to use mock functions
 */
export const enableMockAPI = () => {
  console.log('✓ Mock API enabled for local development')
  
  // Store original axios if needed for future switching
  window.__MOCK_MODE__ = true
}

export default {
  mockFetchDocument,
  mockUpdateDocument,
  mockRequestAIRewrite,
  mockCheckDocumentVersion,
  enableMockAPI,
}

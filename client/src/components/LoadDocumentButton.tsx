/**
 * LoadDocumentButton Component
 * Handles: US-01 (Loading the Document)
 *
 * Acceptance Criteria:
 * - Displays placeholder until data fetched
 * - Button disabled + loading spinner during API call
 * - Shows document content on success
 */

import './LoadDocumentButton.css'

interface LoadDocumentButtonProps {
  onLoad: () => Promise<void>
  isLoading: boolean
  hasDocument: boolean
}

export const LoadDocumentButton = ({
  onLoad,
  isLoading,
  hasDocument,
}: LoadDocumentButtonProps) => {
  return (
    <button
      className="load-button"
      onClick={onLoad}
      disabled={isLoading || hasDocument}
      title={hasDocument ? 'Document already loaded' : 'Click to load document'}
    >
      {isLoading && (
        <span className="spinner">🔄</span>
      )}
      {isLoading ? 'Loading...' : hasDocument ? 'Loaded ✓' : 'Load Document'}
    </button>
  )
}

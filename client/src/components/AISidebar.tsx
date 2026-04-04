/**
 * AISidebar Component
 * Handles: US-03 (AI Assistance - Rewrite)
 *
 * Acceptance Criteria:
 * - Sidebar visible when text is selected
 * - Sends selected text + versionId to backend
 * - Apply button disabled until AI response received
 * - Displays AI response preview
 */

import './AISidebar.css'

interface AISidebarProps {
  selectedText: string
  aiResponse: string | null
  isLoading: boolean
  onRewrite: () => Promise<void>
  onApply: (newText: string) => void
  isApplyDisabled: boolean
}

export const AISidebar = ({
  selectedText,
  aiResponse,
  isLoading,
  onRewrite,
  onApply,
  isApplyDisabled,
}: AISidebarProps) => {
  if (!selectedText.trim()) {
    return null
  }

  return (
    <aside className="ai-sidebar">
      <div className="sidebar-header">
        <h3>AI Assistant</h3>
      </div>

      <div className="sidebar-section">
        <label className="section-label">Selected Text</label>
        <div className="text-preview selected-text-preview">
          {selectedText}
        </div>
      </div>

      {aiResponse && (
        <div className="sidebar-section">
          <label className="section-label">Rewritten Version</label>
          <div className="text-preview rewritten-preview">
            {aiResponse}
          </div>
        </div>
      )}

      <div className="sidebar-actions">
        <button
          className="btn btn-rewrite"
          onClick={onRewrite}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <span className="spinner">🔄</span>
              Rewriting...
            </>
          ) : (
            'Rewrite'
          )}
        </button>

        {aiResponse && (
          <button
            className="btn btn-apply"
            onClick={() => onApply(aiResponse)}
            disabled={isApplyDisabled || isLoading}
          >
            Apply
          </button>
        )}
      </div>
    </aside>
  )
}

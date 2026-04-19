import { useEffect, useState } from 'react'
import type { DocumentRole, SaveStatus } from '../types/document'
import './DocumentWorkspaceHeader.css'

interface DocumentWorkspaceHeaderProps {
  title: string
  role: DocumentRole | null
  saveStatus: SaveStatus
  statusLabel: string
  titleSaving: boolean
  onBack: () => void
  onOpenShare: () => void
  onOpenHistory: () => void
  onRenameTitle: (nextTitle: string) => Promise<boolean>
}

export const DocumentWorkspaceHeader = ({
  title,
  role,
  saveStatus,
  statusLabel,
  titleSaving,
  onBack,
  onOpenShare,
  onOpenHistory,
  onRenameTitle,
}: DocumentWorkspaceHeaderProps) => {
  const [draftTitle, setDraftTitle] = useState(title)
  const canEditTitle = role === 'owner' || role === 'editor'
  const canShare = role === 'owner'

  useEffect(() => {
    setDraftTitle(title)
  }, [title])

  const commitTitle = async () => {
    const trimmed = draftTitle.trim()
    if (!canEditTitle) {
      setDraftTitle(title)
      return
    }
    if (!trimmed) {
      setDraftTitle(title)
      return
    }
    if (trimmed === title) {
      return
    }

    const saved = await onRenameTitle(trimmed)
    if (!saved) {
      setDraftTitle(title)
    }
  }

  return (
    <div className="workspace-header" data-testid="workspace-header">
      <div className="workspace-header-main">
        <button className="workspace-nav-button" type="button" onClick={onBack}>
          Back to Dashboard
        </button>

        <div className="workspace-title-block">
          <input
            className="workspace-title-input"
            value={draftTitle}
            disabled={!canEditTitle || titleSaving}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={() => void commitTitle()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void commitTitle()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setDraftTitle(title)
              }
            }}
            aria-label="Document title"
            data-testid="workspace-title-input"
          />
          <div className="workspace-title-meta">
            <span className={`workspace-status-pill workspace-status-${titleSaving ? 'saving' : saveStatus}`}>
              {titleSaving ? 'Renaming…' : statusLabel}
            </span>
            {role && <span className={`role-badge role-${role}`}>{role}</span>}
          </div>
        </div>
      </div>

      <div className="workspace-header-actions">
        {canShare && (
          <button className="workspace-action-button" type="button" onClick={onOpenShare}>
            Share
          </button>
        )}
        <button className="workspace-action-button workspace-action-button-secondary" type="button" onClick={onOpenHistory}>
          Version History
        </button>
      </div>
    </div>
  )
}

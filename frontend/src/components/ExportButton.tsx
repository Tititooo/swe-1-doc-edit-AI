/**
 * ExportButton
 * Provides a dropdown to export the current document as PDF, DOCX, or Markdown.
 * Calls GET /api/documents/:id/export?format=... and triggers a browser download.
 */

import { useEffect, useRef, useState } from 'react'
import { API_BASE_URL, authorizedFetch } from '../api/client'
import './ExportButton.css'

type ExportFormat = 'pdf' | 'docx' | 'md'

interface ExportButtonProps {
  documentId: string
  /** Optional: surface errors into the parent's ErrorBanner instead of inline. */
  onError?: (message: string) => void
}

const FORMAT_LABELS: Record<ExportFormat, string> = {
  pdf: 'PDF',
  docx: 'Word (.docx)',
  md: 'Markdown (.md)',
}

export const ExportButton = ({ documentId, onError }: ExportButtonProps) => {
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState<ExportFormat | null>(null)
  const [inlineError, setInlineError] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Close the dropdown when the user clicks anywhere outside the component.
  useEffect(() => {
    if (!open) return
    const handleOutsideClick = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  const handleExport = async (format: ExportFormat) => {
    setOpen(false)
    setExporting(format)
    setInlineError(null)

    try {
      const response = await authorizedFetch(
        `${API_BASE_URL}/documents/${documentId}/export?format=${format}`,
        { method: 'GET' }
      )

      if (!response.ok) {
        let message = 'Export failed'
        try {
          const body = (await response.json()) as { message?: string }
          message = body.message || message
        } catch {
          // ignore parse error
        }
        onError ? onError(message) : setInlineError(message)
        return
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `document.${format}`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)
    } catch {
      const message = 'Export failed. Please try again.'
      onError ? onError(message) : setInlineError(message)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="export-button-wrapper" ref={wrapperRef}>
      <button
        className="export-trigger-btn"
        onClick={() => setOpen((prev) => !prev)}
        disabled={!!exporting}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        data-testid="export-button"
      >
        {exporting ? `Exporting ${FORMAT_LABELS[exporting]}…` : 'Export ▾'}
      </button>

      {open && (
        <div className="export-dropdown" role="menu">
          {(Object.entries(FORMAT_LABELS) as [ExportFormat, string][]).map(([format, label]) => (
            <button
              key={format}
              className="export-option"
              onClick={() => void handleExport(format)}
              role="menuitem"
              data-testid={`export-${format}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {inlineError && (
        <div className="export-error" role="alert">
          {inlineError}
          <button onClick={() => setInlineError(null)} aria-label="Dismiss error">✕</button>
        </div>
      )}
    </div>
  )
}
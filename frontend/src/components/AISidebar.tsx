/**
 * AISidebar Component
 * Broadens the original rewrite-only UX into a small AI action panel:
 * rewrite, summarize, translate, restructure, and continue writing.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { AIFeature, AIHistoryItem } from '../types/document'
import type { AIRequestOptions } from '../hooks/useAI'
import './AISidebar.css'

interface AISidebarProps {
  selectedText: string
  documentText: string
  aiResponse: string | null
  activeFeature: AIFeature
  history: AIHistoryItem[]
  isLoading: boolean
  onCancel: () => Promise<void>
  onReject: () => Promise<void>
  onRewrite: (options: AIRequestOptions) => Promise<void>
  onApply: (newText: string, action?: 'accepted' | 'partial') => void
  isApplyDisabled: boolean
}

export const AISidebar = ({
  selectedText,
  documentText,
  aiResponse,
  activeFeature,
  history,
  isLoading,
  onCancel,
  onReject,
  onRewrite,
  onApply,
  isApplyDisabled,
}: AISidebarProps) => {
  const [feature, setFeature] = useState<AIFeature>('rewrite')
  const [style, setStyle] = useState('polished')
  const [notes, setNotes] = useState('')
  const [targetLanguage, setTargetLanguage] = useState('English')
  const suggestionTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [partialSelection, setPartialSelection] = useState('')

  // Snapshot the selection at the moment the user kicked off the request so
  // the compare card's Original column stays stable even if the editor blurs
  // and the live selection clears during streaming.
  const requestedOriginalRef = useRef<string>('')
  useEffect(() => {
    if (!aiResponse) {
      requestedOriginalRef.current = ''
      setPartialSelection('')
    }
  }, [aiResponse])

  const needsSelection = feature !== 'continue'
  const canRun = !needsSelection || !!selectedText.trim()

  const responseLabel = useMemo(() => {
    if (activeFeature === 'summarize') return 'Summary'
    if (activeFeature === 'translate') return 'Translation'
    if (activeFeature === 'restructure') return 'Restructured Text'
    if (activeFeature === 'continue') return 'Continuation'
    return 'Rewritten Version'
  }, [activeFeature])

  const updatePartialSelection = () => {
    const textarea = suggestionTextareaRef.current
    if (!textarea) {
      setPartialSelection('')
      return
    }

    const { selectionStart, selectionEnd, value } = textarea
    if (selectionStart === selectionEnd) {
      setPartialSelection('')
      return
    }

    const selected = value.slice(selectionStart, selectionEnd)
    setPartialSelection(selected === value ? '' : selected)
  }

  if (!documentText.trim()) {
    return null
  }

  return (
    <aside className="ai-sidebar">
      <div className="sidebar-header">
        <h3>AI Assistant</h3>
      </div>

      {!aiResponse && (
        <div className="sidebar-section">
          <label className="section-label">
            {needsSelection ? 'Selected Text' : 'Continue Writing From'}
          </label>
          <div className="text-preview selected-text-preview">
            {needsSelection ? selectedText || 'Select text to use this action.' : 'The end of the current document'}
          </div>
        </div>
      )}

      <div className="sidebar-section">
        <label className="section-label">Action</label>
        <select
          className="section-input"
          value={feature}
          onChange={(e) => setFeature(e.target.value as AIFeature)}
          disabled={isLoading}
          data-testid="ai-action-select"
        >
          <option value="rewrite">Rewrite</option>
          <option value="summarize">Summarize</option>
          <option value="translate">Translate</option>
          <option value="restructure">Restructure</option>
          <option value="continue">Continue Writing</option>
        </select>
      </div>

      {feature === 'rewrite' && (
        <div className="sidebar-section">
          <label className="section-label">Rewrite Style</label>
          <select
            className="section-input"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            disabled={isLoading}
          >
            <option value="polished">Polished</option>
            <option value="formal">Formal</option>
            <option value="concise">Concise</option>
            <option value="friendly">Friendly</option>
            <option value="creative">Creative</option>
          </select>
        </div>
      )}

      {feature === 'translate' && (
        <div className="sidebar-section">
          <label className="section-label">Target Language</label>
          <input
            className="section-input"
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            disabled={isLoading}
            placeholder="English"
          />
        </div>
      )}

      <div className="sidebar-section">
        <label className="section-label">Notes / Comments</label>
        <textarea
          className="section-input section-textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={isLoading}
          placeholder="Optional guidance for the AI"
          data-testid="ai-notes"
        />
      </div>

      {aiResponse && (
        <div className="sidebar-section compare-section">
          <label className="section-label">
            Compare · {responseLabel}
          </label>
          <div className="compare-card">
            <div className="compare-column compare-column-original">
              <div className="compare-column-header">Original</div>
              <div className="compare-column-body" data-testid="ai-compare-original">
                {needsSelection
                  ? requestedOriginalRef.current || selectedText || '—'
                  : 'End of current document'}
              </div>
            </div>
            <div className="compare-column compare-column-suggestion">
              <div className="compare-column-header">AI Suggestion</div>
              <textarea
                ref={suggestionTextareaRef}
                className="compare-column-body compare-column-body-input"
                value={isLoading ? `${aiResponse}▌` : aiResponse}
                readOnly
                onSelect={updatePartialSelection}
                onKeyUp={updatePartialSelection}
                onMouseUp={updatePartialSelection}
                data-testid="ai-compare-suggestion"
              />
              {!isLoading && (
                <div className="compare-selection-hint">
                  Highlight any part of the suggestion to apply only that portion.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="sidebar-section">
          <label className="section-label">Recent AI Activity</label>
          <div className="text-preview">
            {history.map((item) => (
              <div key={item.id} style={{ marginBottom: '10px' }}>
                <strong>{item.feature}</strong> · {item.status}
                <div>{item.suggestion_text || item.input_text.slice(0, 80)}</div>
                <div style={{ fontSize: '11px', color: '#667085', marginTop: '4px' }}>
                  {new Date(item.created_at).toLocaleString()} · {item.tokens_used} tokens
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="sidebar-actions">
        <button
          className="btn btn-rewrite"
          onClick={() => {
            requestedOriginalRef.current = needsSelection ? selectedText : ''
            onRewrite({
              feature,
              style,
              notes,
              targetLanguage,
              documentText,
            })
          }}
          disabled={isLoading || !canRun}
          data-testid="ai-run"
        >
          {isLoading ? (
            <>
              <span className="spinner">🔄</span>
              Thinking...
            </>
          ) : (
            feature === 'continue'
              ? 'Continue Writing'
              : feature.charAt(0).toUpperCase() + feature.slice(1)
          )}
        </button>

        {isLoading && (
          <button
            className="btn btn-apply"
            onClick={() => void onCancel()}
            data-testid="ai-cancel"
          >
            Cancel
          </button>
        )}

        {aiResponse && (
          <button
            className="btn btn-apply"
            onClick={() => onApply(aiResponse, 'accepted')}
            disabled={isApplyDisabled || isLoading}
            data-testid="ai-apply"
          >
            Apply
          </button>
        )}

        {aiResponse && !isLoading && (
          <button
            className="btn btn-partial"
            onClick={() => onApply(partialSelection, 'partial')}
            disabled={isApplyDisabled || !partialSelection}
            data-testid="ai-apply-partial"
          >
            Apply Selected Portion
          </button>
        )}

        {aiResponse && !isLoading && (
          <button
            className="btn"
            onClick={() => void onReject()}
            data-testid="ai-dismiss"
          >
            Dismiss
          </button>
        )}
      </div>
    </aside>
  )
}

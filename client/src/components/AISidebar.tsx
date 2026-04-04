/**
 * AISidebar Component
 * Broadens the original rewrite-only UX into a small AI action panel:
 * rewrite, summarize, translate, restructure, and continue writing.
 */

import { useMemo, useState } from 'react'
import type { AIFeature } from '../types/document'
import type { AIRequestOptions } from '../hooks/useAI'
import './AISidebar.css'

interface AISidebarProps {
  selectedText: string
  documentText: string
  aiResponse: string | null
  activeFeature: AIFeature
  isLoading: boolean
  onRewrite: (options: AIRequestOptions) => Promise<void>
  onApply: (newText: string) => void
  isApplyDisabled: boolean
}

export const AISidebar = ({
  selectedText,
  documentText,
  aiResponse,
  activeFeature,
  isLoading,
  onRewrite,
  onApply,
  isApplyDisabled,
}: AISidebarProps) => {
  const [feature, setFeature] = useState<AIFeature>('rewrite')
  const [style, setStyle] = useState('polished')
  const [notes, setNotes] = useState('')
  const [targetLanguage, setTargetLanguage] = useState('English')

  const needsSelection = feature !== 'continue'
  const canRun = !needsSelection || !!selectedText.trim()

  const responseLabel = useMemo(() => {
    if (activeFeature === 'summarize') return 'Summary'
    if (activeFeature === 'translate') return 'Translation'
    if (activeFeature === 'restructure') return 'Restructured Text'
    if (activeFeature === 'continue') return 'Continuation'
    return 'Rewritten Version'
  }, [activeFeature])

  if (!documentText.trim()) {
    return null
  }

  return (
    <aside className="ai-sidebar">
      <div className="sidebar-header">
        <h3>AI Assistant</h3>
      </div>

      <div className="sidebar-section">
        <label className="section-label">
          {needsSelection ? 'Selected Text' : 'Continue Writing From'}
        </label>
        <div className="text-preview selected-text-preview">
          {needsSelection ? selectedText || 'Select text to use this action.' : 'The end of the current document'}
        </div>
      </div>

      <div className="sidebar-section">
        <label className="section-label">Action</label>
        <select
          className="section-input"
          value={feature}
          onChange={(e) => setFeature(e.target.value as AIFeature)}
          disabled={isLoading}
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
        />
      </div>

      {aiResponse && (
        <div className="sidebar-section">
          <label className="section-label">{responseLabel}</label>
          <div className="text-preview rewritten-preview">
            {aiResponse}
          </div>
        </div>
      )}

      <div className="sidebar-actions">
        <button
          className="btn btn-rewrite"
          onClick={() =>
            onRewrite({
              feature,
              style,
              notes,
              targetLanguage,
              documentText,
            })
          }
          disabled={isLoading || !canRun}
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

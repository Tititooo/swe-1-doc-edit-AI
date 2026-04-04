/**
 * TextAreaEditor Component
 * Handles: US-02 (Text Editing & Interaction)
 *
 * Acceptance Criteria:
 * - Allows standard typing and text selection
 * - Selecting text triggers visibility of AI sidebar options
 */

import type { SyntheticEvent } from 'react'
import type { TextSelection } from '../types/document'
import './TextAreaEditor.css'

interface TextAreaEditorProps {
  content: string
  onChange: (content: string) => void
  onSelect: (selection: TextSelection | null) => void
  placeholder?: string
  disabled?: boolean
}

export const TextAreaEditor = ({
  content,
  onChange,
  onSelect,
  placeholder = 'Click Load to start...',
  disabled = false,
}: TextAreaEditorProps) => {
  const handleSelect = (e: SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement
    const { selectionStart, selectionEnd, value } = target

    if (selectionStart === selectionEnd) {
      onSelect(null)
      return
    }

    onSelect({
      start: selectionStart,
      end: selectionEnd,
      text: value.substring(selectionStart, selectionEnd),
    })
  }

  return (
    <textarea
      className="textarea-editor"
      value={content}
      onChange={(e) => onChange(e.target.value)}
      onSelect={handleSelect}
      placeholder={placeholder}
      disabled={disabled}
      spellCheck
    />
  )
}

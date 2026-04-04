/**
 * TextAreaEditor Component
 * Handles: US-02 (Text Editing & Interaction)
 *
 * Acceptance Criteria:
 * - Allows standard typing and text selection
 * - Selecting text triggers visibility of AI sidebar options
 */

import './TextAreaEditor.css'

interface TextAreaEditorProps {
  content: string
  onChange: (content: string) => void
  onSelect: (selectedText: string) => void
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
  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement
    const selectedText = target.value.substring(target.selectionStart, target.selectionEnd)
    onSelect(selectedText)
  }

  return (
    <textarea
      className="textarea-editor"
      value={content}
      onChange={(e) => onChange(e.target.value)}
      onSelect={handleSelect}
      placeholder={placeholder}
      disabled={disabled}
      spellCheck="true"
    />
  )
}

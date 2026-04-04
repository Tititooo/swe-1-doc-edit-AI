import { useEffect, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import type { AIFeature, TextSelection } from '../types/document'
import './ExperimentalTiptapEditor.css'

interface ExperimentalTiptapEditorProps {
  content: string
  selection: TextSelection | null
  aiResponse: string | null
  activeFeature: AIFeature
  isStreaming: boolean
  onChange: (content: string) => void
  onSelect: (selection: TextSelection | null) => void
  onAccept: (newText: string) => void
  onReject: () => void
  disabled?: boolean
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const textToHtml = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
    .join('')

const buildPreviewHtml = (
  content: string,
  selection: TextSelection | null,
  aiResponse: string | null,
  isStreaming: boolean
) => {
  const suggestion = aiResponse || ''

  if (!selection) {
    const appended = suggestion
      ? `${content.trimEnd()}\n\n${suggestion}${isStreaming ? '▌' : ''}`.trim()
      : content
    return textToHtml(appended)
  }

  const before = content.slice(0, selection.start)
  const after = content.slice(selection.end)
  const cursor = isStreaming ? '<span class="rich-preview-cursor">▌</span>' : ''

  return [
    textToHtml(before),
    `<span class="ai-inline-removed">${escapeHtml(selection.text)}</span>`,
    `<span class="ai-inline-added">${escapeHtml(suggestion)}${cursor}</span>`,
    textToHtml(after),
  ].join('')
}

export const ExperimentalTiptapEditor = ({
  content,
  selection,
  aiResponse,
  activeFeature,
  isStreaming,
  onChange,
  onSelect,
  onAccept,
  onReject,
  disabled = false,
}: ExperimentalTiptapEditorProps) => {
  const hasPreview = !!aiResponse

  const editor = useEditor({
    editable: !disabled && !hasPreview,
    extensions: [
      StarterKit.configure({
        history: false,
      }),
    ],
    content: textToHtml(content),
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getText({ blockSeparator: '\n\n' }))
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      const { from, to } = currentEditor.state.selection
      if (from === to) {
        onSelect(null)
        return
      }

      const before = currentEditor.state.doc.textBetween(0, from, '\n\n', '\n')
      const selected = currentEditor.state.doc.textBetween(from, to, '\n\n', '\n')
      onSelect({
        start: before.length,
        end: before.length + selected.length,
        text: selected,
      })
    },
  })

  useEffect(() => {
    if (!editor || hasPreview) return
    if (editor.getText({ blockSeparator: '\n\n' }) === content) return
    editor.commands.setContent(textToHtml(content), false)
  }, [content, editor, hasPreview])

  const previewHtml = useMemo(
    () => buildPreviewHtml(content, selection, aiResponse, isStreaming),
    [content, selection, aiResponse, isStreaming]
  )

  if (hasPreview) {
    return (
      <div className="rich-editor-shell">
        <div className="rich-editor-toolbar">
          <span className="rich-editor-title">Rich Editor Preview</span>
          <span className="rich-editor-mode">{activeFeature}</span>
        </div>
        <div
          className="textarea-editor rich-preview-surface"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
        <div className="rich-editor-actions">
          <button
            className="btn btn-apply"
            onClick={() => onAccept(aiResponse || '')}
            disabled={!aiResponse}
            type="button"
          >
            Accept in Editor
          </button>
          <button
            className="btn"
            onClick={onReject}
            type="button"
          >
            Reject Preview
          </button>
        </div>
      </div>
    )
  }

  if (!editor) return null

  return (
    <div className="rich-editor-shell">
      <div className="rich-editor-toolbar">
        <span className="rich-editor-title">Rich Editor Beta</span>
        <span className="rich-editor-mode">editable</span>
      </div>
      <EditorContent editor={editor} className="textarea-editor rich-editor-content" />
    </div>
  )
}

import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import type { TextSelection } from '../types/document'

interface ExperimentalTiptapEditorProps {
  content: string
  onChange: (content: string) => void
  onSelect: (selection: TextSelection | null) => void
  disabled?: boolean
}

const toParagraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, '<br />')}</p>`)
    .join('')

export const ExperimentalTiptapEditor = ({
  content,
  onChange,
  onSelect,
  disabled = false,
}: ExperimentalTiptapEditorProps) => {
  const editor = useEditor({
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        history: false,
      }),
    ],
    content: toParagraphs(content),
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
    if (!editor) return
    if (editor.getText({ blockSeparator: '\n\n' }) === content) return
    editor.commands.setContent(toParagraphs(content), false)
  }, [content, editor])

  if (!editor) return null

  return <EditorContent editor={editor} className="textarea-editor" />
}

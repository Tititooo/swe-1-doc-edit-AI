import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

interface ExperimentalTiptapEditorProps {
  content: string
  onChange: (content: string) => void
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
  })

  useEffect(() => {
    if (!editor) return
    if (editor.getText({ blockSeparator: '\n\n' }) === content) return
    editor.commands.setContent(toParagraphs(content), false)
  }, [content, editor])

  if (!editor) return null

  return <EditorContent editor={editor} className="textarea-editor" />
}

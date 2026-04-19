import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import { createLocalExtensions, createRealtimeExtensions } from '../extensions/realtimeEditor'
import { useRealtimeSession } from '../hooks/useRealtimeSession'
import { useEditorStore } from '../stores/editorStore'
import type { AIFeature, TextSelection } from '../types/document'
import './ExperimentalTiptapEditor.css'

interface ExperimentalTiptapEditorProps {
  documentId: string | null
  content: string
  selection: TextSelection | null
  aiResponse: string | null
  activeFeature: AIFeature
  isStreaming: boolean
  onChange: (content: string) => void
  onSelect: (selection: TextSelection | null) => void
  onAccept: (newText: string) => Promise<void>
  onReject: () => void
  disabled?: boolean
}

interface RealtimeEditorContext {
  document: Y.Doc
  provider: WebsocketProvider
  key: string
}

interface EditorSelectionRange {
  from: number
  to: number
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

const parseRealtimeUrl = (wsUrl: string, docId: string) => {
  const parsed = new URL(wsUrl)
  const pathPrefix = parsed.pathname.endsWith(`/${docId}`)
    ? parsed.pathname.slice(0, parsed.pathname.length - (`/${docId}`).length)
    : parsed.pathname

  return {
    serverUrl: `${parsed.protocol}//${parsed.host}${pathPrefix || ''}`,
    roomName: docId,
    token: parsed.searchParams.get('token') || undefined,
  }
}

export const ExperimentalTiptapEditor = ({
  documentId,
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
  const collaborationStatus = useEditorStore((state) => state.collaborationStatus)
  const presenceCount = useEditorStore((state) => state.presenceCount)
  const setCollaborationStatus = useEditorStore((state) => state.setCollaborationStatus)
  const setPresenceCount = useEditorStore((state) => state.setPresenceCount)
  const setConnectionError = useEditorStore((state) => state.setConnectionError)
  const sessionQuery = useRealtimeSession(documentId, !!documentId)
  const seededDocsRef = useRef<Set<string>>(new Set())
  const selectionRangeRef = useRef<EditorSelectionRange | null>(null)
  const lastEmittedTextRef = useRef<string>('')
  // Remembers the most recent non-empty selection so the preview card still
  // reflects what the user highlighted even after the editor blurs (e.g. when
  // they click the AI sidebar button, which fires onSelectionUpdate with
  // from===to just before the AI request starts).
  const [stickySelection, setStickySelection] = useState<TextSelection | null>(null)
  const [realtimeContext, setRealtimeContext] = useState<RealtimeEditorContext | null>(null)
  const [acceptingPreview, setAcceptingPreview] = useState(false)
  // True once the user has clicked Accept for the current response. Stays
  // true until a new AI request starts (signaled by aiResponse transitioning
  // to the empty string in useAI's requestRewrite). Without this flag a
  // post-accept `restoreResponse` — which App.tsx calls when updateDocument
  // fails — would re-reveal the preview overlay and break the CI smoke test.
  const [acceptedCurrentResponse, setAcceptedCurrentResponse] = useState(false)
  // Once we have an AI response, show the preview unconditionally. We used to
  // also require `!!selection`, but the editor now persists across preview
  // toggles (so Ctrl+Z can undo an accept) — which means clicking the AI
  // sidebar button blurs the editor and clears the selection *before* the
  // response arrives. The selection range we need for apply is captured in
  // selectionRangeRef at selection time, so losing the React selection state
  // mid-flow is fine.
  const hasPreview = !!aiResponse && !acceptingPreview && !acceptedCurrentResponse

  useEffect(() => {
    if (!documentId || !sessionQuery.data) {
      setRealtimeContext((current) => {
        current?.provider.destroy()
        current?.document.destroy()
        return null
      })
      return
    }

    const { serverUrl, roomName, token } = parseRealtimeUrl(sessionQuery.data.ws_url, sessionQuery.data.doc_id)
    const yDocument = new Y.Doc()
    const provider = new WebsocketProvider(serverUrl, roomName, yDocument, token ? { params: { token } } : {})

    provider.on('status', (event: { status: 'connecting' | 'connected' | 'disconnected' }) => {
      if (event.status === 'connected') {
        setCollaborationStatus('connected')
        return
      }
      if (event.status === 'connecting') {
        setCollaborationStatus('connecting')
        return
      }
      setCollaborationStatus('disconnected')
    })

    const syncPresence = () => {
      setPresenceCount(Math.max(0, provider.awareness.getStates().size - 1))
    }

    provider.awareness.on('change', syncPresence)
    setCollaborationStatus('connecting')
    setConnectionError(null)
    setRealtimeContext({
      document: yDocument,
      provider,
      key: `${serverUrl}:${roomName}`,
    })

    return () => {
      provider.awareness.off('change', syncPresence)
      provider.destroy()
      yDocument.destroy()
      setPresenceCount(0)
      setCollaborationStatus('idle')
    }
  }, [
    documentId,
    sessionQuery.data,
    setCollaborationStatus,
    setConnectionError,
    setPresenceCount,
  ])

  const extensions = useMemo(() => {
    if (realtimeContext && sessionQuery.data) {
      return createRealtimeExtensions({
        document: realtimeContext.document,
        provider: realtimeContext.provider,
        user: {
          name: sessionQuery.data.awareness_user.name,
          color: sessionQuery.data.awareness_user.color,
        },
      })
    }
    return createLocalExtensions()
  }, [realtimeContext, sessionQuery.data])

  const editor = useEditor(
    {
      editable:
        !disabled &&
        !hasPreview &&
        sessionQuery.data?.role !== 'viewer' &&
        sessionQuery.data?.role !== 'commenter',
      extensions,
      content: documentId ? '' : textToHtml(content),
      onUpdate: ({ editor: currentEditor }) => {
        // Tiptap fires onUpdate on every dispatched transaction, including
        // selection-only changes. Deduplicate so AI streaming (which causes
        // React re-renders that bounce through here) doesn't repeatedly fire
        // App.tsx's handleTextChange → resetAI() and wipe the in-flight
        // suggestion.
        const nextText = currentEditor.getText({ blockSeparator: '\n\n' })
        if (nextText === lastEmittedTextRef.current) return
        lastEmittedTextRef.current = nextText
        onChange(nextText)
      },
      onSelectionUpdate: ({ editor: currentEditor }) => {
        const { from, to } = currentEditor.state.selection
        if (from === to) {
          selectionRangeRef.current = null
          onSelect(null)
          return
        }

        selectionRangeRef.current = { from, to }
        const before = currentEditor.state.doc.textBetween(0, from, '\n\n', '\n')
        const selected = currentEditor.state.doc.textBetween(from, to, '\n\n', '\n')
        const nextSelection: TextSelection = {
          start: before.length,
          end: before.length + selected.length,
          text: selected,
        }
        setStickySelection(nextSelection)
        onSelect(nextSelection)
      },
    },
    // hasPreview is intentionally NOT a dep: tearing down the editor when
    // the preview flips drops the y-prosemirror undo stack, so Ctrl+Z after
    // Accept would be dead. We sync `editable` in an effect below instead.
    [realtimeContext?.key || 'local', disabled, sessionQuery.data?.role]
  )

  useEffect(() => {
    if (!editor) return
    const nextEditable =
      !disabled &&
      !hasPreview &&
      sessionQuery.data?.role !== 'viewer' &&
      sessionQuery.data?.role !== 'commenter'
    if (editor.isEditable !== nextEditable) {
      editor.setEditable(nextEditable)
    }
  }, [disabled, editor, hasPreview, sessionQuery.data?.role])

  useEffect(() => {
    if (!editor || hasPreview) return
    if (documentId) return
    if (editor.getText({ blockSeparator: '\n\n' }) === content) return
    editor.commands.setContent(textToHtml(content), false)
  }, [content, documentId, editor, hasPreview])

  useEffect(() => {
    if (!editor || !realtimeContext || hasPreview || !documentId) {
      return
    }

    const seedIfNeeded = () => {
      if (seededDocsRef.current.has(documentId)) {
        return
      }

      const currentText = editor.getText({ blockSeparator: '\n\n' }).trim()
      if (!currentText && content.trim()) {
        editor.commands.setContent(textToHtml(content), false)
      }
      seededDocsRef.current.add(documentId)
    }

    if (realtimeContext.provider.synced) {
      seedIfNeeded()
      return
    }

    const handleSync = (isSynced: boolean) => {
      if (isSynced) {
        seedIfNeeded()
      }
    }

    realtimeContext.provider.on('sync', handleSync)
    return () => {
      realtimeContext.provider.off('sync', handleSync)
    }
  }, [content, documentId, editor, hasPreview, realtimeContext])

  // Preview rendering uses whichever selection is active right now, falling
  // back to the last known selection so the preview doesn't lose its context
  // when the editor blurs during the request.
  const previewSelection = selection || stickySelection
  const previewHtml = useMemo(
    () => buildPreviewHtml(content, previewSelection, aiResponse, isStreaming),
    [content, previewSelection, aiResponse, isStreaming]
  )

  useEffect(() => {
    // Reset the in-flight accept state only when a new AI request starts.
    // useAI's requestRewrite sets aiResponse to '' before tokens arrive —
    // that's our "fresh request" signal. Going to null instead means
    // dismissResponse() just fired from the Accept path; keep the
    // accept-guard in place so a later restoreResponse on update failure
    // can't re-reveal the preview overlay.
    if (aiResponse === '') {
      setAcceptingPreview(false)
      setAcceptedCurrentResponse(false)
      setStickySelection(null)
    }
  }, [aiResponse])

  const applyPreviewToEditor = async () => {
    if (!editor || !aiResponse) {
      return
    }

    setAcceptingPreview(true)
    setAcceptedCurrentResponse(true)

    try {
      const previewMarkup = textToHtml(aiResponse)
      const selectionRange = selectionRangeRef.current

      if (selectionRange) {
        editor
          .chain()
          .focus()
          .deleteRange(selectionRange)
          .insertContent(previewMarkup)
          .run()
        selectionRangeRef.current = null
      } else {
        editor.chain().focus('end').insertContent(previewMarkup).run()
      }

      onSelect(null)
      await onAccept(editor.getText({ blockSeparator: '\n\n' }))
    } catch (error) {
      editor.commands.setContent(textToHtml(content), false)
      setAcceptingPreview(false)
      throw error
    }
  }

  if (!editor) return null

  const statusLabel = sessionQuery.data
    ? collaborationStatus === 'connected'
      ? `Live Sync · ${presenceCount} peers`
      : collaborationStatus === 'connecting'
        ? 'Live Sync · Connecting'
        : collaborationStatus === 'error'
          ? 'Live Sync · Unavailable'
          : 'Live Sync · Offline'
    : 'Local Editing'

  return (
    <div className="rich-editor-shell">
      <div className="rich-editor-toolbar">
        <span className="rich-editor-title">
          {hasPreview ? 'Rich Editor Preview' : 'Rich Editor'}
        </span>
        <span className={`rich-editor-mode ${sessionQuery.data ? 'rich-editor-mode-live' : ''}`}>
          {hasPreview ? activeFeature : statusLabel}
        </span>
      </div>

      <div className="rich-editor-surface">
        {/*
          EditorContent is kept mounted during preview so y-prosemirror's
          undo stack survives the accept. The preview overlays it absolutely
          rather than replacing it (display:none would destroy layout and
          made Playwright's toBeVisible assertions fail).
        */}
        <EditorContent
          editor={editor}
          className="textarea-editor rich-editor-content"
          data-testid="rich-editor"
        />

        {hasPreview && (
          <div className="rich-editor-preview-overlay">
            <div
              className="textarea-editor rich-preview-surface"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
              data-testid="rich-preview"
            />
            <div className="rich-editor-actions">
              <button
                className="btn btn-apply"
                onClick={() => void applyPreviewToEditor()}
                disabled={!aiResponse}
                type="button"
                data-testid="rich-preview-accept"
              >
                Accept in Editor
              </button>
              <button className="btn" onClick={onReject} type="button" data-testid="rich-preview-reject">
                Reject Preview
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

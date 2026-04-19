import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import type { WebsocketProvider } from 'y-websocket'
import type * as Y from 'yjs'

interface RealtimeExtensionOptions {
  document: Y.Doc
  provider: WebsocketProvider
  user: {
    name: string
    color: string
  }
}

export const createRealtimeExtensions = ({ document, provider, user }: RealtimeExtensionOptions) => [
  StarterKit.configure({
    history: false,
  }),
  Collaboration.configure({
    document,
  }),
  CollaborationCursor.configure({
    provider,
    user,
  }),
]

export const createLocalExtensions = () => [
  // Local (no-Yjs) mode: keep StarterKit's history plugin enabled so Ctrl+Z
  // works. In realtime mode history is disabled because @tiptap/extension-
  // collaboration owns undo via y-prosemirror's yUndoPlugin, which would
  // conflict with StarterKit's history.
  StarterKit,
]

import { create } from 'zustand'
import type { CollaborationStatus, RealtimeSession } from '../types/document'

interface EditorStoreState {
  activeDocumentId: string | null
  realtimeSession: RealtimeSession | null
  collaborationStatus: CollaborationStatus
  presenceCount: number
  connectionError: string | null
  setActiveDocumentId: (documentId: string | null) => void
  setRealtimeSession: (session: RealtimeSession | null) => void
  setCollaborationStatus: (status: CollaborationStatus) => void
  setPresenceCount: (count: number) => void
  setConnectionError: (message: string | null) => void
  resetRealtime: () => void
}

export const useEditorStore = create<EditorStoreState>((set) => ({
  activeDocumentId: null,
  realtimeSession: null,
  collaborationStatus: 'idle',
  presenceCount: 0,
  connectionError: null,
  setActiveDocumentId: (activeDocumentId) => set({ activeDocumentId }),
  setRealtimeSession: (realtimeSession) => set({ realtimeSession }),
  setCollaborationStatus: (collaborationStatus) => set({ collaborationStatus }),
  setPresenceCount: (presenceCount) => set({ presenceCount }),
  setConnectionError: (connectionError) => set({ connectionError }),
  resetRealtime: () =>
    set({
      realtimeSession: null,
      collaborationStatus: 'idle',
      presenceCount: 0,
      connectionError: null,
    }),
}))

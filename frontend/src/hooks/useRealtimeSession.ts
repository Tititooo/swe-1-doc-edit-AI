import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createRealtimeSession } from '../api/realtimeAPI'
import { useEditorStore } from '../stores/editorStore'

export const useRealtimeSession = (documentId: string | null, enabled: boolean) => {
  const setActiveDocumentId = useEditorStore((state) => state.setActiveDocumentId)
  const setRealtimeSession = useEditorStore((state) => state.setRealtimeSession)
  const setCollaborationStatus = useEditorStore((state) => state.setCollaborationStatus)
  const setConnectionError = useEditorStore((state) => state.setConnectionError)
  const resetRealtime = useEditorStore((state) => state.resetRealtime)

  const query = useQuery({
    queryKey: ['realtime-session', documentId],
    queryFn: () => createRealtimeSession(documentId!),
    enabled: enabled && !!documentId,
    retry: false,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  })

  useEffect(() => {
    setActiveDocumentId(documentId)
    if (!enabled || !documentId) {
      resetRealtime()
      return
    }

    if (query.isLoading || query.isFetching) {
      setCollaborationStatus('connecting')
      setConnectionError(null)
      return
    }

    if (query.data) {
      setRealtimeSession(query.data)
      setConnectionError(null)
      return
    }

    if (query.error) {
      setCollaborationStatus('error')
      setConnectionError(query.error.message)
    }
  }, [
    documentId,
    enabled,
    query.data,
    query.error,
    query.isFetching,
    query.isLoading,
    resetRealtime,
    setActiveDocumentId,
    setCollaborationStatus,
    setConnectionError,
    setRealtimeSession,
  ])

  return query
}

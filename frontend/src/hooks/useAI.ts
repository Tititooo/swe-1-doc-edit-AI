/**
 * useAI Hook
 * Manages AI rewrite requests, responses, and error states
 * Handles: US-03 (AI Assistance/Rewrite)
 */

import { useState, useCallback, useRef } from 'react'
import { APIError, AIFeature, AIHistoryItem } from '../types/document'
import { cancelAISuggestion, fetchAIHistory, sendAIFeedback, streamAIAction } from '../api/documentAPI'

export interface AIRequestOptions {
  feature: AIFeature
  style?: string
  notes?: string
  targetLanguage?: string
  documentText?: string
}

interface UseAIReturn {
  aiResponse: string | null
  aiLoading: boolean
  aiError: APIError | null
  activeFeature: AIFeature
  history: AIHistoryItem[]
  dismissResponse: () => void
  restoreResponse: (response: string, feature?: AIFeature) => void
  cancelRequest: () => Promise<void>
  markSuggestion: (action: 'accepted' | 'rejected' | 'partial' | 'cancelled') => Promise<void>
  refreshHistory: () => Promise<void>
  requestRewrite: (
    documentId: string | null,
    selectedText: string,
    options: AIRequestOptions
  ) => Promise<void>
  clearError: () => void
  reset: () => void
}

export const useAI = (): UseAIReturn => {
  const [aiResponse, setAIResponse] = useState<string | null>(null)
  const [aiLoading, setAILoading] = useState(false)
  const [aiError, setAIError] = useState<APIError | null>(null)
  const [activeFeature, setActiveFeature] = useState<AIFeature>('rewrite')
  const [history, setHistory] = useState<AIHistoryItem[]>([])
  const abortControllerRef = useRef<AbortController | null>(null)
  const suggestionIdRef = useRef<string | null>(null)

  const refreshHistory = useCallback(async () => {
    try {
      const items = await fetchAIHistory(8)
      setHistory(items)
    } catch {
      // Keep the current UI stable if history cannot be fetched.
    }
  }, [])

  const cancelRequest = useCallback(async () => {
    abortControllerRef.current?.abort()

    if (suggestionIdRef.current) {
      try {
        await cancelAISuggestion(suggestionIdRef.current)
      } catch {
        // Best-effort cancel; local abort already happened.
      }
    }

    suggestionIdRef.current = null
    abortControllerRef.current = null
    setAILoading(false)
    setAIResponse(null)
    setAIError(null)
    await refreshHistory()
  }, [refreshHistory])

  const markSuggestion = useCallback(
    async (action: 'accepted' | 'rejected' | 'partial' | 'cancelled') => {
      if (!suggestionIdRef.current) {
        return
      }

      try {
        await sendAIFeedback({
          suggestionId: suggestionIdRef.current,
          action,
        })
        suggestionIdRef.current = null
        await refreshHistory()
      } catch {
        // Best-effort feedback; do not block the UI flow.
      }
    },
    [refreshHistory]
  )

  const requestRewrite = useCallback(
    async (
      documentId: string | null,
      selectedText: string,
      options: AIRequestOptions
    ) => {
      if (documentId === null) {
        setAIError({
          message: 'Document not loaded',
        })
        return
      }

      if (options.feature !== 'continue' && !selectedText.trim()) {
        setAIError({
          message: 'Select text before using this AI action',
        })
        return
      }

      setAILoading(true)
      setAIError(null)
      setAIResponse(null)
      setActiveFeature(options.feature)
      suggestionIdRef.current = null

      try {
        const controller = new AbortController()
        abortControllerRef.current = controller
        setAIResponse('')

        await streamAIAction({
          feature: options.feature,
          docId: documentId,
          selectedText: options.feature === 'continue' ? options.documentText || '' : selectedText,
          style: options.style,
          notes: options.notes,
          targetLanguage: options.targetLanguage,
          signal: controller.signal,
          onToken: (token, suggestionId) => {
            if (suggestionId) {
              suggestionIdRef.current = suggestionId
            }
            setAIResponse((prev) => `${prev || ''}${token}`)
          },
        })
        await refreshHistory()
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setAIResponse(null)
          setAIError(null)
        } else {
          const nextError = err as APIError
          const unavailable = nextError.status === 429 || nextError.status === 503 || nextError.status === 504
          setAIError(
            unavailable
              ? { ...nextError, message: 'AI is temporarily unavailable. Please retry shortly.' }
              : nextError
          )
          setAIResponse(null)
        }
      } finally {
        abortControllerRef.current = null
        setAILoading(false)
      }
    },
    [refreshHistory]
  )

  const clearError = useCallback(() => {
    setAIError(null)
  }, [])

  const dismissResponse = useCallback(() => {
    setAIResponse(null)
    setAIError(null)
  }, [])

  const restoreResponse = useCallback((response: string, feature: AIFeature = 'rewrite') => {
    setActiveFeature(feature)
    setAIResponse(response)
    setAIError(null)
  }, [])

  const reset = useCallback(() => {
    setAIResponse(null)
    setAIError(null)
    setAILoading(false)
    setActiveFeature('rewrite')
    setHistory([])
    abortControllerRef.current = null
    suggestionIdRef.current = null
  }, [])

  return {
    aiResponse,
    aiLoading,
    aiError,
    activeFeature,
    history,
    dismissResponse,
    restoreResponse,
    cancelRequest,
    markSuggestion,
    refreshHistory,
    requestRewrite,
    clearError,
    reset,
  }
}

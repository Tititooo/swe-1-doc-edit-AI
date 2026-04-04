/**
 * useAI Hook
 * Manages AI rewrite requests, responses, and error states
 * Handles: US-03 (AI Assistance/Rewrite)
 */

import { useState, useCallback, useRef } from 'react'
import { AIRewriteResponse, APIError, AIRewriteRequest, AIFeature } from '../types/document'
import { cancelAISuggestion, requestAIRewrite, sendAIFeedback, streamAIAction } from '../api/documentAPI'

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
  cancelRequest: () => Promise<void>
  markSuggestion: (action: 'accepted' | 'rejected' | 'partial' | 'cancelled') => Promise<void>
  requestRewrite: (
    documentId: string | null,
    selectedText: string,
    versionId: number | null,
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
  const abortControllerRef = useRef<AbortController | null>(null)
  const suggestionIdRef = useRef<string | null>(null)

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
  }, [])

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
      } catch {
        // Best-effort feedback; do not block the UI flow.
      }
    },
    []
  )

  const requestRewrite = useCallback(
    async (
      documentId: string | null,
      selectedText: string,
      versionId: number | null,
      options: AIRequestOptions
    ) => {
      if (versionId === null || documentId === null) {
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
        if (options.feature === 'continue') {
          const request: AIRewriteRequest = {
            selectedText,
            versionId,
            feature: options.feature,
            style: options.style,
            notes: options.notes,
            targetLanguage: options.targetLanguage,
            documentText: options.documentText,
          }
          const response: AIRewriteResponse = await requestAIRewrite(request)

          if (response.success && response.result) {
            suggestionIdRef.current = response.suggestionId || null
            setAIResponse(response.result)
          } else {
            throw new Error(response.error || 'AI service returned an error')
          }
        } else {
          const controller = new AbortController()
          abortControllerRef.current = controller
          setAIResponse('')

          await streamAIAction({
            feature: options.feature,
            docId: documentId,
            selectedText,
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
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setAIResponse(null)
          setAIError(null)
        } else {
          setAIError(err as APIError)
          setAIResponse(null)
        }
      } finally {
        abortControllerRef.current = null
        setAILoading(false)
      }
    },
    []
  )

  const clearError = useCallback(() => {
    setAIError(null)
  }, [])

  const reset = useCallback(() => {
    setAIResponse(null)
    setAIError(null)
    setAILoading(false)
    setActiveFeature('rewrite')
    abortControllerRef.current = null
    suggestionIdRef.current = null
  }, [])

  return {
    aiResponse,
    aiLoading,
    aiError,
    activeFeature,
    cancelRequest,
    markSuggestion,
    requestRewrite,
    clearError,
    reset,
  }
}

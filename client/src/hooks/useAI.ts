/**
 * useAI Hook
 * Manages AI rewrite requests, responses, and error states
 * Handles: US-03 (AI Assistance/Rewrite)
 */

import { useState, useCallback } from 'react'
import { AIRewriteResponse, APIError, AIRewriteRequest } from '../types/document'
import { requestAIRewrite } from '../api/documentAPI'

interface UseAIReturn {
  aiResponse: string | null
  aiLoading: boolean
  aiError: APIError | null
  requestRewrite: (selectedText: string, versionId: number | null) => Promise<void>
  clearError: () => void
  reset: () => void
}

export const useAI = (): UseAIReturn => {
  const [aiResponse, setAIResponse] = useState<string | null>(null)
  const [aiLoading, setAILoading] = useState(false)
  const [aiError, setAIError] = useState<APIError | null>(null)

  const requestRewrite = useCallback(
    async (selectedText: string, versionId: number | null) => {
      if (!selectedText.trim() || versionId === null) {
        setAIError({
          message: 'No text selected or document not loaded',
        })
        return
      }

      setAILoading(true)
      setAIError(null)
      setAIResponse(null)

      try {
        const request: AIRewriteRequest = {
          selectedText,
          versionId,
        }
        const response: AIRewriteResponse = await requestAIRewrite(request)

        if (response.success && response.result) {
          setAIResponse(response.result)
        } else {
          throw new Error(response.error || 'AI service returned an error')
        }
      } catch (err) {
        setAIError(err as APIError)
        setAIResponse(null)
      } finally {
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
  }, [])

  return {
    aiResponse,
    aiLoading,
    aiError,
    requestRewrite,
    clearError,
    reset,
  }
}

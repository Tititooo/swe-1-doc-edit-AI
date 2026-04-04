/**
 * useAI Hook
 * Manages AI rewrite requests, responses, and error states
 * Handles: US-03 (AI Assistance/Rewrite)
 */

import { useState, useCallback } from 'react'
import { AIRewriteResponse, APIError, AIRewriteRequest, AIFeature } from '../types/document'
import { requestAIRewrite } from '../api/documentAPI'

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
  requestRewrite: (
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

  const requestRewrite = useCallback(
    async (
      selectedText: string,
      versionId: number | null,
      options: AIRequestOptions
    ) => {
      if (versionId === null) {
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

      try {
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
    setActiveFeature('rewrite')
  }, [])

  return {
    aiResponse,
    aiLoading,
    aiError,
    activeFeature,
    requestRewrite,
    clearError,
    reset,
  }
}

import { apiClient, handleAPIError } from './client'
import type { APIError, RealtimeSession } from '../types/document'

export const createRealtimeSession = async (docId: string): Promise<RealtimeSession> => {
  try {
    const response = await apiClient.post<RealtimeSession>('/realtime/session', { doc_id: docId })
    return response.data
  } catch (error) {
    throw handleAPIError(error) as APIError
  }
}

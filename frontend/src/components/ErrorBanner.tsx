/**
 * ErrorBanner Component
 * Handles: US-05 (Error Communication)
 *
 * Acceptance Criteria:
 * - Shows clear error message if AI service fails
 * - Message: "AI service unavailable, please try again later."
 * - Loading state is cleared so user can retry
 * - Auto-hides after 5 seconds or on dismiss
 */

import { useEffect } from 'react'
import './ErrorBanner.css'

interface ErrorBannerProps {
  visible: boolean
  message?: string
  onDismiss: () => void
  autoDismissMs?: number
}

export const ErrorBanner = ({
  visible,
  message = 'AI service unavailable, please try again later.',
  onDismiss,
  autoDismissMs = 10000,
}: ErrorBannerProps) => {
  useEffect(() => {
    if (!visible) return

    const timer = setTimeout(onDismiss, autoDismissMs)
    return () => clearTimeout(timer)
  }, [visible, onDismiss, autoDismissMs])

  if (!visible) {
    return null
  }

  return (
    <div className="error-banner">
      <div className="banner-content">
        <span className="banner-icon">⚠️</span>
        <span className="banner-message">{message}</span>
      </div>
      <button className="banner-dismiss" onClick={onDismiss}>
        ✕
      </button>
    </div>
  )
}

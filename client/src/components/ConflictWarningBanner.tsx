/**
 * ConflictWarningBanner Component
 * Handles: US-04 (Conflict Prevention - The Gatekeeper)
 *
 * Acceptance Criteria:
 * - Shows warning banner if document changed
 * - States: "Document has changed."
 * - Apply button is locked to prevent data loss
 */

import './ConflictWarningBanner.css'

interface ConflictWarningBannerProps {
  visible: boolean
  message: string
  onDismiss?: () => void
}

export const ConflictWarningBanner = ({
  visible,
  message,
  onDismiss,
}: ConflictWarningBannerProps) => {
  if (!visible) {
    return null
  }

  return (
    <div className="conflict-banner">
      <div className="banner-content">
        <span className="banner-icon">🚩</span>
        <span className="banner-message">{message}</span>
      </div>
      {onDismiss && (
        <button className="banner-dismiss" onClick={onDismiss}>
          ✕
        </button>
      )}
    </div>
  )
}

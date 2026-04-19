import type { DocumentRole } from '../types/document'
import './ReadOnlyBanner.css'

interface ReadOnlyBannerProps {
  role: DocumentRole
}

export const ReadOnlyBanner = ({ role }: ReadOnlyBannerProps) => {
  const message =
    role === 'viewer'
      ? 'View-only access. You can read this document, but editing and restore actions are disabled.'
      : 'Commenter access is currently read-only in this preview. Editing and AI-assisted writing are disabled.'

  return (
    <div className="read-only-banner" data-testid="read-only-banner">
      <strong>{role === 'viewer' ? 'View-only access' : 'Commenter access'}</strong>
      <span>{message}</span>
    </div>
  )
}

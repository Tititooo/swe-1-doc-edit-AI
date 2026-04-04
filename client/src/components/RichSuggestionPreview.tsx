import type { AIFeature, TextSelection } from '../types/document'
import './RichSuggestionPreview.css'

interface RichSuggestionPreviewProps {
  selection: TextSelection | null
  aiResponse: string | null
  activeFeature: AIFeature
}

export const RichSuggestionPreview = ({
  selection,
  aiResponse,
  activeFeature,
}: RichSuggestionPreviewProps) => {
  if (!selection || !aiResponse) {
    return null
  }

  return (
    <div className="rich-preview-card">
      <div className="rich-preview-header">
        <span>Track Changes Preview</span>
        <span className="rich-preview-badge">{activeFeature}</span>
      </div>
      <div className="rich-preview-body">
        <span className="rich-preview-removed">{selection.text}</span>
        <span className="rich-preview-added">{aiResponse}</span>
      </div>
    </div>
  )
}

import type { DocumentListItem } from '../types/document'
import './DocumentDashboard.css'

interface DocumentDashboardProps {
  documents: DocumentListItem[]
  loading: boolean
  creating: boolean
  onCreate: () => Promise<void>
  onOpen: (document: DocumentListItem) => Promise<void>
  onRefresh: () => unknown
}

const formatDate = (value: string) =>
  new Date(value).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

export const DocumentDashboard = ({
  documents,
  loading,
  creating,
  onCreate,
  onOpen,
  onRefresh,
}: DocumentDashboardProps) => {
  return (
    <section className="dashboard-shell" data-testid="document-dashboard">
      <div className="dashboard-header">
        <div>
          <span className="dashboard-kicker">Document Workspace</span>
          <h2>Your documents</h2>
          <p>Open an existing draft or create a new one before jumping into collaboration and AI tools.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="dashboard-create-button"
            type="button"
            onClick={() => void onRefresh()}
            disabled={loading}
            data-testid="dashboard-refresh"
            style={{ background: 'transparent', border: '1px solid #cbd5e1', color: '#475569' }}
          >
            {loading ? '…' : '↻ Refresh'}
          </button>
          <button
            className="dashboard-create-button"
            type="button"
            onClick={() => void onCreate()}
            disabled={creating}
            data-testid="dashboard-create"
          >
            {creating ? 'Creating…' : 'New Document'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="dashboard-empty-state">
          <div className="dashboard-empty-icon">⌛</div>
          <h3>Loading documents</h3>
          <p>Fetching your accessible documents from the API.</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="dashboard-empty-state">
          <div className="dashboard-empty-icon">📄</div>
          <h3>No documents yet</h3>
          <p>Create your first document to start editing, sharing, and restoring versions.</p>
        </div>
      ) : (
        <div className="dashboard-grid">
          {documents.map((document) => (
            <button
              key={document.id}
              className="dashboard-card"
              type="button"
              onClick={() => void onOpen(document)}
              data-testid={`dashboard-doc-${document.id}`}
            >
              <div className="dashboard-card-top">
                <span className={`role-badge role-${document.role}`}>{document.role}</span>
                <span className="dashboard-open-label">Open</span>
              </div>
              <h3>{document.title}</h3>
              <p className="dashboard-updated">Updated {formatDate(document.updatedAt)}</p>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

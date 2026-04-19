import { fireEvent, render, screen } from '@testing-library/react'
import { DocumentDashboard } from '../DocumentDashboard'

const baseProps = {
  loading: false,
  creating: false,
  onCreate: vi.fn().mockResolvedValue(undefined),
  onOpen: vi.fn().mockResolvedValue(undefined),
  onRefresh: vi.fn().mockResolvedValue(undefined),
}

describe('DocumentDashboard', () => {
  test('renders documents with role badges and opens a selected document', () => {
    render(
      <DocumentDashboard
        {...baseProps}
        documents={[
          {
            id: 'doc-1',
            title: 'Project Proposal',
            role: 'editor',
            updatedAt: '2026-04-19T10:00:00.000Z',
          },
        ]}
      />
    )

    expect(screen.getByText('Project Proposal')).toBeInTheDocument()
    expect(screen.getByText('editor')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('dashboard-doc-doc-1'))
    expect(baseProps.onOpen).toHaveBeenCalledWith({
      id: 'doc-1',
      title: 'Project Proposal',
      role: 'editor',
      updatedAt: '2026-04-19T10:00:00.000Z',
    })
  })

  test('fires the create handler from the new document button', () => {
    render(<DocumentDashboard {...baseProps} documents={[]} />)
    fireEvent.click(screen.getByTestId('dashboard-create'))
    expect(baseProps.onCreate).toHaveBeenCalled()
  })
})

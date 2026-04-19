import { fireEvent, render, screen } from '@testing-library/react'
import { DocumentDashboard } from '../DocumentDashboard'

describe('DocumentDashboard', () => {
  test('renders documents with role badges and opens a selected document', () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    const onOpen = vi.fn().mockResolvedValue(undefined)

    render(
      <DocumentDashboard
        documents={[
          {
            id: 'doc-1',
            title: 'Project Proposal',
            role: 'editor',
            updatedAt: '2026-04-19T10:00:00.000Z',
          },
        ]}
        loading={false}
        creating={false}
        onCreate={onCreate}
        onOpen={onOpen}
      />
    )

    expect(screen.getByText('Project Proposal')).toBeInTheDocument()
    expect(screen.getByText('editor')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('dashboard-doc-doc-1'))
    expect(onOpen).toHaveBeenCalledWith({
      id: 'doc-1',
      title: 'Project Proposal',
      role: 'editor',
      updatedAt: '2026-04-19T10:00:00.000Z',
    })
  })

  test('fires the create handler from the new document button', () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    const onOpen = vi.fn().mockResolvedValue(undefined)

    render(
      <DocumentDashboard
        documents={[]}
        loading={false}
        creating={false}
        onCreate={onCreate}
        onOpen={onOpen}
      />
    )

    fireEvent.click(screen.getByTestId('dashboard-create'))
    expect(onCreate).toHaveBeenCalled()
  })
})

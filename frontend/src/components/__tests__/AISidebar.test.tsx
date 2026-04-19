import { fireEvent, render, screen } from '@testing-library/react'
import { AISidebar } from '../AISidebar'

const baseProps = {
  selectedText: 'Selected text',
  documentText: 'Document body',
  aiResponse: null,
  activeFeature: 'rewrite' as const,
  history: [],
  isLoading: false,
  onCancel: vi.fn().mockResolvedValue(undefined),
  onReject: vi.fn().mockResolvedValue(undefined),
  onRewrite: vi.fn().mockResolvedValue(undefined),
  onApply: vi.fn(),
  isApplyDisabled: false,
}

describe('AISidebar', () => {
  test('does not render when documentText is empty', () => {
    const { container } = render(
      <AISidebar
        {...baseProps}
        documentText=""
      />
    )

    expect(container).toBeEmptyDOMElement()
  })

  test('renders compare actions and fires apply/dismiss callbacks when aiResponse exists', () => {
    const onApply = vi.fn()
    const onReject = vi.fn().mockResolvedValue(undefined)

    render(
      <AISidebar
        {...baseProps}
        aiResponse="Improved wording"
        onApply={onApply}
        onReject={onReject}
      />
    )

    expect(screen.getByTestId('ai-compare-original')).toHaveTextContent('Selected text')
    expect(screen.getByTestId('ai-compare-suggestion')).toHaveTextContent('Improved wording')

    fireEvent.click(screen.getByTestId('ai-apply'))
    expect(onApply).toHaveBeenCalledWith('Improved wording', 'accepted')

    fireEvent.click(screen.getByTestId('ai-dismiss'))
    expect(onReject).toHaveBeenCalled()
  })

  test('allows partial acceptance from the selected suggestion text', () => {
    const onApply = vi.fn()

    render(
      <AISidebar
        {...baseProps}
        aiResponse="Improved wording"
        onApply={onApply}
      />
    )

    const suggestion = screen.getByTestId('ai-compare-suggestion') as HTMLTextAreaElement
    fireEvent.select(suggestion, { target: { selectionStart: 0, selectionEnd: 8 } })

    fireEvent.click(screen.getByTestId('ai-apply-partial'))
    expect(onApply).toHaveBeenCalledWith('Improved', 'partial')
  })
})

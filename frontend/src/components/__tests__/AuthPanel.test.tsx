import { fireEvent, render, screen } from '@testing-library/react'
import { AuthPanel } from '../AuthPanel'

describe('AuthPanel', () => {
  test('submits login credentials to onLogin', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined)
    const onRegister = vi.fn().mockResolvedValue(undefined)

    render(<AuthPanel loading={false} error={null} onLogin={onLogin} onRegister={onRegister} />)

    fireEvent.change(screen.getByTestId('auth-email'), { target: { value: 'writer@example.com' } })
    fireEvent.change(screen.getByTestId('auth-password'), { target: { value: 'PreviewPass123!' } })
    fireEvent.click(screen.getByTestId('auth-submit'))

    expect(onLogin).toHaveBeenCalledWith({
      email: 'writer@example.com',
      password: 'PreviewPass123!',
    })
  })

  test('switches to register mode and submits the registration payload', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined)
    const onRegister = vi.fn().mockResolvedValue(undefined)

    render(<AuthPanel loading={false} error={null} onLogin={onLogin} onRegister={onRegister} />)

    fireEvent.click(screen.getByTestId('auth-mode-register'))
    fireEvent.change(screen.getByTestId('auth-name'), { target: { value: 'Tanisha' } })
    fireEvent.change(screen.getByTestId('auth-email'), { target: { value: 'tanisha@example.com' } })
    fireEvent.change(screen.getByTestId('auth-password'), { target: { value: 'PreviewPass123!' } })
    fireEvent.click(screen.getByTestId('auth-submit'))

    expect(onRegister).toHaveBeenCalledWith({
      name: 'Tanisha',
      email: 'tanisha@example.com',
      password: 'PreviewPass123!',
    })
  })
})

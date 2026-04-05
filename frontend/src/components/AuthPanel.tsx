import { FormEvent, useMemo, useState } from 'react'
import type { APIError } from '../types/document'
import './AuthPanel.css'

interface AuthPanelProps {
  loading: boolean
  error: APIError | null
  onLogin: (payload: { email: string; password: string }) => Promise<void>
  onRegister: (payload: { email: string; password: string; name?: string }) => Promise<void>
}

export const AuthPanel = ({ loading, error, onLogin, onRegister }: AuthPanelProps) => {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const heading = useMemo(
    () => (mode === 'login' ? 'Sign in to continue' : 'Create a preview account'),
    [mode]
  )

  const submitLabel = loading
    ? 'Working...'
    : mode === 'login'
      ? 'Sign In'
      : 'Create Account'

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (mode === 'login') {
      await onLogin({ email, password })
      return
    }

    await onRegister({
      email,
      password,
      name: name.trim() || undefined,
    })
  }

  return (
    <section className="auth-panel">
      <div className="auth-panel-card">
        <div className="auth-panel-header">
          <span className="auth-panel-badge">Private Preview</span>
          <h2>{heading}</h2>
          <p>The current preview uses real backend auth before loading the editor and AI tools.</p>
        </div>

        <div className="auth-panel-switcher">
          <button
            type="button"
            className={mode === 'login' ? 'auth-switch active' : 'auth-switch'}
            onClick={() => setMode('login')}
            data-testid="auth-mode-login"
          >
            Sign In
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'auth-switch active' : 'auth-switch'}
            onClick={() => setMode('register')}
            data-testid="auth-mode-register"
          >
            Register
          </button>
        </div>

        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          {mode === 'register' && (
            <label className="auth-field">
              <span>Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Preview user"
                autoComplete="name"
                data-testid="auth-name"
              />
            </label>
          )}

          <label className="auth-field">
            <span>Email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              type="email"
              required
              data-testid="auth-email"
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              type="password"
              minLength={8}
              required
              data-testid="auth-password"
            />
          </label>

          {error && <div className="auth-error">{error.message}</div>}

          <button className="auth-submit" type="submit" disabled={loading} data-testid="auth-submit">
            {submitLabel}
          </button>
        </form>
      </div>
    </section>
  )
}

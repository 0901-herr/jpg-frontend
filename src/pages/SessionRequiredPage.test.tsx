import { render, screen } from '@testing-library/react'
import React from 'react'
import { vi } from 'vitest'
import SessionRequiredPage from './SessionRequiredPage'

const useAuthMock = vi.fn()
vi.mock('../context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}))

describe('SessionRequiredPage branding', () => {
  it('uses "Arche AI", never the old "AI Chat" name, for the sign-in-required copy', () => {
    useAuthMock.mockReturnValue({ sessionExpired: false, signedOut: false })
    render(<SessionRequiredPage />)

    expect(screen.getByText('Sign in required')).toBeInTheDocument()
    expect(
      screen.getByText('You need an active LogicalDOC session to use Arche AI.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/AI Chat/)).not.toBeInTheDocument()
  })

  it('uses "Arche AI" for the session-expired copy', () => {
    useAuthMock.mockReturnValue({ sessionExpired: true, signedOut: false })
    render(<SessionRequiredPage />)

    expect(screen.getByText('Session expired')).toBeInTheDocument()
    expect(screen.getByText('Your Arche AI session has expired.')).toBeInTheDocument()
    expect(screen.queryByText(/AI Chat/)).not.toBeInTheDocument()
  })

  it('uses "Arche AI" for the signed-out copy', () => {
    useAuthMock.mockReturnValue({ sessionExpired: false, signedOut: true })
    render(<SessionRequiredPage />)

    expect(screen.getByText('You have signed out')).toBeInTheDocument()
    expect(screen.getByText('You are no longer signed in to Arche AI.')).toBeInTheDocument()
    expect(screen.queryByText(/AI Chat/)).not.toBeInTheDocument()
  })

  it('names Arche AI (not the old name) in the launch instructions', () => {
    useAuthMock.mockReturnValue({ sessionExpired: false, signedOut: false })
    render(<SessionRequiredPage />)

    expect(screen.getByText('Arche AI', { selector: 'strong' })).toBeInTheDocument()
  })
})

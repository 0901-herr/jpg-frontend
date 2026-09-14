import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import QueryTierDropdown from './QueryTierDropdown'

describe('QueryTierDropdown tooltip', () => {
  it('shows the accurate-mode tooltip on hover', async () => {
    const user = userEvent.setup()
    render(<QueryTierDropdown tier="accurate" onChange={() => {}} />)

    await user.hover(screen.getByRole('button', { name: /query speed: accurate/i }))

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Accurate mode searches more deeply and may take longer to answer.',
    )
  })

  it('shows the fast-mode tooltip on hover', async () => {
    const user = userEvent.setup()
    render(<QueryTierDropdown tier="fast" onChange={() => {}} />)

    await user.hover(screen.getByRole('button', { name: /query speed: fast/i }))

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Fast mode answers quickest but may miss details.',
    )
  })

  it('shows no tooltip for standard mode', async () => {
    const user = userEvent.setup()
    render(<QueryTierDropdown tier="standard" onChange={() => {}} />)

    await user.hover(screen.getByRole('button', { name: /query speed: normal/i }))

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})

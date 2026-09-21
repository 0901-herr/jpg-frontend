import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import QueryTierDropdown from './QueryTierDropdown'

describe('QueryTierDropdown', () => {
  it('shows each speed description inside the dropdown menu', async () => {
    const user = userEvent.setup()
    render(<QueryTierDropdown tier="standard" onChange={() => {}} />)

    await user.click(screen.getByRole('button', { name: /query speed: normal/i }))

    expect(await screen.findByText('Fastest answer. May miss some detail.')).toBeInTheDocument()
    expect(
      screen.getByText('Balanced speed and accuracy. Typically under a minute.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Most thorough answer. Can take a minute or more.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})

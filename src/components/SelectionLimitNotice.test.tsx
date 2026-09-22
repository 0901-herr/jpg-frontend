import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import SelectionLimitNotice from './SelectionLimitNotice'
import { MAX_EXPLICIT_SELECTION, SELECTION_LIMIT_MESSAGE } from '../config/selection'

describe('SelectionLimitNotice', () => {
  it('renders nothing below the limit', () => {
    const { container } = render(
      <SelectionLimitNotice selectedCount={MAX_EXPLICIT_SELECTION - 1} />,
    )

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText(SELECTION_LIMIT_MESSAGE)).not.toBeInTheDocument()
  })

  it('renders the persistent warning notice at exactly the limit', () => {
    const { container } = render(<SelectionLimitNotice selectedCount={MAX_EXPLICIT_SELECTION} />)

    expect(screen.getByText(SELECTION_LIMIT_MESSAGE)).toBeInTheDocument()
    const notice = container.querySelector('.docu-selection-limit-notice')
    expect(notice).not.toBeNull()
    expect(notice).toHaveAttribute('role', 'status')
  })

  it('keeps showing the notice above the limit', () => {
    render(<SelectionLimitNotice selectedCount={MAX_EXPLICIT_SELECTION + 5} />)

    expect(screen.getByText(SELECTION_LIMIT_MESSAGE)).toBeInTheDocument()
  })
})

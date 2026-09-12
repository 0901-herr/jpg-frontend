import { render, screen } from '@testing-library/react'
import React from 'react'
import CategoryTag from './CategoryTag'

describe('CategoryTag', () => {
  it('renders a curated label for a known category', () => {
    render(<CategoryTag category="harvesting_record" />)
    expect(screen.getByText('Harvesting Record')).toBeInTheDocument()
  })

  it('title-cases an unrecognized category rather than dropping it', () => {
    render(<CategoryTag category="some_new_category" />)
    expect(screen.getByText('Some New Category')).toBeInTheDocument()
  })

  it('shows Uncategorized when there is no category', () => {
    render(<CategoryTag category={null} />)
    expect(screen.getByText('Uncategorized')).toBeInTheDocument()
  })

  it('treats the backend "unknown" placeholder as Uncategorized', () => {
    render(<CategoryTag category="unknown" />)
    expect(screen.getByText('Uncategorized')).toBeInTheDocument()
  })
})

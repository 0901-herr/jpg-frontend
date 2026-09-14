import { render, screen } from '@testing-library/react'
import React from 'react'
import ChatInput from './ChatInput'

describe('ChatInput', () => {
  it('labels the disclaimer as single question mode', () => {
    render(
      <ChatInput
        selectedCount={0}
        onClearSelection={() => {}}
        onSend={() => {}}
        onSummarize={() => {}}
        onStop={() => {}}
        queryTier="standard"
        onQueryTierChange={() => {}}
      />,
    )

    expect(screen.getByText(/Single question mode/)).toBeInTheDocument()
  })
})

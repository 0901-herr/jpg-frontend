import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import ChatInput from './ChatInput'

function renderChatInput(props: Partial<React.ComponentProps<typeof ChatInput>> = {}) {
  return render(
    <ChatInput
      selectedCount={0}
      onClearSelection={() => {}}
      onSend={() => {}}
      onSummarize={() => {}}
      onExtractMetadata={() => {}}
      onStop={() => {}}
      queryTier="standard"
      onQueryTierChange={() => {}}
      {...props}
    />,
  )
}

describe('ChatInput', () => {
  it('labels the disclaimer as single question mode', () => {
    renderChatInput()

    expect(screen.getByText(/Single question mode/)).toBeInTheDocument()
  })

  it('disables Extract metadata and shows the reason when no file is selected', () => {
    renderChatInput({
      selectedCount: 0,
      extractMetadataDisabledReason: 'Select a document to extract metadata',
    })

    const button = screen.getByRole('button', { name: 'Extract MQA metadata' })
    expect(button).toBeDisabled()
  })

  it('disables Extract metadata and shows the reason when two files are selected', async () => {
    const user = userEvent.setup()
    renderChatInput({
      selectedCount: 2,
      extractMetadataDisabledReason: 'Select only one document to extract metadata',
    })

    const button = screen.getByRole('button', { name: 'Extract MQA metadata' })
    expect(button).toBeDisabled()

    await user.hover(button.parentElement ?? button)
    expect(
      await screen.findByText('Select only one document to extract metadata'),
    ).toBeInTheDocument()
  })

  it('enables Extract metadata for exactly one ready file', () => {
    renderChatInput({ selectedCount: 1, extractMetadataDisabledReason: null })

    expect(screen.getByRole('button', { name: 'Extract MQA metadata' })).toBeEnabled()
  })

  it('calls onExtractMetadata when clicked while enabled', async () => {
    const user = userEvent.setup()
    const onExtractMetadata = vi.fn()
    renderChatInput({
      selectedCount: 1,
      extractMetadataDisabledReason: null,
      onExtractMetadata,
    })

    await user.click(screen.getByRole('button', { name: 'Extract MQA metadata' }))

    expect(onExtractMetadata).toHaveBeenCalledTimes(1)
  })
})

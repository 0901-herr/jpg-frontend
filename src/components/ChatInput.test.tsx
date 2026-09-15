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
      onCategorize={() => {}}
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

  it('places Categorize between Summarize and Extract metadata', () => {
    renderChatInput({ selectedCount: 1 })

    const buttons = screen.getAllByRole('button').map((b) => b.textContent)
    const summarizeIdx = buttons.indexOf('Summarize')
    const categorizeIdx = buttons.indexOf('Categorize')
    const extractIdx = buttons.findIndex((b) => b === 'Extract metadata')

    expect(summarizeIdx).toBeGreaterThanOrEqual(0)
    expect(categorizeIdx).toBeGreaterThan(summarizeIdx)
    expect(extractIdx).toBeGreaterThan(categorizeIdx)
  })

  it('has the expected aria-label and class for the Categorize button', () => {
    renderChatInput({ selectedCount: 1, categorizeDisabledReason: null })

    const button = screen.getByRole('button', { name: 'Categorize selected document' })
    expect(button).toHaveClass('docu-chat-composer-categorize')
  })

  it('disables Categorize and shows the reason when no file is selected', async () => {
    const user = userEvent.setup()
    renderChatInput({
      selectedCount: 0,
      categorizeDisabledReason: 'Select one file to categorize',
    })

    const button = screen.getByRole('button', { name: 'Categorize selected document' })
    expect(button).toBeDisabled()

    await user.hover(button.parentElement ?? button)
    expect(await screen.findByText('Select one file to categorize')).toBeInTheDocument()
  })

  it('disables Categorize and shows the reason when two files are selected', async () => {
    const user = userEvent.setup()
    renderChatInput({
      selectedCount: 2,
      categorizeDisabledReason: 'Select only one file to categorize',
    })

    const button = screen.getByRole('button', { name: 'Categorize selected document' })
    expect(button).toBeDisabled()

    await user.hover(button.parentElement ?? button)
    expect(await screen.findByText('Select only one file to categorize')).toBeInTheDocument()
  })

  it('enables Categorize for exactly one ready file', () => {
    renderChatInput({ selectedCount: 1, categorizeDisabledReason: null })

    expect(
      screen.getByRole('button', { name: 'Categorize selected document' }),
    ).toBeEnabled()
  })

  it('calls onCategorize when clicked while enabled', async () => {
    const user = userEvent.setup()
    const onCategorize = vi.fn()
    renderChatInput({
      selectedCount: 1,
      categorizeDisabledReason: null,
      onCategorize,
    })

    await user.click(screen.getByRole('button', { name: 'Categorize selected document' }))

    expect(onCategorize).toHaveBeenCalledTimes(1)
  })
})

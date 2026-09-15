import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import path from 'node:path'
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

function mockMediaQueryList(matches: boolean) {
  return {
    matches,
    media: '',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList
}

describe('ChatInput — narrow phone widths (<480px)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows short labels for Summarize, Categorize and Extract metadata, with the full label still the accessible name', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(mockMediaQueryList(true))

    renderChatInput({ selectedCount: 1, categorizeDisabledReason: null, extractMetadataDisabledReason: null })

    const summarize = screen.getByRole('button', { name: 'Summarize selected document' })
    const categorize = screen.getByRole('button', { name: 'Categorize selected document' })
    const extract = screen.getByRole('button', { name: 'Extract MQA metadata' })

    expect(summarize).toHaveTextContent('Sum.')
    expect(summarize).not.toHaveTextContent('Summarize')
    expect(categorize).toHaveTextContent('Cat.')
    expect(categorize).not.toHaveTextContent('Categorize')
    expect(extract).toHaveTextContent('Meta')
    expect(extract).not.toHaveTextContent('Extract metadata')
  })

  it('carries the full label in the tooltip when enabled', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(mockMediaQueryList(true))
    const user = userEvent.setup()

    renderChatInput({ selectedCount: 1, categorizeDisabledReason: null })

    const summarize = screen.getByRole('button', { name: 'Summarize selected document' })
    await user.hover(summarize.parentElement ?? summarize)

    expect(await screen.findByText('Summarize')).toBeInTheDocument()
  })

  it('combines the full label and the disabled reason in the tooltip when disabled', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(mockMediaQueryList(true))
    const user = userEvent.setup()

    renderChatInput({
      selectedCount: 0,
      categorizeDisabledReason: 'Select one file to categorize',
    })

    const categorize = screen.getByRole('button', { name: 'Categorize selected document' })
    await user.hover(categorize.parentElement ?? categorize)

    expect(
      await screen.findByText('Categorize — Select one file to categorize'),
    ).toBeInTheDocument()
  })

  it('still shows the full-word labels at desktop/tablet widths', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(mockMediaQueryList(false))

    renderChatInput({ selectedCount: 1, categorizeDisabledReason: null, extractMetadataDisabledReason: null })

    expect(screen.getByRole('button', { name: 'Summarize selected document' })).toHaveTextContent(
      'Summarize',
    )
    expect(
      screen.getByRole('button', { name: 'Categorize selected document' }),
    ).toHaveTextContent('Categorize')
    expect(screen.getByRole('button', { name: 'Extract MQA metadata' })).toHaveTextContent(
      'Extract metadata',
    )
  })
})

describe('composer action button <480px CSS contract', () => {
  it('declares a smaller font-size for Summarize/Categorize/Extract metadata inside the <480px media block, since antd resets font-size on <button> and jsdom cannot compute the cascade to catch a regression here', () => {
    const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8')
    const media = css.match(/@media \(max-width: 479\.98px\)\s*\{([\s\S]*?)\n\}\n/)

    expect(media).not.toBeNull()
    const block = media![1]
    expect(block).toMatch(/\.docu-chat-composer-summarize/)
    expect(block).toMatch(/\.docu-chat-composer-categorize/)
    expect(block).toMatch(/\.docu-chat-composer-extract/)
    expect(block).toMatch(/font-size\s*:/)
  })

  it('the <480px media block is not nested inside an @layer block, since antd\'s reset.css is unlayered and anything inside @layer loses to it regardless of specificity', () => {
    const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    )
    const selectorIndex = css.indexOf('@media (max-width: 479.98px)')
    expect(selectorIndex).toBeGreaterThan(-1)

    let depth = 0
    for (let i = 0; i < selectorIndex; i++) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
    }
    expect(depth).toBe(0)
  })
})

describe('docu-chat-composer-categorize CSS parity with summarize/extract', () => {
  it('appears in the same base box-model, hover, disabled, and focus selector groups as summarize/extract, pinning the Task 5 styling fix', () => {
    const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8')

    // Base box model (height/padding/border-radius/gap/color/background) —
    // the three classes must be grouped together in one selector list, not
    // three separate rules that could drift apart.
    expect(css).toMatch(
      /\.docu-chat-composer-summarize,\s*\n\.docu-chat-composer-categorize,\s*\n\.docu-chat-composer-extract\s*\{/,
    )
    expect(css).toMatch(/\.docu-chat-composer-categorize:hover:not\(:disabled\)/)
    expect(css).toMatch(/\.docu-chat-composer-categorize:disabled/)
    expect(css).toMatch(/\.docu-chat-composer-categorize:focus,/)
    expect(css).toMatch(/\.docu-chat-composer-categorize:focus-visible,/)
  })
})

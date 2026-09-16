import { render, screen, within } from '@testing-library/react'
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
  it('shows the not-context-aware disclaimer with no "Single question mode" prefix', () => {
    renderChatInput()

    expect(screen.getByText(/not context-aware/)).toBeInTheDocument()
    expect(screen.queryByText(/Single question mode/)).not.toBeInTheDocument()
  })

  it('disables Extract metadata and shows the reason when no file is selected', () => {
    renderChatInput({
      selectedCount: 0,
      extractMetadataDisabledReason: 'Select one document',
    })

    const button = screen.getByRole('button', { name: 'Extract metadata' })
    expect(button).toBeDisabled()
  })

  it('disables Extract metadata and shows the reason when two files are selected', async () => {
    const user = userEvent.setup()
    renderChatInput({
      selectedCount: 2,
      extractMetadataDisabledReason: 'Select only one document',
    })

    const button = screen.getByRole('button', { name: 'Extract metadata' })
    expect(button).toBeDisabled()

    await user.hover(button.parentElement ?? button)
    expect(await screen.findByText('Select only one document')).toBeInTheDocument()
  })

  it('enables Extract metadata for exactly one ready file', () => {
    renderChatInput({ selectedCount: 1, extractMetadataDisabledReason: null })

    expect(screen.getByRole('button', { name: 'Extract metadata' })).toBeEnabled()
  })

  it('calls onExtractMetadata when clicked while enabled', async () => {
    const user = userEvent.setup()
    const onExtractMetadata = vi.fn()
    renderChatInput({
      selectedCount: 1,
      extractMetadataDisabledReason: null,
      onExtractMetadata,
    })

    await user.click(screen.getByRole('button', { name: 'Extract metadata' }))

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
      categorizeDisabledReason: 'Select one file',
    })

    const button = screen.getByRole('button', { name: 'Categorize selected document' })
    expect(button).toBeDisabled()

    await user.hover(button.parentElement ?? button)
    expect(await screen.findByText('Select one file')).toBeInTheDocument()
  })

  it('disables Categorize and shows the reason when two files are selected', async () => {
    const user = userEvent.setup()
    renderChatInput({
      selectedCount: 2,
      categorizeDisabledReason: 'Select only one file',
    })

    const button = screen.getByRole('button', { name: 'Categorize selected document' })
    expect(button).toBeDisabled()

    await user.hover(button.parentElement ?? button)
    expect(await screen.findByText('Select only one file')).toBeInTheDocument()
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

  it('keeps full labels for Summarize and Categorize, and shortens only Extract metadata to "Extract" (accessible name stays full)', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(mockMediaQueryList(true))

    renderChatInput({ selectedCount: 1, categorizeDisabledReason: null, extractMetadataDisabledReason: null })

    const summarize = screen.getByRole('button', { name: 'Summarize selected document' })
    const categorize = screen.getByRole('button', { name: 'Categorize selected document' })
    const extract = screen.getByRole('button', { name: 'Extract metadata' })

    expect(summarize).toHaveTextContent('Summarize')
    expect(categorize).toHaveTextContent('Categorize')
    expect(extract).toHaveTextContent('Extract')
    expect(extract).not.toHaveTextContent('Extract metadata')
  })

  it('shows no tooltip on an enabled Summarize/Categorize button — the visible label is already the full word', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(mockMediaQueryList(true))
    const user = userEvent.setup()

    renderChatInput({ selectedCount: 1, categorizeDisabledReason: null })

    const summarize = screen.getByRole('button', { name: 'Summarize selected document' })
    await user.hover(summarize.parentElement ?? summarize)
    await new Promise((resolve) => setTimeout(resolve, 300))

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('carries the full word in the tooltip for the enabled, phone-abbreviated Extract metadata button', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(mockMediaQueryList(true))
    const user = userEvent.setup()

    renderChatInput({ selectedCount: 1, extractMetadataDisabledReason: null })

    const extract = screen.getByRole('button', { name: 'Extract metadata' })
    await user.hover(extract.parentElement ?? extract)

    expect(await screen.findByText('Extract metadata')).toBeInTheDocument()
  })

  it('shows just the short reason, with no action-name prefix, in the tooltip when disabled', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(mockMediaQueryList(true))
    const user = userEvent.setup()

    renderChatInput({
      selectedCount: 0,
      categorizeDisabledReason: 'Select one file',
    })

    const categorize = screen.getByRole('button', { name: 'Categorize selected document' })
    await user.hover(categorize.parentElement ?? categorize)

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Select one file')
    expect(tooltip.textContent).not.toContain('Categorize —')
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
    expect(screen.getByRole('button', { name: 'Extract metadata' })).toHaveTextContent(
      'Extract metadata',
    )
  })

  it('splits the toolbar into two rows: files chip + tier dropdown + send on row 1, action buttons (full labels) on row 2', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(mockMediaQueryList(true))

    const { container } = renderChatInput({
      selectedCount: 2,
      selectedFiles: ['a.pdf', 'b.pdf'],
      categorizeDisabledReason: null,
      extractMetadataDisabledReason: null,
    })

    const row1 = container.querySelector('.docu-chat-composer-row1')
    const row2 = container.querySelector('.docu-chat-composer-row2')
    expect(row1).not.toBeNull()
    expect(row2).not.toBeNull()

    expect(row1).toContainElement(screen.getByText('2 files'))
    expect(row1).toContainElement(screen.getByRole('button', { name: /query speed/i }))
    expect(row1).toContainElement(screen.getByRole('button', { name: 'Send message' }))

    expect(row2).toContainElement(
      screen.getByRole('button', { name: 'Summarize selected document' }),
    )
    expect(row2).toContainElement(
      screen.getByRole('button', { name: 'Categorize selected document' }),
    )
    expect(row2).toContainElement(screen.getByRole('button', { name: 'Extract metadata' }))
    expect(row2).toHaveTextContent('Summarize')
    expect(row2).toHaveTextContent('Categorize')
  })

  it('keeps a single toolbar row at desktop/tablet widths (no row1/row2 split)', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(mockMediaQueryList(false))

    const { container } = renderChatInput({ selectedCount: 1 })

    expect(container.querySelector('.docu-chat-composer-row1')).toBeNull()
    expect(container.querySelector('.docu-chat-composer-row2')).toBeNull()
  })
})

describe('ChatInput — selected files popover', () => {
  it('renders an ordered, numbered list with one <li> per selected file, in selection order, with the class hooks the CSS numbering/truncation rules target', async () => {
    const user = userEvent.setup()
    const files = ['charlie.pdf', 'alpha.pdf', 'bravo.pdf']
    renderChatInput({ selectedCount: files.length, selectedFiles: files })

    await user.hover(screen.getByText(`${files.length} files`))

    const tooltip = await screen.findByRole('tooltip')
    const list = tooltip.querySelector('ol')
    expect(list).not.toBeNull()
    // `role="list"` guards against Safari/VoiceOver dropping list semantics
    // now that the CSS gives the <ol> no native `list-style` (see
    // index.css) — a screen-reader-visible regression a plain class-hook
    // assertion wouldn't catch.
    expect(list).toHaveAttribute('role', 'list')
    expect(list).toHaveClass('docu-selected-files-list')

    const items = within(tooltip).getAllByRole('listitem')
    expect(items).toHaveLength(files.length)
    // The numbers are CSS-generated `::before` counter content (see
    // index.css), not DOM text, so each <li>'s own text content is still
    // just the filename.
    expect(items.map((li) => li.textContent)).toEqual(files)
    for (const li of items) {
      expect(li).toHaveClass('docu-selected-files-item')
      // Regression guard for the round-3 root cause: `truncate` (which
      // sets `overflow: hidden`) must live on the inner <span>, never on
      // the <li> itself — an `overflow: hidden` `<li>` clips its own
      // `list-style` marker box in every browser tested live, which is
      // exactly how the "1." … "5." markers went missing before this fix.
      expect(li).not.toHaveClass('truncate')
      expect(li).not.toHaveClass('break-all')
      const span = li.querySelector('span')
      expect(span).not.toBeNull()
      expect(span).toHaveClass('truncate')
      expect(span?.textContent).toBe(li.textContent)
    }
  })

  it('caps the popover root at 440px on desktop and calc(100vw - 32px) on phone, via Tooltip styles.root (not a stylesheet rule)', async () => {
    const user = userEvent.setup()

    vi.spyOn(window, 'matchMedia').mockReturnValue(mockMediaQueryList(false))
    const { unmount } = renderChatInput({
      selectedCount: 1,
      selectedFiles: ['report.pdf'],
    })
    await user.hover(screen.getByText('1 file'))
    let tooltipRoot = (await screen.findByRole('tooltip')).closest('.docu-selected-files-tooltip')
    expect(tooltipRoot).not.toBeNull()
    expect((tooltipRoot as HTMLElement).style.maxWidth).toBe('440px')
    unmount()

    vi.spyOn(window, 'matchMedia').mockReturnValue(mockMediaQueryList(true))
    renderChatInput({ selectedCount: 1, selectedFiles: ['report.pdf'] })
    await user.hover(screen.getByText('1 file'))
    tooltipRoot = (await screen.findByRole('tooltip')).closest('.docu-selected-files-tooltip')
    expect(tooltipRoot).not.toBeNull()
    expect((tooltipRoot as HTMLElement).style.maxWidth).toBe('calc(100vw - 32px)')
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

describe('ChatInput — view-only (shared chat, view-only visibility)', () => {
  it('disables the composer and shows the view-only placeholder, even with files selected', () => {
    renderChatInput({
      selectedCount: 2,
      viewOnly: true,
      viewOnlyPlaceholder: 'View only — the owner has not allowed questions here',
    })

    const textarea = screen.getByPlaceholderText(
      'View only — the owner has not allowed questions here',
    )
    expect(textarea).toBeDisabled()
  })

  it('never calls onSend while view-only, even if Enter is pressed', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    renderChatInput({ selectedCount: 2, viewOnly: true, onSend })

    const textarea = screen.getByPlaceholderText('View only')
    await user.type(textarea, 'Can I ask this?{Enter}')

    expect(onSend).not.toHaveBeenCalled()
  })

  it('renders the normal placeholder and an enabled composer when not view-only', () => {
    renderChatInput({ selectedCount: 1, viewOnly: false })

    expect(
      screen.getByPlaceholderText('Ask a question about the selected documents'),
    ).not.toBeDisabled()
  })
})

describe('ChatInput — shared queryable chat with no manual file selection', () => {
  it('enables the composer with a scope-specific placeholder when allowEmptySelection is set', () => {
    renderChatInput({
      selectedCount: 0,
      allowEmptySelection: true,
      emptySelectionPlaceholder: 'Ask about the shared files',
    })

    const textarea = screen.getByPlaceholderText('Ask about the shared files')
    expect(textarea).not.toBeDisabled()
  })

  it('still shows "Select documents first" and disables the composer when allowEmptySelection is off', () => {
    renderChatInput({ selectedCount: 0 })

    expect(screen.getByPlaceholderText('Select documents first')).toBeDisabled()
  })

  it('calls onSend with zero selected documents when allowEmptySelection is set', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    renderChatInput({
      selectedCount: 0,
      allowEmptySelection: true,
      emptySelectionPlaceholder: 'Ask about the shared files',
      onSend,
    })

    const textarea = screen.getByPlaceholderText('Ask about the shared files')
    await user.type(textarea, 'What is in these files?{Enter}')

    expect(onSend).toHaveBeenCalledWith('What is in these files?')
  })

  it('renders the host-chosen files as read-only chips instead of the editable files pill', () => {
    renderChatInput({
      selectedCount: 0,
      allowEmptySelection: true,
      emptySelectionPlaceholder: 'Ask about the shared files',
      sharedScopeFiles: [
        { documentId: 'doc-9', filename: 'Contract.pdf' },
        { documentId: 'doc-10', filename: null },
      ],
    })

    expect(screen.getByText('Contract.pdf')).toBeInTheDocument()
    expect(screen.getByText('File doc-10')).toBeInTheDocument()
    // The normal editable chip (with its own "Clear selection" control)
    // never renders alongside the read-only ones.
    expect(screen.queryByLabelText('Clear selection')).not.toBeInTheDocument()
  })

  it('disables the composer with a distinct placeholder when the host has not chosen any files yet', () => {
    renderChatInput({
      selectedCount: 0,
      allowEmptySelection: true,
      emptySelectionPlaceholder: 'Ask about the shared files',
      sharedScopeFiles: [],
      sharedScopeEmpty: true,
    })

    const textarea = screen.getByPlaceholderText('The chat owner has not chosen files yet')
    expect(textarea).toBeDisabled()
  })
})

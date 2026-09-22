import { render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from 'antd'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import React from 'react'
import { vi } from 'vitest'
import ChatInput from './ChatInput'
import { fetchDocumentViewUrl } from '../api/browse'

vi.mock('../api/browse', () => ({
  fetchDocumentViewUrl: vi.fn(async (documentId: string) => `https://logicaldoc.example/view/${documentId}`),
}))

function fileEntries(...names: string[]) {
  return names.map((filename, i) => ({ documentId: `doc-${i + 1}`, filename }))
}

// ChatInput.tsx's SelectedFilesTooltip reads `message` via `App.useApp()`
// (P1-4, UI polish pass) instead of the static antd import — outside a
// real `<App>` provider that resolves to the context default `{}`, and
// `{}.error(...)` throws. Every render() in this file wraps ChatInput in
// a real `<App>` so that call resolves to a working, visible toast
// instead (see the "shows an error toast" test below, which asserts the
// rendered toast text rather than spying on a function reference).
function render(ui: React.ReactElement) {
  return rtlRender(<App>{ui}</App>)
}

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
      selectedFiles: fileEntries('a.pdf', 'b.pdf'),
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

  it('places the query speed selector immediately left of Send on desktop', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(mockMediaQueryList(false))

    const { container } = renderChatInput({ selectedCount: 1 })
    const submitControls = container.querySelector('.docu-chat-composer-submit-controls')

    expect(submitControls).not.toBeNull()
    const buttons = within(submitControls as HTMLElement).getAllByRole('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toHaveAccessibleName(/Query speed: Normal/i)
    expect(buttons[1]).toHaveAccessibleName('Send message')
  })
})

describe('ChatInput — selected files popover', () => {
  it('renders an ordered, numbered list with one <li> per selected file, in selection order, with the class hooks the CSS numbering/truncation rules target', async () => {
    const user = userEvent.setup()
    const files = fileEntries('charlie.pdf', 'alpha.pdf', 'bravo.pdf')
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
    expect(items.map((li) => li.textContent)).toEqual(files.map((f) => f.filename))
    for (const li of items) {
      expect(li).toHaveClass('docu-selected-files-item')
      // Overflow/ellipsis lives on the filename control, never the <li> —
      // an `overflow: hidden` `<li>` clips the CSS counter marker.
      expect(li).not.toHaveClass('truncate')
      expect(li).not.toHaveClass('break-all')
      const link = li.querySelector('button.docu-selected-files-item-link')
      expect(link).not.toBeNull()
      expect(link?.textContent).toBe(li.textContent)
    }
  })

  it('bounds the selected-file preview while preserving the aggregate count', async () => {
    const user = userEvent.setup()
    const files = fileEntries(...Array.from({ length: 25 }, (_, i) => `file-${i}.pdf`))
    renderChatInput({ selectedCount: files.length, selectedFiles: files })

    await user.hover(screen.getByText(`${files.length} files`))

    const tooltip = await screen.findByRole('tooltip')
    expect(within(tooltip).getAllByRole('listitem')).toHaveLength(21)
    expect(tooltip).toHaveTextContent('5 more files')
    expect(tooltip).toHaveTextContent('file-0.pdf')
    expect(tooltip).toHaveTextContent('file-19.pdf')
    expect(tooltip).not.toHaveTextContent('file-20.pdf')
  })

  it('underlines on hover styling is declared in unlayered CSS and opens the file in LogicalDOC on click', async () => {
    const user = userEvent.setup()
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { fetchDocumentViewUrl } = await import('../api/browse')

    renderChatInput({
      selectedCount: 1,
      selectedFiles: fileEntries('Workplace_Policy_2026.pdf'),
    })
    await user.hover(screen.getByText('1 file'))
    const link = await screen.findByRole('button', {
      name: 'Open Workplace_Policy_2026.pdf in LogicalDOC',
    })
    await user.click(link)

    await waitFor(() => {
      expect(fetchDocumentViewUrl).toHaveBeenCalledWith('doc-1')
      expect(openSpy).toHaveBeenCalledWith(
        'https://logicaldoc.example/view/doc-1',
        '_blank',
        'noopener,noreferrer',
      )
    })

    const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8')
    expect(css).toMatch(
      /\.docu-selected-files-tooltip \.docu-selected-files-item-link:hover/,
    )
    expect(css).toMatch(/text-decoration:\s*underline/)

    openSpy.mockRestore()
  })

  it('shows an error toast when opening the file in LogicalDOC fails (App.useApp() coverage)', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchDocumentViewUrl).mockRejectedValueOnce(new Error('network error'))

    renderChatInput({
      selectedCount: 1,
      selectedFiles: fileEntries('Workplace_Policy_2026.pdf'),
    })
    await user.hover(screen.getByText('1 file'))
    const link = await screen.findByRole('button', {
      name: 'Open Workplace_Policy_2026.pdf in LogicalDOC',
    })
    await user.click(link)

    // SelectedFilesTooltip's `message.error(...)` call — read via
    // App.useApp() (P1-4) — only resolves to a working, visible toast
    // when this render is wrapped in a real `<App>` (see render() above);
    // outside one it throws instead of ever reaching the DOM.
    expect(
      await screen.findByText('Could not open Workplace_Policy_2026.pdf'),
    ).toBeInTheDocument()
  })

  it('caps the popover root at 440px on desktop and calc(100vw - 32px) on phone, via Tooltip styles.root (not a stylesheet rule)', async () => {
    const user = userEvent.setup()

    vi.spyOn(window, 'matchMedia').mockReturnValue(mockMediaQueryList(false))
    const { unmount } = renderChatInput({
      selectedCount: 1,
      selectedFiles: fileEntries('report.pdf'),
    })
    await user.hover(screen.getByText('1 file'))
    let tooltipRoot = (await screen.findByRole('tooltip')).closest('.docu-selected-files-tooltip')
    expect(tooltipRoot).not.toBeNull()
    expect((tooltipRoot as HTMLElement).style.maxWidth).toBe('440px')
    unmount()

    vi.spyOn(window, 'matchMedia').mockReturnValue(mockMediaQueryList(true))
    renderChatInput({ selectedCount: 1, selectedFiles: fileEntries('report.pdf') })
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

  it('renders one aggregate, read-only pill for the host-chosen files instead of per-file chips or the editable files pill', () => {
    renderChatInput({
      selectedCount: 0,
      allowEmptySelection: true,
      emptySelectionPlaceholder: 'Ask about the shared files',
      sharedScopeFiles: [
        { documentId: 'doc-9', filename: 'Contract.pdf' },
        { documentId: 'doc-10', filename: null },
      ],
    })

    expect(screen.getByText('2 files')).toBeInTheDocument()
    // No per-file enumeration — neither the resolved filename nor the
    // "File <id>" fallback for an unresolvable one.
    expect(screen.queryByText('Contract.pdf')).not.toBeInTheDocument()
    expect(screen.queryByText('File doc-10')).not.toBeInTheDocument()
    // The normal editable chip (with its own "Clear selection" control)
    // never renders alongside the read-only aggregate pill.
    expect(screen.queryByLabelText('Clear selection')).not.toBeInTheDocument()
  })

  it('renders "1 file" (singular) for a single host-chosen file, with no remove/x control on the pill', () => {
    renderChatInput({
      selectedCount: 0,
      allowEmptySelection: true,
      emptySelectionPlaceholder: 'Ask about the shared files',
      sharedScopeFiles: [{ documentId: 'doc-9', filename: 'Contract.pdf' }],
    })

    const pill = screen.getByText('1 file')
    expect(pill).toBeInTheDocument()
    expect(pill).toHaveClass('docu-chat-composer-files')
    expect(pill.tagName).toBe('SPAN')
    // No sibling "clear" button, unlike the owner's own editable pill —
    // queried by role/label (not DOM adjacency, which differs between the
    // desktop and <480px phone toolbar layouts) so this holds at either
    // width.
    expect(screen.queryByLabelText('Clear selection')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument()
  })

  it('shows the same file-list tooltip for the host-selected scope pill', async () => {
    const user = userEvent.setup()
    renderChatInput({
      selectedCount: 0,
      allowEmptySelection: true,
      sharedScopeFiles: [
        { documentId: 'doc-9', filename: 'Contract.pdf' },
        { documentId: 'doc-10', filename: null },
      ],
    })

    await user.hover(screen.getByText('2 files'))

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Contract.pdf')
    expect(screen.getByRole('tooltip')).toHaveTextContent('File doc-10')
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

describe('ChatInput — shared-chat disclaimer prefix', () => {
  // "shared chat" is highlighted in its own <span> (same treatment as
  // "not context-aware"/"separate question" elsewhere in this line), so
  // the full phrase is split across sibling text nodes — `getByText`'s
  // default matcher only looks at an element's own direct text nodes
  // (testing-library's `getNodeText`), never the concatenated
  // `textContent` of its descendants. Reading `.textContent` off the
  // disclaimer `<p>` directly sidesteps that rather than fighting a
  // custom matcher function.
  function disclaimerText() {
    return document.querySelector('.docu-chat-input-disclaimer')?.textContent ?? ''
  }

  it('shows the "This is a shared chat" prefix when isSharedChat is true', () => {
    renderChatInput({ isSharedChat: true })

    expect(disclaimerText()).toMatch(/this is a shared chat/i)
    // The original disclaimer still follows it, unchanged.
    expect(disclaimerText()).toMatch(/not context-aware/)
  })

  it('does not show the prefix for a normal (non-shared) chat', () => {
    renderChatInput({ isSharedChat: false })

    expect(disclaimerText()).not.toMatch(/this is a shared chat/i)
  })

  it('does not show the prefix when isSharedChat is omitted (defaults false)', () => {
    renderChatInput()

    expect(disclaimerText()).not.toMatch(/this is a shared chat/i)
  })
})

describe('ChatInput — host rooftop banner for a query-shared chat', () => {
  it('shows the banner when isHostOfQueryShare is true', () => {
    renderChatInput({ isHostOfQueryShare: true })

    expect(
      screen.getByText(/sending a message will update what the recipients can see/i),
    ).toBeInTheDocument()
  })

  it('hides the banner when isHostOfQueryShare is false', () => {
    renderChatInput({ isHostOfQueryShare: false })

    expect(
      screen.queryByText(/sending a message will update what the recipients can see/i),
    ).not.toBeInTheDocument()
  })

  it('hides the banner when isHostOfQueryShare is omitted (defaults false)', () => {
    renderChatInput()

    expect(
      screen.queryByText(/sending a message will update what the recipients can see/i),
    ).not.toBeInTheDocument()
  })
})

// Fix round 1, Finding 1: `toolActionPending` (Summarize/Categorize/Extract
// metadata busy, or a pending-answer poll — see AppLayout) must disable
// Send without ever swapping it for a clickable-but-inert Stop button.
// Only `isResponding` (this chat's own abortable stream) may show Stop.
describe('ChatInput — toolActionPending disables Send without showing Stop', () => {
  it('shows a disabled Send button (not Stop) while toolActionPending is true and the chat is not itself responding', async () => {
    const user = userEvent.setup()
    renderChatInput({ selectedCount: 1, toolActionPending: true })

    const textarea = screen.getByPlaceholderText('Ask a question about the selected documents')
    await user.type(textarea, 'What is in this document?')

    const sendButton = screen.getByRole('button', { name: 'Send message' })
    expect(sendButton).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Stop response' })).not.toBeInTheDocument()
  })

  it('never calls onSend when Enter is pressed while toolActionPending is true', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    renderChatInput({ selectedCount: 1, toolActionPending: true, onSend })

    const textarea = screen.getByPlaceholderText('Ask a question about the selected documents')
    await user.type(textarea, 'What is in this document?{Enter}')

    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows Stop (not Send) while isResponding is true, even if toolActionPending is also true', () => {
    renderChatInput({ selectedCount: 1, isResponding: true, toolActionPending: true })

    const stopButton = screen.getByRole('button', { name: 'Stop response' })
    expect(stopButton).not.toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument()
  })

  it('calls onStop, not onSend, when clicked while isResponding and toolActionPending are both true', async () => {
    const user = userEvent.setup()
    const onStop = vi.fn()
    const onSend = vi.fn()
    renderChatInput({
      selectedCount: 1,
      isResponding: true,
      toolActionPending: true,
      onStop,
      onSend,
    })

    await user.click(screen.getByRole('button', { name: 'Stop response' }))

    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows an enabled Send button when toolActionPending is false and a message is entered', async () => {
    const user = userEvent.setup()
    renderChatInput({ selectedCount: 1, toolActionPending: false })

    const textarea = screen.getByPlaceholderText('Ask a question about the selected documents')
    await user.type(textarea, 'What is in this document?')

    expect(screen.getByRole('button', { name: 'Send message' })).not.toBeDisabled()
  })
})

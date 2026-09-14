import { act, render, screen } from '@testing-library/react'
import React from 'react'
import ChatMessageItem from './ChatMessage'
import type { ChatMessage, Source } from '../types'

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    role: 'assistant',
    content: '',
    status: 'complete',
    ...overrides,
  }
}

describe('AnswerContent Markdown rendering', () => {
  it('renders paragraphs and a bullet list as <p> and <li> elements', () => {
    const content = 'First paragraph.\n\nSecond paragraph:\n\n- item one\n- item two'
    render(<ChatMessageItem message={assistantMessage({ content })} />)

    expect(screen.getByText('First paragraph.').tagName).toBe('P')
    expect(screen.getByText('Second paragraph:').tagName).toBe('P')

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('item one')
    expect(items[1]).toHaveTextContent('item two')
  })

  it('renders a [DocN] marker inside a list item as a clickable CitationLink', () => {
    const source: Source = {
      index: 1,
      filename: 'Report.pdf',
      docRef: '[Doc1]',
      documentId: 'doc-1',
      page: 3,
      reference: 'Page 3',
    }
    const content = '- The finding is described here [Doc1]\n- Another item'
    render(
      <ChatMessageItem
        message={assistantMessage({ content, sources: [source] })}
      />,
    )

    const link = screen.getByRole('button', { name: /Report\.pdf, Page 3/ })
    expect(link.closest('li')).not.toBeNull()
    expect(link.tagName).toBe('BUTTON')
  })

  it('renders a [DocN] marker inside a paragraph as a CitationLink (non-list regression check)', () => {
    const source: Source = {
      index: 1,
      filename: 'Report.pdf',
      docRef: '[Doc1]',
      documentId: 'doc-1',
    }
    const content = 'The answer cites a source [Doc1] directly.'
    render(
      <ChatMessageItem
        message={assistantMessage({ content, sources: [source] })}
      />,
    )

    const link = screen.getByRole('button', { name: /Report\.pdf/ })
    expect(link.closest('p')).not.toBeNull()
  })

  it('renders inline code, bold text, and demotes an h1 heading to a styled paragraph', () => {
    const content = '# Heading\n\nSome **bold** text and `inline code`.'
    const { container } = render(
      <ChatMessageItem message={assistantMessage({ content })} />,
    )

    expect(container.querySelector('h1')).toBeNull()
    const heading = screen.getByText('Heading')
    expect(heading.tagName).toBe('P')
    expect(heading.className).toContain('font-medium')

    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByText('inline code').tagName).toBe('CODE')
  })

  it('renders a Markdown table as a bordered table', () => {
    const content = '| A | B |\n| --- | --- |\n| 1 | 2 |'
    render(<ChatMessageItem message={assistantMessage({ content })} />)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(2)
    expect(screen.getByRole('cell', { name: '1' })).toBeInTheDocument()
  })

  it('does not render raw HTML embedded in the answer', () => {
    const content = 'Before <img src=x onerror="window.__pwned = true"> after'
    const { container } = render(
      <ChatMessageItem message={assistantMessage({ content })} />,
    )

    expect(container.querySelector('img')).toBeNull()
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined()
  })

  it('keeps the streaming live-text preview as plain, pre-wrapped text', () => {
    const message = assistantMessage({
      content: 'Finished part.',
      status: 'streaming',
      liveText: 'still *typing*',
    })
    render(<ChatMessageItem message={message} />)

    const preview = screen.getByText('still *typing*')
    expect(preview.tagName).toBe('SPAN')
    expect(preview.className).toContain('whitespace-pre-wrap')
  })

  it('keeps the live-typing preview and cursor inline in the last block instead of a following sibling block', () => {
    const message = assistantMessage({
      content: 'Hello',
      status: 'streaming',
      liveText: ' world',
    })
    const { container } = render(<ChatMessageItem message={message} />)

    // "Hello world" must be one continuous block, not "Hello" in one <p>
    // and " world" dangling after it as a detached sibling.
    const block = screen.getByText(
      (_text, node) => node?.tagName === 'P' && node.textContent === 'Hello world',
    )
    expect(block.tagName).toBe('P')

    const cursor = container.querySelector('[data-testid="streaming-cursor"]')
    expect(cursor).not.toBeNull()
    // The cursor must be a descendant of that same block, not a sibling of
    // the block (or of the whole Markdown tree) that would start a new line.
    expect(block.contains(cursor)).toBe(true)

    // No further block-level element follows the paragraph containing the
    // preview text — i.e. nothing detaches onto its own line below it.
    const answerRoot = block.parentElement
    expect(answerRoot?.lastElementChild).toBe(block)
  })

  it('renders a finished (non-streaming) message identically to before — no tail elements at all', () => {
    const content = 'Finished part.'
    const { container } = render(
      <ChatMessageItem message={assistantMessage({ content, status: 'complete' })} />,
    )

    expect(screen.getByText('Finished part.').tagName).toBe('P')
    expect(container.querySelector('[data-testid="streaming-cursor"]')).toBeNull()
  })
})

describe('interrupted answer note', () => {
  it('renders the partial answer plus an italic "Answer interrupted." note', () => {
    render(
      <ChatMessageItem
        message={assistantMessage({
          content: 'Here is what I found so far',
          status: 'complete',
          interrupted: true,
        })}
      />,
    )

    expect(screen.getByText('Here is what I found so far').tagName).toBe('P')
    const note = screen.getByText('Answer interrupted.')
    expect(note.tagName).toBe('P')
    expect(note.className).toContain('italic')
  })

  it('renders just the note when nothing had arrived yet', () => {
    render(
      <ChatMessageItem
        message={assistantMessage({ content: '', status: 'complete', interrupted: true })}
      />,
    )

    expect(screen.getByText('Answer interrupted.')).toBeInTheDocument()
  })

  it('does not render the note for a normally completed answer', () => {
    render(
      <ChatMessageItem
        message={assistantMessage({ content: 'All done.', status: 'complete' })}
      />,
    )

    expect(screen.queryByText('Answer interrupted.')).not.toBeInTheDocument()
  })
})

describe('progress label elapsed-time ticker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('appends " · {n}s" to the thinking headline once the generating stage has been reached', () => {
    const startedAt = Date.now()
    render(
      <ChatMessageItem
        message={assistantMessage({
          status: 'thinking',
          progressLabel: 'Writing your answer…',
          progressStage: 'generating',
          startedAt,
        })}
      />,
    )

    expect(screen.getByText('Writing your answer… · 0s')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByText('Writing your answer… · 2s')).toBeInTheDocument()
  })

  it('does not tick a non-generating stage until 4 seconds have elapsed', () => {
    const startedAt = Date.now()
    render(
      <ChatMessageItem
        message={assistantMessage({
          status: 'thinking',
          progressLabel: 'Understanding your question…',
          progressStage: 'classifying',
          startedAt,
        })}
      />,
    )

    expect(screen.getByText('Understanding your question…')).toBeInTheDocument()
    expect(screen.queryByText(/Understanding your question… ·/)).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.getByText('Understanding your question… · 4s')).toBeInTheDocument()
  })

  it('ticks the streaming progress label the same way while no content has arrived yet', () => {
    const startedAt = Date.now()
    render(
      <ChatMessageItem
        message={assistantMessage({
          status: 'streaming',
          content: '',
          progressLabel: 'Writing your answer from A.pdf…',
          progressStage: 'generating',
          startedAt,
        })}
      />,
    )

    expect(screen.getByText('Writing your answer from A.pdf… · 0s')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText('Writing your answer from A.pdf… · 3s')).toBeInTheDocument()
  })

  it('does not append the ticker suffix to the streaming label once content has arrived', () => {
    render(
      <ChatMessageItem
        message={assistantMessage({
          status: 'streaming',
          content: 'Partial answer',
          progressLabel: 'Writing your answer…',
          progressStage: 'generating',
          startedAt: Date.now(),
        })}
      />,
    )

    // The label itself may still be shown (cleared separately once a delta
    // arrives, in AppLayout), but the elapsed-time ticker only applies to
    // the silent, content-free phase.
    expect(screen.getByText('Writing your answer…')).toBeInTheDocument()
    expect(screen.queryByText(/Writing your answer… ·/)).not.toBeInTheDocument()
  })
})

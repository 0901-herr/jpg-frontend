import { readFileSync } from 'node:fs'
import path from 'node:path'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('numbers a repeated inline citation pill the same each time, and matches the page chip number in Related documents', async () => {
    const user = userEvent.setup()
    const sourceA: Source = { index: 1, filename: 'A.pdf', docRef: '[Doc1]', documentId: 'doc-a', page: 2 }
    const sourceB: Source = { index: 2, filename: 'B.pdf', docRef: '[Doc2]', documentId: 'doc-b', page: 5 }
    const content = 'First point [Doc1]. Second point [Doc2]. Repeats the first [Doc1] again.'
    render(
      <ChatMessageItem message={assistantMessage({ content, sources: [sourceA, sourceB] })} />,
    )

    const repeatedPills = screen.getAllByTitle('A.pdf · p. 2')
    expect(repeatedPills).toHaveLength(2)
    expect(repeatedPills[0]).toHaveTextContent('1')
    expect(repeatedPills[1]).toHaveTextContent('1')

    const otherPill = screen.getByTitle('B.pdf · p. 5')
    expect(otherPill).toHaveTextContent('2')

    await user.click(screen.getByRole('button', { name: /Related documents/ }))
    expect(screen.getByText('1 · p. 2')).toBeInTheDocument()
    expect(screen.getByText('2 · p. 5')).toBeInTheDocument()
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

describe('abstained answer', () => {
  it('shows the "No matching content" caption above the answer text', () => {
    render(
      <ChatMessageItem
        message={assistantMessage({
          content: "I couldn't find relevant content to answer this.",
          status: 'complete',
          abstained: true,
        })}
      />,
    )

    const caption = screen.getByText('No matching content')
    expect(caption.tagName).toBe('P')
    expect(
      screen.getByText("I couldn't find relevant content to answer this."),
    ).toBeInTheDocument()
  })

  it('renders no related-documents list on an abstained message even if sources were left over', () => {
    render(
      <ChatMessageItem
        message={assistantMessage({
          content: "I couldn't find relevant content to answer this.",
          status: 'complete',
          abstained: true,
          sources: [{ index: 1, filename: 'Report.pdf' }],
        })}
      />,
    )

    expect(screen.queryByText('Report.pdf')).not.toBeInTheDocument()
  })

  it('does not show the caption for a normal, non-abstained answer', () => {
    render(
      <ChatMessageItem
        message={assistantMessage({ content: 'All done.', status: 'complete' })}
      />,
    )

    expect(screen.queryByText('No matching content')).not.toBeInTheDocument()
  })
})

describe('marker-less refusal', () => {
  const source: Source = { index: 1, filename: 'Report.pdf', docRef: '[Doc1]', documentId: 'd1' }

  it('renders no Related documents list for a completed, non-abstained answer that cites nothing inline', () => {
    render(
      <ChatMessageItem
        message={assistantMessage({
          content:
            'The provided context does not contain any information about C++ compiler flags.',
          status: 'complete',
          sources: [source],
        })}
      />,
    )

    expect(screen.queryByRole('button', { name: /Related documents/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Report.pdf')).not.toBeInTheDocument()
  })

  it('still renders Related documents when the same message cites a source inline', () => {
    render(
      <ChatMessageItem
        message={assistantMessage({
          content: 'See the flags in [Doc1].',
          status: 'complete',
          sources: [source],
        })}
      />,
    )

    expect(screen.getByRole('button', { name: /Related documents/ })).toBeInTheDocument()
  })

  it('never renders a literal "[DocN]" placeholder in a completed answer', () => {
    render(
      <ChatMessageItem
        message={assistantMessage({
          content: 'See the flags in [Doc1, DocN].',
          status: 'complete',
          sources: [source],
        })}
      />,
    )

    expect(screen.queryByText(/DocN/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Report\.pdf/ })).toBeInTheDocument()
  })

  it('strips a bare "[DocN]" placeholder with no other marker in the paragraph, and shows no Related documents', () => {
    render(
      <ChatMessageItem
        message={assistantMessage({
          content:
            'There is no explicit information about action items in the provided context. [DocN]',
          status: 'complete',
          sources: [source],
        })}
      />,
    )

    expect(document.body.textContent).not.toMatch(/\[DocN\]/)
    expect(screen.queryByRole('button', { name: /Related documents/ })).not.toBeInTheDocument()
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
          progressLabel: 'Putting the answer together',
          progressStage: 'generating',
          startedAt,
        })}
      />,
    )

    expect(screen.getByText('Putting the answer together · 0s')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByText('Putting the answer together · 2s')).toBeInTheDocument()
  })

  it('shows the elapsed count exactly once — no separate standalone "{n}s" caption alongside the ticked headline', () => {
    const startedAt = Date.now()
    render(
      <ChatMessageItem
        message={assistantMessage({
          status: 'thinking',
          progressLabel: 'Putting the answer together',
          progressStage: 'generating',
          startedAt,
        })}
      />,
    )

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    // Only the compound headline carries the elapsed count — no standalone
    // "2s" caption below it duplicating the same number in a different
    // format (the MAJOR-2 regression: both used to render at once).
    expect(screen.getByText('Putting the answer together · 2s')).toBeInTheDocument()
    expect(screen.queryByText('2s')).not.toBeInTheDocument()
    expect(screen.getAllByText(/2s/)).toHaveLength(1)
  })

  it('does not tick a non-generating stage until 4 seconds have elapsed', () => {
    const startedAt = Date.now()
    render(
      <ChatMessageItem
        message={assistantMessage({
          status: 'thinking',
          progressLabel: 'Understanding your question',
          progressStage: 'classifying',
          startedAt,
        })}
      />,
    )

    expect(screen.getByText('Understanding your question')).toBeInTheDocument()
    expect(screen.queryByText(/Understanding your question ·/)).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.getByText('Understanding your question · 4s')).toBeInTheDocument()
  })

  it('ticks the streaming progress label the same way while no content has arrived yet', () => {
    const startedAt = Date.now()
    render(
      <ChatMessageItem
        message={assistantMessage({
          status: 'streaming',
          content: '',
          progressLabel: 'Putting the answer together',
          progressStage: 'generating',
          startedAt,
        })}
      />,
    )

    expect(screen.getByText('Putting the answer together · 0s')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText('Putting the answer together · 3s')).toBeInTheDocument()
  })

  it('does not append the ticker suffix to the streaming label once content has arrived', () => {
    render(
      <ChatMessageItem
        message={assistantMessage({
          status: 'streaming',
          content: 'Partial answer',
          progressLabel: 'Putting the answer together',
          progressStage: 'generating',
          startedAt: Date.now(),
        })}
      />,
    )

    // The label itself may still be shown (cleared separately once a delta
    // arrives, in AppLayout), but the elapsed-time ticker only applies to
    // the silent, content-free phase.
    expect(screen.getByText('Putting the answer together')).toBeInTheDocument()
    expect(screen.queryByText(/Putting the answer together ·/)).not.toBeInTheDocument()
  })
})

describe('progress ticker names the files/folders being searched', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('alternates the stage label with "Searching <file>" every ~2.5s while thinking', () => {
    const startedAt = Date.now()
    render(
      <ChatMessageItem
        message={assistantMessage({
          status: 'thinking',
          progressLabel: 'Understanding your question',
          progressStage: 'classifying',
          progressScopeFiles: ['A.pdf', 'B.pdf'],
          startedAt,
        })}
      />,
    )

    // The elapsed-seconds suffix (`shouldTickLabel`) keeps applying on top
    // of whichever line is showing, so these assertions anchor on the start
    // of the text rather than pin down the exact "· {n}s" tail.
    expect(screen.getByText(/^Understanding your question/)).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(screen.getByText(/^Searching A\.pdf/)).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(screen.getByText(/^Understanding your question/)).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(screen.getByText(/^Searching B\.pdf/)).toBeInTheDocument()
  })

  it('names a folder as "Searching folder <name>" when folder names are known', () => {
    const startedAt = Date.now()
    render(
      <ChatMessageItem
        message={assistantMessage({
          status: 'thinking',
          progressLabel: 'Searching your documents',
          progressStage: 'retrieving',
          progressScopeFiles: [],
          progressScopeFolders: ['Reports'],
          startedAt,
        })}
      />,
    )

    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(screen.getByText(/^Searching folder Reports/)).toBeInTheDocument()
  })

  it('never shows the stage label during generating — cycles "Reading <file>" on every tick, using cited files once available', () => {
    const startedAt = Date.now()
    const { rerender } = render(
      <ChatMessageItem
        message={assistantMessage({
          status: 'thinking',
          progressLabel: 'Putting the answer together',
          progressStage: 'generating',
          progressScopeFiles: ['A.pdf'],
          startedAt,
        })}
      />,
    )

    // Before any citation has arrived: falls back to the scoped files.
    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(screen.getByText(/^Reading A\.pdf/)).toBeInTheDocument()
    expect(screen.queryByText(/^Putting the answer together/)).not.toBeInTheDocument()

    // A citation for a different document arrives — the ticker now cites it
    // by name instead of the scoped fallback.
    rerender(
      <ChatMessageItem
        message={assistantMessage({
          status: 'thinking',
          progressLabel: 'Putting the answer together',
          progressStage: 'generating',
          progressScopeFiles: ['A.pdf'],
          sources: [{ index: 1, filename: 'Cited.pdf' }],
          startedAt,
        })}
      />,
    )

    // With a single name in scope, every tick lands on it — the component
    // never unmounted, so the ticker's own count keeps running.
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByText(/^Reading Cited\.pdf/)).toBeInTheDocument()
  })

  it('names a folder as "Reading folder <name>" during generating too, cycling files then folders, never the stage label', () => {
    const startedAt = Date.now()
    render(
      <ChatMessageItem
        message={assistantMessage({
          status: 'thinking',
          progressLabel: 'Putting the answer together',
          progressStage: 'generating',
          progressScopeFiles: ['A.pdf'],
          progressScopeFolders: ['Reports'],
          startedAt,
        })}
      />,
    )

    // Tick 0, on mount: the first scope line (a file) — no stage label.
    expect(screen.getByText(/^Reading A\.pdf/)).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(screen.getByText(/^Reading folder Reports/)).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(screen.getByText(/^Reading A\.pdf/)).toBeInTheDocument()

    expect(screen.queryByText(/^Putting the answer together/)).not.toBeInTheDocument()
  })

  it('falls back to "Putting the answer together" during generating when there is nothing to name', () => {
    const startedAt = Date.now()
    render(
      <ChatMessageItem
        message={assistantMessage({
          status: 'thinking',
          progressLabel: 'Putting the answer together',
          progressStage: 'generating',
          progressScopeFiles: [],
          progressScopeFolders: [],
          startedAt,
        })}
      />,
    )

    act(() => {
      vi.advanceTimersByTime(10000)
    })
    expect(screen.getAllByText(/^Putting the answer together/).length).toBeGreaterThan(0)
  })

  it('stops ticking scope names once the answer completes (no stray "Searching" text left behind)', () => {
    const startedAt = Date.now()
    const { rerender } = render(
      <ChatMessageItem
        message={assistantMessage({
          status: 'streaming',
          content: '',
          progressLabel: 'Putting the answer together',
          progressStage: 'generating',
          progressScopeFiles: ['A.pdf'],
          startedAt,
        })}
      />,
    )

    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(screen.getByText(/^Reading A\.pdf/)).toBeInTheDocument()

    rerender(
      <ChatMessageItem
        message={assistantMessage({
          status: 'complete',
          content: 'The final answer.',
          progressLabel: undefined,
          progressScopeFiles: ['A.pdf'],
          startedAt,
        })}
      />,
    )

    expect(screen.queryByText(/Reading A\.pdf/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Searching/)).not.toBeInTheDocument()
  })

  it('leaks no timers on unmount mid-query', () => {
    const startedAt = Date.now()
    const { unmount } = render(
      <ChatMessageItem
        message={assistantMessage({
          status: 'thinking',
          progressLabel: 'Putting the answer together',
          progressStage: 'generating',
          progressScopeFiles: ['A.pdf'],
          startedAt,
        })}
      />,
    )

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('truncates a long file name on one line instead of wrapping', () => {
    const startedAt = Date.now()
    render(
      <ChatMessageItem
        message={assistantMessage({
          status: 'thinking',
          progressLabel: 'Understanding your question',
          progressStage: 'classifying',
          progressScopeFiles: ['A Very Long Document Name That Should Not Wrap Onto A Second Line.pdf'],
          startedAt,
        })}
      />,
    )

    act(() => {
      vi.advanceTimersByTime(2500)
    })
    const label = screen.getByText(
      'Searching A Very Long Document Name That Should Not Wrap Onto A Second Line.pdf',
    )
    expect(label.className).toContain('truncate')
  })
})

describe('chat pane never scrolls horizontally', () => {
  it('wraps a 3,000-char unbroken string and a fenced code block instead of widening the page', () => {
    const longWord = 'a'.repeat(3000)
    const content = `Here is a very long value: ${longWord}\n\n\`\`\`\nconsole.log("${longWord}")\n\`\`\``
    const { container } = render(
      <ChatMessageItem message={assistantMessage({ content, status: 'complete' })} />,
    )

    // jsdom can't measure layout (no real scrollWidth), so the classes that
    // constrain width are the contract here — verified visually with
    // scrollWidth in a real browser separately.
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre?.className).toContain('whitespace-pre-wrap')
    expect(pre?.className).toContain('break-words')

    const answerRoot = container.querySelector('.min-w-0.break-words')
    expect(answerRoot).not.toBeNull()

    expect(screen.getAllByText(new RegExp(longWord)).length).toBeGreaterThan(0)
  })

  it('does not double up padding/background on the code nested inside a fenced block', () => {
    const content = '```\nconsole.log("hi")\n```'
    const { container } = render(
      <ChatMessageItem message={assistantMessage({ content, status: 'complete' })} />,
    )

    const nestedCode = container.querySelector('pre code')
    expect(nestedCode).not.toBeNull()
    // The inline-code style (padding + its own rounded background) stays
    // on standalone inline code only — nested inside `pre`, which already
    // supplies the background/padding for the whole block, it would
    // otherwise double up.
    expect(nestedCode?.className).not.toContain('px-1')
    expect(nestedCode?.className).not.toContain('bg-black/[0.05]')
  })

  it('keeps the inline-code style unaffected for standalone inline code', () => {
    const content = 'Some `inline code` here.'
    render(<ChatMessageItem message={assistantMessage({ content, status: 'complete' })} />)

    const inlineCode = screen.getByText('inline code')
    expect(inlineCode.tagName).toBe('CODE')
    expect(inlineCode.className).toContain('px-1')
    expect(inlineCode.className).toContain('bg-black/[0.05]')
  })

  it('wraps a Markdown table inside its own horizontally-scrollable box', () => {
    const content = '| Field | Value |\n| --- | --- |\n| A | ' + 'b'.repeat(500) + ' |'
    render(<ChatMessageItem message={assistantMessage({ content, status: 'complete' })} />)

    const table = screen.getByRole('table')
    const wrapper = table.parentElement
    expect(wrapper?.className).toContain('overflow-x-auto')
    expect(wrapper?.className).toContain('max-w-full')

    const cell = screen.getByRole('cell', { name: new RegExp('b'.repeat(20)) })
    expect(cell.className).toContain('break-words')
  })

  it('renders the table inside the .docu-answer container that scopes its unlayered CSS', () => {
    const content = '| A | B |\n| --- | --- |\n| 1 | 2 |'
    render(<ChatMessageItem message={assistantMessage({ content, status: 'complete' })} />)

    const table = screen.getByRole('table')
    expect(table.closest('.docu-answer')).not.toBeNull()
  })

  it('lets a long unbroken user message wrap instead of forcing the bubble wider', () => {
    const longWord = 'x'.repeat(3000)
    render(
      <ChatMessageItem
        message={{ id: 'u1', role: 'user', content: longWord }}
      />,
    )

    const bubble = screen.getByText(new RegExp(longWord)).closest('div')
    expect(bubble?.className).toContain('break-words')
  })

  // Task 5 (responsive layout): the user bubble's max-width already caps
  // at `min(36rem, 100%)` — the `100%` alone means it was never possible
  // for the bubble to force itself wider than its own container even on a
  // 390px phone, with no breakpoint-specific override needed. This is a
  // regression guard for that existing behaviour, not new styling.
  it('caps the user bubble width at 100% of its container, never wider, on any screen size', () => {
    render(<ChatMessageItem message={{ id: 'u1', role: 'user', content: 'Short question' }} />)

    const bubble = screen.getByText('Short question').closest('div')
    expect(bubble?.className).toMatch(/max-w-\[min\(36rem,100%\)\]/)
  })
})

describe('.docu-answer table/list CSS contract', () => {
  it('declares full-width + collapsed borders for tables, padding + bold/background for th, and padding for td', () => {
    const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8')

    const table = css.match(/\.docu-answer table\s*\{([^}]*)\}/)
    expect(table).not.toBeNull()
    expect(table![1]).toMatch(/width\s*:\s*100%/)
    expect(table![1]).toMatch(/border-collapse\s*:\s*collapse/)

    const th = css.match(/\.docu-answer th\s*\{([^}]*)\}/)
    expect(th).not.toBeNull()
    expect(th![1]).toMatch(/padding\s*:\s*0\.4em\s+0\.6em/)
    expect(th![1]).toMatch(/font-weight\s*:/)
    expect(th![1]).toMatch(/background\s*:/)

    const td = css.match(/\.docu-answer td\s*\{([^}]*)\}/)
    expect(td).not.toBeNull()
    expect(td![1]).toMatch(/padding\s*:\s*0\.4em\s+0\.6em/)
  })

  it('gives .docu-answer ul/ol a bottom margin the unlayered antd reset cannot silently win over', () => {
    const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8')

    const list = css.match(/\.docu-answer ul,\s*\.docu-answer ol\s*\{([^}]*)\}/)
    expect(list).not.toBeNull()
    expect(list![1]).toMatch(/margin-bottom\s*:/)
  })
})

describe('answer-order citation numbering (client feedback: a second question used to keep counting from the first)', () => {
  it('numbers a message whose source indices start at 6 back at pill 1 — this message’s own answer text is all that counts (fix round 1: strengthened to actually fail under the old source-list-order numbering)', () => {
    // Five retrieval candidates the answer never cites, placed AHEAD of the
    // two it does cite — this is the shape that actually reproduces the
    // client's "the second question starts at 6" complaint: the removed
    // `numberCitations(sources)` numbered every array entry regardless of
    // whether the answer cited it, so these five uncited fillers would have
    // taken numbers 1-5 and pushed the cited pair to 6/7. A fixture with
    // only the two cited sources (as this test originally had) can't tell
    // old and new numbering apart, since both give 1/2 either way.
    const uncitedFillers: Source[] = Array.from({ length: 5 }, (_, i) => ({
      index: i + 1,
      filename: `Filler${i + 1}.pdf`,
      docRef: `[Doc${i + 1}]`,
      documentId: `doc-filler-${i + 1}`,
      page: 1,
    }))
    const sourceSix: Source = {
      index: 6,
      filename: 'F6.pdf',
      docRef: '[Doc6]',
      documentId: 'doc-6',
      page: 1,
    }
    const sourceSeven: Source = {
      index: 7,
      filename: 'F7.pdf',
      docRef: '[Doc7]',
      documentId: 'doc-7',
      page: 1,
    }
    const content = 'Cites the first one [Doc6] then the second [Doc7].'
    render(
      <ChatMessageItem
        message={assistantMessage({
          content,
          sources: [...uncitedFillers, sourceSix, sourceSeven],
        })}
      />,
    )

    expect(screen.getByTitle('F6.pdf · p. 1')).toHaveTextContent('1')
    expect(screen.getByTitle('F7.pdf · p. 1')).toHaveTextContent('2')
  })

  it('renders exactly one pill per distinct citation inside a repeated bracket group ([Doc6, Doc7, Doc6, Doc8] → pills 1, 2, 3, not 1, 2, 1, 3) (fix round 1)', () => {
    const sourceSix: Source = { index: 6, filename: 'F6.pdf', docRef: '[Doc6]', documentId: 'doc-6', page: 1 }
    const sourceSeven: Source = { index: 7, filename: 'F7.pdf', docRef: '[Doc7]', documentId: 'doc-7', page: 1 }
    const sourceEight: Source = { index: 8, filename: 'F8.pdf', docRef: '[Doc8]', documentId: 'doc-8', page: 1 }
    const content = 'See the notes [Doc6, Doc7, Doc6, Doc8] for detail.'
    const { container } = render(
      <ChatMessageItem
        message={assistantMessage({ content, sources: [sourceSix, sourceSeven, sourceEight] })}
      />,
    )

    const pills = Array.from(container.querySelectorAll('.docu-citation-pill'))
    expect(pills.map((pill) => pill.textContent)).toEqual(['1', '2', '3'])
  })

  it('collapses an adjacent citation run to one pill each with no separator text, and moves the sentence period before the run (Item B, round 3: was rendering "1 , 2 , 3 . 4")', () => {
    const sourceFive: Source = { index: 5, filename: 'F5.pdf', docRef: '[Doc5]', documentId: 'doc-5', page: 1 }
    const sourceSix: Source = { index: 6, filename: 'F6.pdf', docRef: '[Doc6]', documentId: 'doc-6', page: 1 }
    const sourceSeven: Source = { index: 7, filename: 'F7.pdf', docRef: '[Doc7]', documentId: 'doc-7', page: 1 }
    const content = 'Follow-up actions, [Doc5], [Doc6], [Doc7].'
    const { container } = render(
      <ChatMessageItem
        message={assistantMessage({ content, sources: [sourceFive, sourceSix, sourceSeven] })}
      />,
    )

    const pills = Array.from(container.querySelectorAll('.docu-citation-pill'))
    expect(pills.map((pill) => pill.textContent)).toEqual(['1', '2', '3'])
    // No stray ", " between pills and no period stranded after the last
    // one — the whole paragraph reads as one clean sentence.
    expect(container.querySelector('p')?.textContent).toBe('Follow-up actions. 1 2 3')
  })

  it('numbers pills by the order sources are cited in the text, not by their order in `sources`', () => {
    const sourceA: Source = { index: 1, filename: 'A.pdf', docRef: '[Doc1]', documentId: 'doc-a' }
    const sourceB: Source = { index: 2, filename: 'B.pdf', docRef: '[Doc2]', documentId: 'doc-b' }
    // `sources` lists B before A, but the answer cites A first.
    const content = 'First cites A [Doc1], then cites B [Doc2].'
    render(
      <ChatMessageItem message={assistantMessage({ content, sources: [sourceB, sourceA] })} />,
    )

    expect(screen.getByRole('button', { name: /A\.pdf/ })).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: /B\.pdf/ })).toHaveTextContent('2')
  })

  it('lists an uncited source under a collapsed "Also searched" section, separate from the cited "Related documents" count', async () => {
    const user = userEvent.setup()
    const cited: Source = { index: 1, filename: 'Cited.pdf', docRef: '[Doc1]', documentId: 'doc-c' }
    const uncited: Source = { index: 2, filename: 'Uncited.pdf', documentId: 'doc-u' }
    const content = 'The answer cites [Doc1] only.'
    render(
      <ChatMessageItem
        message={assistantMessage({ content, sources: [cited, uncited] })}
      />,
    )

    expect(screen.getByText('(1)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Related documents/ }))
    expect(screen.getByText('Cited.pdf')).toBeInTheDocument()
    expect(screen.queryByText('Uncited.pdf')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Also searched \(1\)/ }))
    expect(screen.getByText('Uncited.pdf')).toBeInTheDocument()
  })

  it('shows "Cited for" with the citing sentence, and highlights the question’s significant words in the snippet', async () => {
    const user = userEvent.setup()
    const cited: Source = {
      index: 1,
      filename: 'Notes.pdf',
      docRef: '[Doc1]',
      documentId: 'doc-1',
      snippet: 'The lecturer discussed the students briefly.',
    }
    const content = 'The students mentioned are listed here [Doc1].'
    render(
      <ChatMessageItem
        message={assistantMessage({
          content,
          sources: [cited],
          question: 'Who are the students mentioned?',
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Related documents/ }))

    expect(
      screen.getByText('Cited for: "The students mentioned are listed here."'),
    ).toBeInTheDocument()

    const highlighted = screen.getByText('students')
    expect(highlighted.tagName).toBe('SPAN')
    expect(highlighted.className).toContain('font-medium')
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { vi } from 'vitest'
import ChatListItem, { ChatOptionsButton } from './ChatListItem'
import type { ChatSession } from '../types'

// Sharing menu items/badge are gated behind this build-time flag (see
// `src/config/features.ts`) — mirrors Sidebar.test.tsx's mock so this
// file's sharing-related tests exercise the real gated code path.
vi.mock('../config/features', () => ({ FEATURES: { categoryView: false, chatSharing: true } }))

function session(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 's1',
    title: 'Session 15 Sep 2026 (1)',
    messages: [],
    ...overrides,
  }
}

describe('ChatListItem', () => {
  it('falls back to the session title on a single truncated line when there are no messages', () => {
    render(
      <ChatListItem
        chat={session()}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    const title = screen.getByText('Session 15 Sep 2026 (1)')
    expect(title).toHaveAttribute('title', 'Session 15 Sep 2026 (1)')
    expect(title.className).toContain('truncate')
    expect(title.closest('button')).toHaveClass('items-center')
    expect(title.closest('button')).not.toHaveClass('flex-col')
  })

  it('shows only the first user message as the single row label (not the session title)', () => {
    render(
      <ChatListItem
        chat={session({
          messages: [
            { id: 'u1', role: 'user', content: 'What is the refund policy?' },
            { id: 'a1', role: 'assistant', content: 'It is 30 days.' },
          ],
        })}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    const label = screen.getByText('What is the refund policy?')
    expect(label.className).toContain('truncate')
    expect(screen.queryByText('Session 15 Sep 2026 (1)')).not.toBeInTheDocument()
  })

  it('shows a renamed title instead of the first user message', () => {
    // Regression: rename used to PATCH `title` while the row kept rendering
    // the first question (`content ?? chat.title`), so Rename looked broken.
    render(
      <ChatListItem
        chat={session({
          title: 'Refund policy notes',
          messages: [
            { id: 'u1', role: 'user', content: 'What is the refund policy?' },
            { id: 'a1', role: 'assistant', content: 'It is 30 days.' },
          ],
        })}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText('Refund policy notes')).toBeInTheDocument()
    expect(screen.queryByText('What is the refund policy?')).not.toBeInTheDocument()
  })

  it('renders a single line when the session has no messages yet', () => {
    render(
      <ChatListItem
        chat={session({ messages: [] })}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    const title = screen.getByText('Session 15 Sep 2026 (1)')
    const button = title.closest('button') as HTMLElement
    expect(button.querySelectorAll('span')).toHaveLength(1)
  })

  it('uses the first user message even when it is not the very first message in the session', () => {
    render(
      <ChatListItem
        chat={session({
          messages: [
            { id: 'sys1', role: 'assistant', content: 'Welcome.' },
            { id: 'u1', role: 'user', content: 'Second try question' },
          ],
        })}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText('Second try question')).toBeInTheDocument()
    expect(screen.queryByText('Session 15 Sep 2026 (1)')).not.toBeInTheDocument()
  })

  it('calls onSelect when the title row is clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <ChatListItem
        chat={session()}
        isActive={false}
        onSelect={onSelect}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    await user.click(screen.getByText('Session 15 Sep 2026 (1)'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('uses consistent padding on the options button, matching ProjectGroupHeader', () => {
    render(
      <ChatListItem
        chat={session()}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    const optionsButton = screen.getByRole('button', { name: 'Chat options' })
    expect(optionsButton.className).toContain('px-2')
    expect(optionsButton.className).toContain('py-1.5')
    expect(optionsButton.className).not.toContain('px-3 py-2')
  })

  it('renders icons on the Move to and Share menu items', async () => {
    const user = userEvent.setup()
    render(
      <ChatListItem
        chat={session()}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        projects={[{ id: 'p1', name: 'Research' }]}
        onMove={vi.fn()}
        onShare={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Chat options' }))

    const moveItem = screen.getByText('Move to').closest('li')
    const shareItem = screen.getByText('Share').closest('li')
    expect(moveItem?.querySelector('svg')).toBeTruthy()
    expect(shareItem?.querySelector('svg')).toBeTruthy()
  })

  it('hides Move to when there are no projects and the chat is already ungrouped', async () => {
    const user = userEvent.setup()
    render(
      <ChatListItem
        chat={session()}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        projects={[]}
        onMove={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    expect(screen.queryByText('Move to')).not.toBeInTheDocument()
    expect(screen.queryByText('No project')).not.toBeInTheDocument()
  })

  it('lists projects for an ungrouped chat without a redundant No project entry', async () => {
    const user = userEvent.setup()
    render(
      <ChatListItem
        chat={session()}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        projects={[{ id: 'p1', name: 'Research' }]}
        onMove={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.hover(screen.getByText('Move to'))
    expect(await screen.findByRole('menuitem', { name: 'Research' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'No project' })).not.toBeInTheDocument()
  })

  it('offers No project only when the chat is already in a project', async () => {
    const user = userEvent.setup()
    render(
      <ChatListItem
        chat={session({ projectId: 'p1' })}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        projects={[
          { id: 'p1', name: 'Research' },
          { id: 'p2', name: 'Legal' },
        ]}
        onMove={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.hover(screen.getByText('Move to'))
    expect(await screen.findByRole('menuitem', { name: 'Legal' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Research' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'No project' })).toBeInTheDocument()
  })

  it('never renders a "Stop sharing" menu item, even for an already-shared chat', async () => {
    const user = userEvent.setup()
    render(
      <ChatListItem
        chat={session({ visibility: 'query', shareToken: 'tok123' })}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onShare={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    expect(screen.queryByText('Stop sharing')).not.toBeInTheDocument()
  })

  it('shows a shared-chat badge when the chat is shared', () => {
    render(
      <ChatListItem
        chat={session({ visibility: 'query' })}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByLabelText(/shared/i)).toBeInTheDocument()
  })

  it('does not show a shared-chat badge for a private chat', () => {
    render(
      <ChatListItem
        chat={session()}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText(/shared/i)).not.toBeInTheDocument()
  })

  it('seeds rename from the visible first-question label and persists it as the title', async () => {
    const user = userEvent.setup()
    const onRename = vi.fn().mockResolvedValue(undefined)
    render(
      <ChatListItem
        chat={session({
          messages: [{ id: 'u1', role: 'user', content: 'What is the refund policy?' }],
        })}
        isActive={false}
        onSelect={vi.fn()}
        onRename={onRename}
        onDelete={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(screen.getByText('Rename'))
    const input = screen.getByDisplayValue('What is the refund policy?')
    await user.clear(input)
    await user.type(input, 'Refund notes{Enter}')

    expect(onRename).toHaveBeenCalledWith('s1', 'Refund notes')
  })

  it('shows a spinner next to the title and disables the options button while a rename request is in flight', async () => {
    const user = userEvent.setup()
    let resolveRename: () => void
    const onRename = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRename = () => resolve()
        }),
    )
    render(
      <ChatListItem
        chat={session()}
        isActive={false}
        onSelect={vi.fn()}
        onRename={onRename}
        onDelete={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(screen.getByText('Rename'))
    await user.type(screen.getByDisplayValue('Session 15 Sep 2026 (1)'), ' updated{Enter}')

    expect(onRename).toHaveBeenCalledWith('s1', 'Session 15 Sep 2026 (1) updated')
    expect(screen.getByTestId('rename-spinner')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chat options' })).toBeDisabled()

    resolveRename!()
    await waitFor(() => expect(screen.queryByTestId('rename-spinner')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Chat options' })).not.toBeDisabled()
  })

  it('shows a spinner next to the title and disables the options button while `moving` is true', () => {
    // `moving` is driven by `Sidebar` (see ChatListItemProps' doc for why:
    // a move relocates this row to a different project's list, which
    // unmounts/remounts the component and would lose any local state) —
    // this row-level unit test only needs to assert the prop is honoured,
    // not the actual move round-trip (covered in Sidebar.test.tsx).
    render(
      <ChatListItem
        chat={session()}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        moving
      />,
    )

    expect(screen.getByTestId('move-chat-spinner')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chat options' })).toBeDisabled()
  })

  it('forwards its ref to the underlying <button> DOM node', () => {
    // Regression test for a live bug: antd's `Dropdown` clones this
    // component with a ref it uses to measure/position the popup. Without
    // `forwardRef`, that ref is silently dropped (no dev warning under
    // React 19) and the "..." menu never gets positioned next to the
    // button — it renders far off-screen. RTL's `getByRole` can't catch
    // this (it finds the button in the DOM regardless of whether React
    // ever attached a ref to it), so this asserts the ref contract
    // directly instead.
    const ref = React.createRef<HTMLButtonElement>()
    render(<ChatOptionsButton ref={ref} menuOpen={false} onClick={vi.fn()} />)

    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
  })
})

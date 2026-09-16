import { Input, Tooltip } from 'antd'
import { useState } from 'react'
import {
  ChatCategorizeIcon,
  ChatCloseIcon,
  ChatInfoIcon,
  ChatMetadataIcon,
  ChatSendIcon,
  ChatSummarizeIcon,
} from '../icons/chat'
import type { QueryTier } from '../api/types/query'
import { getSendDisabledReason } from '../utils/chatComposerGate'
import { type, typeColor } from '../styles/typography'
import { radius } from '../styles/theme'
import { useMediaQuery } from '../hooks/useMediaQuery'
import QueryTierDropdown from './QueryTierDropdown'

// Below this width the composer switches to a two-row toolbar (files chip +
// tier dropdown on row 1, action buttons on row 2) and, only where a full
// label still doesn't fit (Extract metadata), drops to a short visible
// label with the full word moved into the tooltip.
const PHONE_QUERY = '(max-width: 479.98px)'

/** The tooltip for a composer action button. Concise by design (client
 * feedback: no "<Action> — reason" prefix, no trailing explanation) — when
 * disabled it is just the short reason; when enabled it only carries
 * anything at all if the visible label itself is abbreviated (currently
 * only Extract metadata, at phone width), in which case it's just the full
 * word. */
function composerTooltipTitle(
  fullLabel: string,
  visibleLabel: string,
  disabledReason: string | null | undefined,
): string | undefined {
  if (disabledReason) return disabledReason
  return visibleLabel === fullLabel ? undefined : fullLabel
}

interface ChatInputProps {
  selectedCount: number
  selectedFiles?: string[]
  onClearSelection: () => void
  onSend: (message: string) => void
  onSummarize: () => void
  onCategorize: () => void
  onExtractMetadata: () => void
  onStop: () => void
  /** Round 6, Item B: fired when the composer textarea gains focus, so
   * AppLayout can scroll the chat pane to the bottom once — the on-screen
   * keyboard opening shrinks the visible viewport and can leave the
   * latest turn scrolled out of view above the composer. */
  onComposerFocus?: () => void
  isResponding?: boolean
  disabled?: boolean
  disabledReason?: string
  summarizeDisabledReason?: string | null
  categorizeDisabledReason?: string | null
  extractMetadataDisabledReason?: string | null
  queryTier: QueryTier
  onQueryTierChange: (tier: QueryTier) => void
  /** True for a shared chat the viewer can only read — the owner shared it
   * as "Anyone with the link can view" rather than "...and ask". Disables
   * the textarea/send regardless of `disabled`/`selectedCount` and swaps
   * the placeholder for `viewOnlyPlaceholder`. */
  viewOnly?: boolean
  viewOnlyPlaceholder?: string
  /** True for a shared queryable chat with no manual file selection — the
   * query uses the chat's own scope instead, so the composer behaves as if
   * files were already selected (enabled, sendable). */
  allowEmptySelection?: boolean
  /** Placeholder shown when `allowEmptySelection` is set and nothing is
   * manually selected. */
  emptySelectionPlaceholder?: string
  /** For a shared chat the viewer can query: the host's currently chosen
   * files, rendered as read-only chips in place of the normal editable
   * files pill — the viewer can't change these (see `sharedScopeEmpty`
   * for when there are none). `filename` is `null` when the viewer can't
   * resolve it locally; shown as "File <id>" instead of being dropped. */
  sharedScopeFiles?: { documentId: string; filename: string | null }[]
  /** True when `allowEmptySelection` is set but the host hasn't chosen
   * any files yet — forces the composer to a disabled state with a
   * placeholder distinct from `emptySelectionPlaceholder` (which implies
   * there IS a scope to fall back to). */
  sharedScopeEmpty?: boolean
  /** True for the viewer of a shared chat they don't own — mirrors
   * AppLayout's own `isSharedChat` (`activeSession?.isOwner === false`).
   * Prefixes the disclaimer line with "This is a shared chat." (client
   * feedback, "Sharing Query": add that prefix on top of the existing
   * "not context-aware" line). */
  isSharedChat?: boolean
  /** True only for the OWNER of a chat currently shared with query ("view
   * and ask") permission — shows a rooftop banner above the composer
   * warning that sending a message updates what recipients can see and
   * query (client feedback, "Sharing Input": "add an info panel... Maybe
   * a rooftop banner on top of the textbox (only for chat shared with
   * view and ask permissions)"). Never shown for a private chat, a
   * view-only shared chat, or to a non-owner viewer. */
  isHostOfQueryShare?: boolean
}

// Numbered, single-line-per-entry list (client feedback: "they should be
// numbered, try to keep the texts compact without wrapping").
//
// Root cause (round 3, Item A): this used to be Tailwind's `list-decimal`
// (a native list-style marker) plus `truncate` directly on the `<li>`.
// `truncate` sets `overflow: hidden` on whatever it's applied to, and for
// a `list-style-position: outside` marker (the default) the marker box is
// painted in that same element's own box — so putting `overflow: hidden`
// on the `<li>` clips its own "1." … "5." marker along with the text, in
// every browser tested live. The fix drops native list markers entirely:
// `.docu-selected-files-item` (index.css) renders the number as a CSS
// counter in a flex row, and only the filename's own inner `<span>` (never
// the `<li>`) carries `overflow: hidden` — ellipsizing the filename can no
// longer clip the number next to it. See the CSS comment in index.css for
// the rest of the reasoning, including the left-alignment and popover-width
// fixes. `role="list"` guards against Safari/VoiceOver dropping list
// semantics once native markers (and the `list-style` they imply) are gone.
function SelectedFilesTooltip({ files }: { files: string[] }) {
  if (files.length === 0) return null
  return (
    <ol
      role="list"
      className="docu-selected-files-list m-0 max-h-56 overflow-y-auto space-y-0.5"
    >
      {files.map((filename) => (
        <li key={filename} className="docu-selected-files-item text-xs leading-tight">
          <span className="truncate">{filename}</span>
        </li>
      ))}
    </ol>
  )
}

export default function ChatInput({
  selectedCount,
  selectedFiles = [],
  onClearSelection,
  onSend,
  onSummarize,
  onCategorize,
  onExtractMetadata,
  onStop,
  onComposerFocus,
  isResponding = false,
  disabled = false,
  disabledReason,
  summarizeDisabledReason = null,
  categorizeDisabledReason = null,
  extractMetadataDisabledReason = null,
  queryTier,
  onQueryTierChange,
  viewOnly = false,
  viewOnlyPlaceholder,
  allowEmptySelection = false,
  emptySelectionPlaceholder,
  sharedScopeFiles,
  sharedScopeEmpty = false,
  isSharedChat = false,
  isHostOfQueryShare = false,
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const isPhone = useMediaQuery(PHONE_QUERY)

  const hasScope = !sharedScopeEmpty && (selectedCount > 0 || allowEmptySelection)
  const canSend = !isResponding && !disabled && !viewOnly && value.trim().length > 0 && hasScope
  const canSummarize = summarizeDisabledReason == null
  const canCategorize = categorizeDisabledReason == null
  const canExtractMetadata = extractMetadataDisabledReason == null
  const sendDisabledReason = getSendDisabledReason({
    selectedCount,
    hasMessage: value.trim().length > 0,
    isResponding,
    disabled: disabled || viewOnly || sharedScopeEmpty,
    allowEmptySelection: allowEmptySelection && !sharedScopeEmpty,
  })

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || isResponding || disabled || viewOnly || !hasScope) return
    onSend(trimmed)
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Shared between the desktop (one row) and phone (two row) toolbar
  // layouts below, so the buttons themselves — labels, handlers,
  // aria-labels, tooltip content — are defined once.
  const filesChip =
    selectedCount > 0 ? (
      <div className="docu-chat-composer-files-wrap">
        <Tooltip
          title={<SelectedFilesTooltip files={selectedFiles} />}
          placement="top"
          mouseEnterDelay={0.2}
          overlayClassName="docu-selected-files-tooltip"
          // antd v6 caps the tooltip ROOT (`.ant-tooltip`, the
          // `tooltipMaxWidth` token) at 250px via CSS-in-JS. The old
          // `.docu-selected-files-tooltip .ant-tooltip-inner { max-width:
          // 440px }` rule in index.css targeted the INNER content box, a
          // child of that already-capped root — a child can never render
          // wider than its parent's content box, so the rule was silently
          // a no-op (measured live: popover stayed 250px wide at both
          // 1440 and 390 viewports). `styles.root` (overlayStyle is
          // deprecated) sets an inline style on the root element itself,
          // which wins regardless of any stylesheet's specificity, and
          // reuses the same `isPhone`/`PHONE_QUERY` breakpoint as the rest
          // of the composer instead of a parallel CSS media query.
          styles={{ root: { maxWidth: isPhone ? 'calc(100vw - 32px)' : 440 } }}
        >
          <span
            className="docu-chat-composer-files"
            aria-label={`${selectedCount} file${selectedCount === 1 ? '' : 's'} selected`}
          >
            {selectedCount} {selectedCount === 1 ? 'file' : 'files'}
          </span>
        </Tooltip>
        <button
          type="button"
          onClick={onClearSelection}
          className="docu-chat-composer-files-clear"
          aria-label="Clear selection"
        >
          <ChatCloseIcon className="text-inherit" />
        </button>
      </div>
    ) : null

  // A shared queryable chat's host-chosen files — read-only (no clear
  // control, the viewer can't change these), rendered in place of
  // `filesChip` above. Only rendered when there's something to show;
  // `sharedScopeEmpty` gets its own disabled placeholder instead.
  //
  // Collapsed into one aggregate count pill rather than a chip per file
  // (client feedback, "Sharing Input": "the pill that would show the
  // files selected is good enough, don't enumerate the files out it's
  // weird... the pill can be clicked but don't have the x button") —
  // reuses the owner's own `docu-chat-composer-files` class so the two
  // pills are visually identical ("standardise this into the normal text
  // input"), just without `filesChip`'s clear/✕ button.
  const sharedFilesChip =
    sharedScopeFiles && sharedScopeFiles.length > 0 ? (
      <span
        className="docu-chat-composer-files"
        aria-label={`${sharedScopeFiles.length} ${sharedScopeFiles.length === 1 ? 'file' : 'files'} selected by the chat owner`}
      >
        {sharedScopeFiles.length} {sharedScopeFiles.length === 1 ? 'file' : 'files'}
      </span>
    ) : null

  const tierDropdown = (
    <QueryTierDropdown
      tier={queryTier}
      onChange={onQueryTierChange}
      disabled={disabled || isResponding}
    />
  )

  const summarizeButton = (
    <Tooltip
      title={composerTooltipTitle('Summarize', 'Summarize', summarizeDisabledReason)}
      placement="top"
      mouseEnterDelay={0.2}
    >
      <span className="inline-flex">
        <button
          type="button"
          onClick={onSummarize}
          disabled={!canSummarize}
          className="docu-chat-composer-summarize"
          aria-label="Summarize selected document"
        >
          <ChatSummarizeIcon aria-hidden />
          <span>Summarize</span>
        </button>
      </span>
    </Tooltip>
  )

  const categorizeButton = (
    <Tooltip
      title={composerTooltipTitle('Categorize', 'Categorize', categorizeDisabledReason)}
      placement="top"
      mouseEnterDelay={0.2}
    >
      <span className="inline-flex">
        <button
          type="button"
          onClick={onCategorize}
          disabled={!canCategorize}
          className="docu-chat-composer-categorize"
          aria-label="Categorize selected document"
        >
          <ChatCategorizeIcon aria-hidden />
          <span>Categorize</span>
        </button>
      </span>
    </Tooltip>
  )

  // The one label that still abbreviates at phone width — "Extract
  // metadata" doesn't fit next to Summarize/Categorize's full words on
  // row 2 at 390px (Task 4 brief).
  const extractLabel = isPhone ? 'Extract' : 'Extract metadata'
  const extractButton = (
    <Tooltip
      title={composerTooltipTitle('Extract metadata', extractLabel, extractMetadataDisabledReason)}
      placement="top"
      mouseEnterDelay={0.2}
    >
      <span className="inline-flex">
        <button
          type="button"
          onClick={onExtractMetadata}
          disabled={!canExtractMetadata}
          className="docu-chat-composer-extract"
          aria-label="Extract metadata"
        >
          <ChatMetadataIcon aria-hidden />
          <span>{extractLabel}</span>
        </button>
      </span>
    </Tooltip>
  )

  const sendButton = (
    <div className="docu-chat-composer-send-wrap shrink-0">
      <Tooltip title={sendDisabledReason ?? undefined} placement="top" mouseEnterDelay={0.2}>
        <span className="inline-flex">
          <button
            type="button"
            onClick={isResponding ? onStop : handleSend}
            disabled={!isResponding && !canSend}
            className={`w-9 h-9 ${radius.full} flex items-center justify-center transition-colors ${
              isResponding || canSend
                ? 'bg-[#0084ff] hover:bg-[#0077e6]'
                : 'bg-[#ececec] cursor-not-allowed'
            }`}
            aria-label={isResponding ? 'Stop response' : 'Send message'}
          >
            {isResponding ? (
              <span className="block w-3 h-3 bg-white rounded-[2px]" aria-hidden />
            ) : (
              <ChatSendIcon className={canSend ? '!text-white' : '!text-[#8e8e8e]'} />
            )}
          </button>
        </span>
      </Tooltip>
    </div>
  )

  return (
    <div className="docu-chat-input-footer shrink-0 bg-[var(--docu-bg-app)] pb-[env(safe-area-inset-bottom,0px)]">
      {/* max-w-3xl matches the conversation column above (AppLayout.tsx) —
          one consistent column width for the whole page. */}
      <div className="max-w-3xl mx-auto docu-chat-input">
        {disabledReason && (
          <p
            className={`flex items-center gap-1.5 ${type.caption} ${typeColor.secondary} px-1 mb-2`}
          >
            <ChatInfoIcon className="shrink-0 text-[var(--docu-text-muted)]" aria-hidden />
            {disabledReason}
          </p>
        )}

        <div className="docu-chat-input-stack">
        {isHostOfQueryShare && (
          <div className="docu-chat-composer-host-banner text-center">
            Sending a message will update what the recipients can see and query.
          </div>
        )}
        {/* Two rows at every width (fix round 1: at 1440px a single row
            squeezed the textarea to ~200px and wrapped the placeholder to
            three lines) — row 1 is the textarea alone, full width; row 2
            is the toolbar (left cluster + send). `flex-col` replaces the
            old single-row `flex items-center`. */}
        <div className="docu-chat-composer flex flex-col gap-2">
          <div className="docu-chat-composer-textarea-wrap w-full min-w-0">
            <Input.TextArea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={onComposerFocus}
              placeholder={
                viewOnly
                  ? (viewOnlyPlaceholder ?? 'View only')
                  : sharedScopeEmpty
                    ? 'The chat owner has not chosen files yet'
                    : selectedCount > 0
                      ? 'Ask a question about the selected documents'
                      : allowEmptySelection
                        ? (emptySelectionPlaceholder ?? 'Ask a question')
                        : 'Select documents first'
              }
              disabled={disabled || viewOnly || !hasScope}
              autoSize={{ minRows: 1, maxRows: 6 }}
              variant="borderless"
              className={`w-full !px-0 !py-0 ${type.body} !shadow-none resize-none !leading-6`}
            />
          </div>

          {isPhone ? (
            // Phone (<480px): two rows (client feedback — "break the pills
            // into new line"). Row 1 keeps the files chip + tier dropdown
            // with the send button at its right; row 2 is the three action
            // buttons, each with room for its full label now that they no
            // longer share a row with the chip/dropdown (only Extract
            // metadata still abbreviates, to "Extract", since it's the one
            // label that doesn't fit next to the other two at 390px).
            <div className="docu-chat-composer-toolbar flex flex-col gap-2">
              <div className="docu-chat-composer-row1 flex items-center gap-2">
                <div className="flex items-center flex-1 min-w-0 gap-2">
                  {filesChip}
                  {sharedFilesChip}
                  {tierDropdown}
                </div>
                {sendButton}
              </div>
              <div className="docu-chat-composer-row2 docu-chat-composer-actions flex items-center flex-wrap gap-2">
                {summarizeButton}
                {categorizeButton}
                {extractButton}
              </div>
            </div>
          ) : (
            <div className="docu-chat-composer-toolbar flex items-center gap-2">
              {/* Left cluster — wraps onto a further line only when it
                  doesn't fit; the right-hand send button below stays put,
                  vertically centred against whatever height this cluster
                  ends up at. */}
              <div className="docu-chat-composer-actions flex items-center flex-wrap flex-1 min-w-0">
                <div className="docu-chat-composer-lead flex items-center gap-1 shrink-0">
                  {filesChip}
                  {sharedFilesChip}
                </div>
                {tierDropdown}
                {summarizeButton}
                {categorizeButton}
                {extractButton}
              </div>
              {sendButton}
            </div>
          )}
        </div>

        {/* Centred, single line at desktop/tablet widths where the 48rem
            column comfortably fits it; left free to wrap on its own below
            that (no forced truncation — this line carries real
            information about single-question mode, not just decoration). */}
        <p className={`docu-chat-input-disclaimer ${type.caption} ${typeColor.muted} text-center`}>
          {isSharedChat && (
            <>
              This is a <span className={typeColor.primary}>shared chat</span>.{' '}
            </>
          )}
          This chat is <span className={typeColor.primary}>not context-aware</span>. Each
          question is a <span className={typeColor.primary}>separate question</span>, not a
          follow-up.
        </p>
        </div>
      </div>
    </div>
  )
}

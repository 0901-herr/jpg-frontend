import { Typography } from 'antd'
import { useMemo, useRef } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { type, typeColor } from '../styles/typography'
import { radius } from '../styles/theme'
import { createAnswerMarkdownComponents, createStreamingTailPlugin } from '../utils/markdownRenderers'
import { useElapsedSeconds } from '../hooks/useElapsedSeconds'
import { ChatBubbleIcon, ChatInfoIcon } from '../icons/chat'
import type { ChatMessage, CoverageInfo, Source } from '../types'
import CitationList from './CitationList'

const { Text } = Typography

/** The long, silent phase (mostly `generating`, on CPU) is when a bare
 * label starts looking stuck — this is when to start ticking a
 * " · {n}s" suffix onto it, driven by the message's own `startedAt` (via
 * `useElapsedSeconds`) rather than a per-component mount time, so the count
 * matches however long the whole answer has actually been in flight. */
function shouldTickLabel(stage: string | undefined, elapsedSeconds: number): boolean {
  return stage === 'generating' || elapsedSeconds >= 4
}

function ThinkingIndicator({ message }: { message: ChatMessage }) {
  // `message.startedAt` is set by AppLayout when the placeholder assistant
  // message is created; a flow that doesn't set it (e.g. Extract metadata)
  // falls back to this component's own mount time so the indicator still
  // counts up from something sensible.
  const fallbackStartedAtRef = useRef(Date.now())
  const startedAt = message.startedAt ?? fallbackStartedAtRef.current
  const elapsed = useElapsedSeconds(startedAt, true)

  const label = message.progressLabel
  const headline = label
    ? shouldTickLabel(message.progressStage, elapsed)
      ? `${label} · ${elapsed}s`
      : label
    : 'Getting started…'

  return (
    <div className="space-y-1" aria-live="polite">
      <span className={`${type.body} ${typeColor.muted} docu-thinking-shimmer block`}>
        {headline}
      </span>
    </div>
  )
}

/** The short progress label shown above the answer once streaming has
 * started but no content has arrived yet (between citation and generating
 * events, say). Ticks the same " · {n}s" suffix as `ThinkingIndicator` once
 * the silent phase has run long enough — using the same `startedAt` so the
 * two never disagree about how long the query has been running. */
function StreamingProgressLabel({ message }: { message: ChatMessage }) {
  const active = message.status === 'streaming' && !message.content
  const elapsed = useElapsedSeconds(message.startedAt, active)
  const label = message.progressLabel
  if (!label) return null

  const text =
    active && shouldTickLabel(message.progressStage, elapsed) ? `${label} · ${elapsed}s` : label

  return <p className={`${type.caption} ${typeColor.muted}`}>{text}</p>
}

/** A quiet inline callout — thin border, muted background, small icon —
 * for every status/error/abstain state (client feedback: UI polish pass).
 * Replaces the earlier loud amber/yellow alert box: the copy asserted by
 * tests is unchanged, only the presentation. */
function ErrorMessage({
  content,
  progressHint,
}: {
  content: string
  progressHint?: string
}) {
  return (
    <div
      className={`${radius.md} border border-[#ececec] bg-[var(--docu-bg-muted)] px-4 py-3 ${type.body} ${typeColor.body}`}
      role="alert"
    >
      <p className="flex items-center gap-2 font-medium mb-1">
        <ChatInfoIcon className="shrink-0 text-[var(--docu-text-muted)]" aria-hidden />
        Couldn&apos;t finish this answer
      </p>
      <p className="leading-relaxed">{content}</p>
      {progressHint && (
        <p className={`${type.caption} mt-2 ${typeColor.secondary}`}>
          Last step: {progressHint.replace(/…$/, '')}
        </p>
      )}
    </div>
  )
}

interface AssistantMessageProps {
  message: ChatMessage
}

function formatThoughtDuration(seconds: number): string {
  return `Thought for ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`
}

function InterruptedNote() {
  return (
    <p className={`${type.caption} ${typeColor.muted} italic`}>Answer interrupted.</p>
  )
}

/** Shown above the answer text instead of a progress label or related
 * documents when the backend abstained — retrieval found nothing it could
 * answer from. A short, honest caption rather than silently rendering the
 * canned "couldn't find relevant content" answer as if it were backed by
 * sources. */
function AbstainedCaption() {
  return <p className={`${type.caption} ${typeColor.muted}`}>No matching content</p>
}

function CoverageNotice({ coverage }: { coverage?: CoverageInfo }) {
  const indexing = coverage?.indexing_files ?? 0
  if (indexing <= 0) return null

  const total = coverage?.total_files
  const ready = coverage?.ready_files ?? 0
  const scope =
    total != null ? `${ready} of ${total} selected documents ready` : `${indexing} still indexing`

  return (
    <p className={`${type.caption} ${typeColor.muted} leading-relaxed`} role="status">
      {scope}. Some documents are still indexing, so the answer may be incomplete.
    </p>
  )
}

/** Renders `message.content` as Markdown (short paragraphs, bullet/numbered
 * lists, tables — whatever the LLM produced) while keeping `[DocN]`
 * citation markers as clickable `CitationLink`s wherever they land in the
 * tree, including nested inside list items or bold text. Raw HTML is never
 * rendered: only remark-gfm is enabled, and rehype-raw is deliberately not
 * added.
 *
 * `liveText` is only passed while a message is streaming (`undefined`
 * otherwise, which is the default). When set, the raw in-flight preview
 * text and a blinking cursor are appended as trailing inline children of
 * the *last* rendered block (via `createStreamingTailPlugin`) so they
 * continue on the same line as the finalized text instead of dropping to
 * a new line below it — `<p>`/`<li>`/etc. are block-level, so a plain
 * sibling after the whole tree would otherwise always start its own line.
 * A finished message (`liveText` omitted) renders exactly as before. */
export function MarkdownAnswer({
  content,
  sources,
  liveText,
}: {
  content: string
  sources: Source[]
  liveText?: string
}) {
  const components = useMemo(() => createAnswerMarkdownComponents(sources), [sources])
  const rehypePlugins = useMemo(
    () => (liveText === undefined ? [] : [createStreamingTailPlugin(liveText)]),
    [liveText],
  )
  return (
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} components={components}>
      {content}
    </Markdown>
  )
}

function AnswerContent({ message }: { message: ChatMessage }) {
  const sources = message.sources ?? []
  const isStreaming = message.status === 'streaming'

  return (
    <div
      // `docu-answer` scopes the unlayered table/list rules in
      // src/index.css (`.docu-answer table`, `.docu-answer th`, …) to just
      // the rendered answer, so they can never leak into the sidebar or
      // any other plain table/list elsewhere in the app.
      className={`docu-answer ${type.body} ${typeColor.body} leading-relaxed min-w-0 break-words [overflow-wrap:anywhere]`}
    >
      <MarkdownAnswer
        content={message.content}
        sources={sources}
        liveText={isStreaming ? (message.liveText ?? '') : undefined}
      />
    </div>
  )
}

function AssistantMessage({ message }: AssistantMessageProps) {
  if (message.status === 'error') {
    return (
      <ErrorMessage content={message.content} progressHint={message.progressLabel} />
    )
  }

  if (message.status === 'thinking') {
    return (
      <div className="space-y-2">
        <CoverageNotice coverage={message.coverage} />
        <ThinkingIndicator message={message} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <CoverageNotice coverage={message.coverage} />
      {message.status === 'streaming' && <StreamingProgressLabel message={message} />}
      {message.abstained && <AbstainedCaption />}
      <AnswerContent message={message} />
      {message.interrupted && <InterruptedNote />}

      {message.thinkingSeconds != null &&
        message.thinkingSeconds > 0 &&
        message.status !== 'streaming' && (
          <p className={`${type.caption} text-[#8e8e8e] block leading-relaxed mt-8`}>
            {formatThoughtDuration(message.thinkingSeconds)}
          </p>
        )}

      {!message.abstained &&
        message.sources &&
        message.sources.length > 0 &&
        message.status !== 'streaming' && <CitationList sources={message.sources} />}
    </div>
  )
}

/** A small muted label above every assistant turn (client feedback: UI
 * polish pass) — not a heavy card, just enough to read as "this is the
 * assistant speaking" the way a mainstream AI-chat layout marks its
 * replies, without repeating on every paragraph inside one answer. */
function AssistantLabel() {
  return (
    <div className="flex items-center gap-1.5 mb-2" aria-hidden="true">
      <ChatBubbleIcon sx={{ fontSize: 16 }} className={typeColor.muted} />
      <span className={`${type.caption} font-medium ${typeColor.muted}`}>ARCHE AI</span>
    </div>
  )
}

interface ChatMessageItemProps {
  message: ChatMessage
  showDivider?: boolean
}

export default function ChatMessageItem({ message, showDivider }: ChatMessageItemProps) {
  return (
    <div className="min-w-0">
      {message.role === 'user' ? (
        <div
          className={`inline-block bg-[#f4f4f4] ${radius.lg} px-4 py-3 mt-6 mb-4 max-w-[min(36rem,100%)] min-w-0 break-words [overflow-wrap:anywhere]`}
        >
          <Text className={`${type.body} ${typeColor.body}`}>{message.content}</Text>
        </div>
      ) : (
        <div className="mb-4">
          <AssistantLabel />
          <AssistantMessage message={message} />
        </div>
      )}
      {showDivider && <hr className="my-6 border-0 border-t border-[#ececec]" />}
    </div>
  )
}

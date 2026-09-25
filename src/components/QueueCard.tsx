import { type, typeColor } from '../styles/typography'
import { radius } from '../styles/theme'
import { ChatQueueIcon } from '../icons/chat'
import { formatFriendlyEta, formatQueueLine } from '../utils/queryProgress'

interface QueueCardProps {
  position?: number
  ahead?: number
  etaSeconds?: number
}

/** Calm inline card shown in the pending answer bubble while a query waits
 * for a free LLM slot (design doc §4.1/§4.3's in-stream admission queue) —
 * "You're #3 in line" plus a friendly-units ETA ("about 4 min"), replacing
 * the plain-text progress ticker for exactly the `queued` stage.
 *
 * Disappears the moment the message leaves the `queued` stage — that
 * decision belongs to `ChatMessage.tsx`'s `AssistantMessage` (it swaps
 * this out for `ThinkingIndicator` once `progressStage` moves on, and the
 * whole "thinking" branch disappears once the first token/citation flips
 * `status` to `streaming`); this component only ever renders whatever
 * position/ahead/ETA it's given, defensively — a missing or garbled field
 * (see `formatQueueLine`/`formatFriendlyEta` in `queryProgress.ts`) simply
 * omits that line rather than showing "#undefined" or "about NaN min".
 *
 * `role="status"` + `aria-live="polite"` (not `assertive`) announces each
 * update to a screen reader without interrupting whatever the user is
 * doing, matching `ThinkingIndicator`'s own live region one level up. */
export default function QueueCard({ position, ahead, etaSeconds }: QueueCardProps) {
  const line = formatQueueLine(position, ahead)
  const eta = formatFriendlyEta(etaSeconds)

  return (
    <div
      className={`${radius.md} border border-[#ececec] bg-[var(--docu-bg-muted)] px-4 py-3`}
      role="status"
      aria-live="polite"
    >
      <p className={`flex items-center gap-2 font-medium ${type.body} ${typeColor.body}`}>
        <ChatQueueIcon className="shrink-0 text-[var(--docu-text-muted)]" aria-hidden />
        {line ?? "You're in the queue"}
      </p>
      {eta && <p className={`${type.caption} mt-1 ml-6 ${typeColor.secondary}`}>{eta}</p>}
    </div>
  )
}

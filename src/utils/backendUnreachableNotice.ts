/**
 * Coordinates two independent "the backend is unreachable" notices that
 * otherwise fire from the exact same root cause on the same app load —
 * `useChatStore`'s hydration-failure toast ("Could not load your chats...")
 * and the sidebar's own persistent card (`useBrowseTree`'s `initError`,
 * specifically the `FOLDER_LOAD_SERVER_ERROR` flavor — a 403/permission
 * card is a different, unrelated failure and never suppresses anything
 * here). Both hooks fire their own request on mount and fail
 * independently, so either one can resolve first (P1-3, UI polish pass).
 *
 * The card is persistent and visually dominant, so it always wins:
 * - If the card has already claimed the notice by the time the toast is
 *   about to show, `shouldShowUnreachableToast` returns false and the
 *   toast never appears.
 * - If the toast showed first and the card claims the notice a moment
 *   later, `markUnreachableCardShown` dismisses that toast retroactively
 *   (via the close handle `message.error(...)` itself returns, registered
 *   through `registerUnreachableToastDismiss`).
 *
 * Module-level singleton state, matching the scope of what it coordinates
 * (one app instance, one outstanding "is the backend down" notice) — reset
 * between tests via `resetBackendUnreachableNotice`.
 */

let cardShown = false
let activeToastDismiss: (() => void) | null = null

/** Called by `useChatStore` right before it would show its hydration-
 * failure toast. */
export function shouldShowUnreachableToast(): boolean {
  return !cardShown
}

/** Called by `useChatStore` right after that toast is shown, so a card
 * that shows up a moment later can dismiss it retroactively. `dismiss` is
 * the close handle `message.error(...)` itself returns. */
export function registerUnreachableToastDismiss(dismiss: () => void): void {
  activeToastDismiss = dismiss
}

/** Called once that toast has settled on its own (auto-dismissed after its
 * normal duration) — clears the handle so a later, unrelated card doesn't
 * try to close a toast that isn't showing anymore. */
export function clearUnreachableToastDismiss(): void {
  activeToastDismiss = null
}

/** Called by `useBrowseTree` right as it shows the sidebar's persistent
 * "Could not load folders" card (the server/network flavor only —
 * `FOLDER_LOAD_SERVER_ERROR`). Claims the notice for the card and
 * dismisses any chat-load toast already on screen for the same cause. */
export function markUnreachableCardShown(): void {
  cardShown = true
  activeToastDismiss?.()
  activeToastDismiss = null
}

/** Test-only: clears all state between tests. */
export function resetBackendUnreachableNotice(): void {
  cardShown = false
  activeToastDismiss = null
}

export function getSendDisabledReason(options: {
  selectedCount: number
  hasMessage: boolean
  isResponding: boolean
  disabled: boolean
  /** True for a shared queryable chat with no manual file selection — it
   * queries the chat's own scope instead, so zero selected documents is
   * never a reason to block sending. */
  allowEmptySelection?: boolean
  /** True while this chat has a Summarize/Categorize/Extract metadata
   * action in flight, or is waiting on a background answer to finish
   * generating — blocks Send with its own reason, distinct from
   * `isResponding` (which swaps Send for Stop). */
  toolActionPending?: boolean
}): string | null {
  const { selectedCount, hasMessage, isResponding, disabled, allowEmptySelection, toolActionPending } =
    options

  if (isResponding) return null
  if (toolActionPending) return 'Wait for the current action to finish'
  if (selectedCount === 0 && !allowEmptySelection) return 'Select at least one document'
  if (disabled) return 'Sign in to continue'
  if (!hasMessage) return 'Enter a question first'
  return null
}

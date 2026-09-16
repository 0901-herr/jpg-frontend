export function getSendDisabledReason(options: {
  selectedCount: number
  hasMessage: boolean
  isResponding: boolean
  disabled: boolean
  /** True for a shared queryable chat with no manual file selection — it
   * queries the chat's own scope instead, so zero selected documents is
   * never a reason to block sending. */
  allowEmptySelection?: boolean
}): string | null {
  const { selectedCount, hasMessage, isResponding, disabled, allowEmptySelection } = options

  if (isResponding) return null
  if (selectedCount === 0 && !allowEmptySelection) return 'Select at least one document'
  if (disabled) return 'Sign in to continue'
  if (!hasMessage) return 'Enter a question first'
  return null
}

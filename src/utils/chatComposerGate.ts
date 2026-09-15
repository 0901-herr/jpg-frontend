export function getSendDisabledReason(options: {
  selectedCount: number
  hasMessage: boolean
  isResponding: boolean
  disabled: boolean
}): string | null {
  const { selectedCount, hasMessage, isResponding, disabled } = options

  if (isResponding) return null
  if (selectedCount === 0) return 'Select at least one document'
  if (disabled) return 'Sign in to continue'
  if (!hasMessage) return 'Enter a question first'
  return null
}

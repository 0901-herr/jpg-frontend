import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearUnreachableToastDismiss,
  markUnreachableCardShown,
  registerUnreachableToastDismiss,
  resetBackendUnreachableNotice,
  shouldShowUnreachableToast,
} from './backendUnreachableNotice'

// P1-3 (UI polish pass): the sidebar's persistent "Could not load folders"
// card and useChatStore's own hydration-failure toast both fire from the
// same root cause (the backend/adapter is unreachable) on the same app
// load — this module is what stops both from showing at once, however the
// two independent requests happen to race.
describe('backendUnreachableNotice', () => {
  beforeEach(() => {
    resetBackendUnreachableNotice()
  })

  it('allows the toast when no card has claimed the notice', () => {
    expect(shouldShowUnreachableToast()).toBe(true)
  })

  it('suppresses the toast once the card has already claimed the notice', () => {
    markUnreachableCardShown()
    expect(shouldShowUnreachableToast()).toBe(false)
  })

  it('dismisses an already-shown toast when the card claims the notice afterward', () => {
    const dismiss = vi.fn()
    registerUnreachableToastDismiss(dismiss)

    markUnreachableCardShown()

    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('does not call a dismiss handle that was cleared before the card claimed the notice (toast already settled on its own)', () => {
    const dismiss = vi.fn()
    registerUnreachableToastDismiss(dismiss)
    clearUnreachableToastDismiss()

    markUnreachableCardShown()

    expect(dismiss).not.toHaveBeenCalled()
  })

  it('only dismisses a toast once even if the card notice fires more than once', () => {
    const dismiss = vi.fn()
    registerUnreachableToastDismiss(dismiss)

    markUnreachableCardShown()
    markUnreachableCardShown()

    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('resets cleanly between app loads (test-only helper mirrors a fresh page load)', () => {
    markUnreachableCardShown()
    resetBackendUnreachableNotice()

    expect(shouldShowUnreachableToast()).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { getSendDisabledReason } from './chatComposerGate'

describe('getSendDisabledReason', () => {
  it('explains when no documents are selected', () => {
    expect(
      getSendDisabledReason({
        selectedCount: 0,
        hasMessage: true,
        isResponding: false,
        disabled: false,
      }),
    ).toBe('Select at least one document')
  })

  it('explains when message is empty', () => {
    expect(
      getSendDisabledReason({
        selectedCount: 2,
        hasMessage: false,
        isResponding: false,
        disabled: false,
      }),
    ).toBe('Enter a question first')
  })

  it('explains when signed out', () => {
    expect(
      getSendDisabledReason({
        selectedCount: 2,
        hasMessage: true,
        isResponding: false,
        disabled: true,
      }),
    ).toBe('Sign in to continue')
  })

  it('returns the provided disabledReason when disabled is true', () => {
    expect(
      getSendDisabledReason({
        selectedCount: 2,
        hasMessage: true,
        isResponding: false,
        disabled: true,
        disabledReason: 'Waiting for the current answer to finish',
      }),
    ).toBe('Waiting for the current answer to finish')
  })

  it('allows sending with zero selected documents when the chat has its own shared scope', () => {
    expect(
      getSendDisabledReason({
        selectedCount: 0,
        hasMessage: true,
        isResponding: false,
        disabled: false,
        allowEmptySelection: true,
      }),
    ).toBeNull()
  })

  it('returns null when send is allowed or while responding', () => {
    expect(
      getSendDisabledReason({
        selectedCount: 2,
        hasMessage: true,
        isResponding: false,
        disabled: false,
      }),
    ).toBeNull()

    expect(
      getSendDisabledReason({
        selectedCount: 0,
        hasMessage: false,
        isResponding: true,
        disabled: false,
      }),
    ).toBeNull()
  })
})

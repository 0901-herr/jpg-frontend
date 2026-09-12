import { describe, expect, it } from 'vitest'
import { formatServiceTarget } from './serviceEndpoint'

describe('formatServiceTarget', () => {
  it('extracts host and port from http URLs', () => {
    expect(formatServiceTarget('http://localhost:8001')).toBe('localhost:8001')
    expect(formatServiceTarget('https://rag.dev.localtest.me:8443')).toBe('rag.dev.localtest.me:8443')
  })

  it('passes through host:port values', () => {
    expect(formatServiceTarget('127.0.0.1:5672')).toBe('127.0.0.1:5672')
    expect(formatServiceTarget('localhost:7233')).toBe('localhost:7233')
  })

  it('returns null for empty values', () => {
    expect(formatServiceTarget(null)).toBeNull()
    expect(formatServiceTarget('')).toBeNull()
  })
})

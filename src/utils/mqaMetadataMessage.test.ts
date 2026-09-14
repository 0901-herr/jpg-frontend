import { describe, expect, it } from 'vitest'
import type { MqaMetadataResponse } from '../api/types/browse'
import { buildMqaMetadataAnswer } from './mqaMetadataMessage'

function response(overrides: Partial<MqaMetadataResponse> = {}): MqaMetadataResponse {
  return {
    document_id: '5003',
    filename: '01_Meeting_Minutes.pdf',
    fields: {
      'Document Title': 'Meeting Minutes',
      Faculty: 'Faculty of Engineering',
      'Programme name and code': 'BEng Civil (EN01)',
      'Academic year': '2023/2024',
      'Accreditation body': 'Not stated',
      'Programme Coordinator': 'Dr. Jane Tan',
    },
    comment: 'Arche AI extracted metadata — Document Title: Meeting Minutes; ...',
    pushed: true,
    push_error: null,
    ...overrides,
  }
}

describe('buildMqaMetadataAnswer', () => {
  it('renders a GFM table with the six fields in contract order', () => {
    const markdown = buildMqaMetadataAnswer(response())

    expect(markdown).toContain('**MQA metadata — 01_Meeting_Minutes.pdf**')
    expect(markdown).toContain('| Field | Value |')
    expect(markdown).toContain('| --- | --- |')

    const fieldOrder = [
      'Document Title',
      'Faculty',
      'Programme name and code',
      'Academic year',
      'Accreditation body',
      'Programme Coordinator',
    ]
    let lastIndex = -1
    for (const field of fieldOrder) {
      const idx = markdown.indexOf(`| ${field} |`)
      expect(idx).toBeGreaterThan(lastIndex)
      lastIndex = idx
    }
    expect(markdown).toContain('| Programme Coordinator | Dr. Jane Tan |')
  })

  it('notes the save to LogicalDOC when pushed is true', () => {
    expect(buildMqaMetadataAnswer(response({ pushed: true }))).toContain(
      'Saved to LogicalDOC as a document comment.',
    )
  })

  it('notes the failed save when pushed is false', () => {
    expect(buildMqaMetadataAnswer(response({ pushed: false, push_error: 'timeout' }))).toContain(
      'Could not save to LogicalDOC — the values are shown here.',
    )
  })

  it('escapes a literal pipe in a field value so it cannot break the table', () => {
    const markdown = buildMqaMetadataAnswer(
      response({ fields: { ...response().fields, Faculty: 'Eng | Science' } }),
    )
    expect(markdown).toContain('| Faculty | Eng \\| Science |')
  })
})

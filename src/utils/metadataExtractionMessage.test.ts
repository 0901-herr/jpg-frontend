import { describe, expect, it } from 'vitest'
import type { MetadataExtractionResponse } from '../api/types/browse'
import { buildMetadataExtractionAnswer } from './metadataExtractionMessage'

const FIELD_ORDER = [
  'Document Title',
  'Faculty',
  'Programme name and code',
  'Academic year',
  'Accreditation body',
  'Programme Coordinator',
]

function response(overrides: Partial<MetadataExtractionResponse> = {}): MetadataExtractionResponse {
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
    field_order: FIELD_ORDER,
    comment: 'Arche AI extracted metadata — Document Title: Meeting Minutes; ...',
    pushed: true,
    push_error: null,
    ...overrides,
  }
}

describe('buildMetadataExtractionAnswer', () => {
  it('renders a GFM table with every field in field_order', () => {
    const markdown = buildMetadataExtractionAnswer(response())

    expect(markdown).toContain('**Extracted metadata — 01_Meeting_Minutes.pdf**')
    expect(markdown).toContain('| Field | Value |')
    expect(markdown).toContain('| --- | --- |')

    let lastIndex = -1
    for (const field of FIELD_ORDER) {
      const idx = markdown.indexOf(`| ${field} |`)
      expect(idx).toBeGreaterThan(lastIndex)
      lastIndex = idx
    }
    expect(markdown).toContain('| Programme Coordinator | Dr. Jane Tan |')
  })

  it('notes the save to LogicalDOC when pushed is true', () => {
    expect(buildMetadataExtractionAnswer(response({ pushed: true }))).toContain(
      'Saved to LogicalDOC as extended properties.',
    )
  })

  it('notes the failed save when pushed is false', () => {
    expect(
      buildMetadataExtractionAnswer(response({ pushed: false, push_error: 'timeout' })),
    ).toContain('Could not save to LogicalDOC — the values are shown here.')
  })

  it('escapes a literal pipe in a field value so it cannot break the table', () => {
    const markdown = buildMetadataExtractionAnswer(
      response({ fields: { ...response().fields, Faculty: 'Eng | Science' } }),
    )
    expect(markdown).toContain('| Faculty | Eng \\| Science |')
  })

  it('appends extra fields after the fixed ones, in field_order', () => {
    const markdown = buildMetadataExtractionAnswer(
      response({
        fields: {
          ...response().fields,
          'Delivery Mode': 'Full-time',
          'Intake Semester': 'September',
        },
        field_order: [...FIELD_ORDER, 'Delivery Mode', 'Intake Semester'],
      }),
    )

    const fixedLastIdx = markdown.indexOf('| Programme Coordinator | Dr. Jane Tan |')
    const firstExtraIdx = markdown.indexOf('| Delivery Mode | Full-time |')
    const secondExtraIdx = markdown.indexOf('| Intake Semester | September |')

    expect(fixedLastIdx).toBeGreaterThan(-1)
    expect(firstExtraIdx).toBeGreaterThan(fixedLastIdx)
    expect(secondExtraIdx).toBeGreaterThan(firstExtraIdx)
  })

  it('renders no extra rows when field_order has none beyond the fixed set', () => {
    const markdown = buildMetadataExtractionAnswer(response())
    // Header + separator + the six fixed field rows, nothing more.
    const rowCount = markdown.split('\n').filter((line) => line.startsWith('| ')).length
    expect(rowCount).toBe(8)
  })

  it('renders an arbitrary field set unrelated to any fixed field list, to prove genericity', () => {
    const markdown = buildMetadataExtractionAnswer(
      response({
        filename: 'harvest-log.pdf',
        fields: {
          'Harvesting Date': '2026-03-14',
          'Block Number': 'B-12',
          'Yield (kg)': '4200',
        },
        field_order: ['Harvesting Date', 'Block Number', 'Yield (kg)'],
      }),
    )

    expect(markdown).toContain('**Extracted metadata — harvest-log.pdf**')
    expect(markdown).toContain('| Harvesting Date | 2026-03-14 |')
    expect(markdown).toContain('| Block Number | B-12 |')
    expect(markdown).toContain('| Yield (kg) | 4200 |')
    const rowCount = markdown.split('\n').filter((line) => line.startsWith('| ')).length
    expect(rowCount).toBe(5)
  })
})

import type { MqaMetadataFields, MqaMetadataResponse } from '../api/types/browse'

/** Fixed display order for the six MQA fields — matches the contract. */
const FIELD_ORDER: (keyof MqaMetadataFields)[] = [
  'Document Title',
  'Faculty',
  'Programme name and code',
  'Academic year',
  'Accreditation body',
  'Programme Coordinator',
]

/** Escape `|` inside a table cell so a value containing a literal pipe
 * can't split the Markdown table into extra columns. */
function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|')
}

/** Builds the Markdown answer shown after a successful extraction: a GFM
 * table of the six fields, followed by a line noting whether the result
 * was saved back to LogicalDOC as extended properties. */
export function buildMqaMetadataAnswer(response: MqaMetadataResponse): string {
  const rows = FIELD_ORDER.map(
    (field) => `| ${escapeCell(field)} | ${escapeCell(response.fields[field])} |`,
  )
  const savedLine = response.pushed
    ? 'Saved to LogicalDOC as extended properties.'
    : 'Could not save to LogicalDOC — the values are shown here.'

  return [
    `**MQA metadata — ${response.filename}**`,
    '',
    '| Field | Value |',
    '| --- | --- |',
    ...rows,
    '',
    savedLine,
  ].join('\n')
}

import type { MqaMetadataResponse } from '../api/types/browse'

/** Fixed display order for the six MQA fields — matches the contract. */
const FIELD_ORDER: string[] = [
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
/** Any labels beyond the fixed six — the document's own extended attribute
 * definitions the adapter found (Feature 3) — rendered in the same table,
 * after the six fixed rows, in the order the adapter reported them.
 * Defensive: falls back to the response's own key order when
 * `extra_fields` is absent (an older adapter response, or the extra-fields
 * setting turned off), so a field is never silently dropped. */
function extraFieldLabels(response: MqaMetadataResponse): string[] {
  if (response.extra_fields) return response.extra_fields
  return Object.keys(response.fields).filter((key) => !FIELD_ORDER.includes(key))
}

export function buildMqaMetadataAnswer(response: MqaMetadataResponse): string {
  const allFields = [...FIELD_ORDER, ...extraFieldLabels(response)]
  const rows = allFields.map(
    (field) => `| ${escapeCell(field)} | ${escapeCell(response.fields[field] ?? '')} |`,
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

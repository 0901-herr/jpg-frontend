import type { MetadataExtractionResponse } from '../api/types/browse'

/** Escape `|` inside a table cell so a value containing a literal pipe
 * can't split the Markdown table into extra columns. */
function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|')
}

/** Builds the Markdown answer shown after a successful extraction: a GFM
 * table of every field in `field_order`, followed by a line noting
 * whether the result was saved back to LogicalDOC as extended
 * properties. Renders whatever fields the backend returns — no fixed
 * field list assumed, so this works unchanged for any deployment's
 * configured field set. */
export function buildMetadataExtractionAnswer(response: MetadataExtractionResponse): string {
  const rows = response.field_order.map(
    (field) => `| ${escapeCell(field)} | ${escapeCell(response.fields[field] ?? '')} |`,
  )
  const savedLine = response.pushed
    ? 'Saved to LogicalDOC as extended properties.'
    : 'Could not save to LogicalDOC — the values are shown here.'

  return [
    `**Extracted metadata — ${response.filename}**`,
    '',
    '| Field | Value |',
    '| --- | --- |',
    ...rows,
    '',
    savedLine,
  ].join('\n')
}

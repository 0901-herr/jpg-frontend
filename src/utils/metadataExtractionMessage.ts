import type { MetadataExtractionResponse } from '../api/types/browse'

/** Escape `|` inside a table cell so a value containing a literal pipe
 * can't split the Markdown table into extra columns. */
function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|')
}

/** Fallback wording when the backend reports no fields configured but,
 * for some reason, sent no `comment` explaining why (defensive — the
 * adapter always sends one today). */
const DEFAULT_NO_FIELDS_MESSAGE =
  'No metadata fields are configured for this document in LogicalDOC, so there was nothing to extract.'

/** Builds the Markdown answer shown after an extraction attempt.
 *
 * Three distinct outcomes, told apart via `no_fields_configured`/
 * `pushed`/`push_error` rather than inferred from an empty table:
 *  - `no_fields_configured`: the document has no LogicalDOC template (or
 *    an empty one) — nothing was extracted. No table; a short sentence
 *    explaining why, instead of the misleading "could not save" line
 *    (nothing was ever attempted to be saved).
 *  - fields extracted and saved (`pushed`): the GFM table plus a
 *    confirmation line.
 *  - fields extracted but not saved: the GFM table plus the specific
 *    save-failure reason (`push_error`) when the backend gave one, else
 *    a generic fallback.
 *
 * Renders whatever fields the backend returns — no fixed field list
 * assumed, so this works unchanged for any deployment's configured field
 * set. */
export function buildMetadataExtractionAnswer(response: MetadataExtractionResponse): string {
  const heading = `**Extracted metadata — ${response.filename}**`

  if (response.no_fields_configured || response.field_order.length === 0) {
    return [heading, '', response.comment || DEFAULT_NO_FIELDS_MESSAGE].join('\n')
  }

  const rows = response.field_order.map(
    (field) => `| ${escapeCell(field)} | ${escapeCell(response.fields[field] ?? '')} |`,
  )
  const savedLine = response.pushed
    ? 'Saved to LogicalDOC as extended properties.'
    : response.push_error
      ? `Could not save to LogicalDOC — ${response.push_error}`
      : 'Could not save to LogicalDOC — the values are shown here.'

  return [heading, '', '| Field | Value |', '| --- | --- |', ...rows, '', savedLine].join('\n')
}

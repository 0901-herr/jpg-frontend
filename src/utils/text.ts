/** Append a streamed answer delta to existing text, inserting a separating
 * space when neither side already has whitespace at the join point.
 *
 * The backend streams full per-citation-segment sentences as separate
 * `answer` events, not sub-word tokens, so naive `content + delta`
 * concatenation runs consecutive sentences together with no space. This
 * heuristic assumes that granularity — it is not safe for genuine
 * sub-word token streaming (it can't tell "wor"+"ld" from two legitimate
 * one-word segments).
 */
export function joinAnswerText(existing: string, delta: string): string {
  if (!existing || !delta) return existing + delta
  const needsSpace = !/\s$/.test(existing) && !/^[\s.,;:!?)\]}]/.test(delta)
  return needsSpace ? `${existing} ${delta}` : existing + delta
}

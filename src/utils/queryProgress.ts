const STAGE_LABELS: Record<string, string> = {
  classifying: 'Understanding your question…',
  embedding: 'Understanding your question…',
  rewriting: 'Refining your question…',
  retrieving: 'Searching your documents…',
  reranking: 'Finding the best matches…',
  generating: 'Writing your answer…',
  assembly: 'Almost done. Putting your answer together…',
  assembling: 'Almost done. Putting your answer together…',
  synthesizing: 'Almost done. Putting your answer together…',
  composing: 'Almost done. Putting your answer together…',
  formatting: 'Almost done. Finishing up…',
  finalizing: 'Almost done. Finishing up…',
}

function humanizeStage(stage: string): string {
  return stage
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

/** "passage" + 1 -> "passage", + 0 or 2+ -> "passages". */
function plural(n: number, word: string): string {
  return `${word}${n === 1 ? '' : 's'}`
}

/** Joins display names for a progress label: "A.pdf" / "A.pdf and B.pdf" /
 * "A.pdf, B.pdf and 3 more" — never more than `max` names spelled out, with
 * the rest folded into a trailing "and N more". */
export function listNames(names: string[], max = 2): string {
  const unique = [...new Set(names.filter(Boolean))]
  if (unique.length === 0) return ''
  if (unique.length === 1) return unique[0]
  if (unique.length <= max) {
    return `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`
  }
  const shown = unique.slice(0, max)
  const remaining = unique.length - max
  return `${shown.join(', ')} and ${remaining} more`
}

function readNumber(payload: Record<string, unknown>, key: string): number | undefined {
  const v = payload[key]
  return typeof v === 'number' ? v : undefined
}

/** Documents in scope for the query (for "retrieving") and filenames drawn
 * from citation events seen so far (for "generating") — both optional,
 * since the caller may not have this context yet (e.g. before scope
 * validation resolves). */
export interface ProgressContext {
  filenames?: string[]
  citationFilenames?: string[]
}

function legacyFallback(stage: string): string {
  const key = stage.toLowerCase()
  if (STAGE_LABELS[key]) return STAGE_LABELS[key]

  if (key.includes('generat') || key.includes('assembl') || key.includes('synth')) {
    return 'Almost done. Putting your answer together…'
  }
  if (key.includes('retriev') || key.includes('search')) {
    return 'Searching your documents…'
  }
  if (key.includes('rank') || key.includes('rerank')) {
    return 'Finding the best matches…'
  }
  if (key.includes('classif') || key.includes('embed')) {
    return 'Understanding your question…'
  }

  return `Still working on ${humanizeStage(stage)}…`
}

/** Turns one `progress` SSE stage into a specific, human-readable label.
 * `payload` is the event's own data (stage-specific fields such as
 * `candidates`, `selected`, `variants`); `context` supplies names this
 * stage's label can reference — the documents in query scope, and the
 * filenames seen in citation events so far. Stages this function doesn't
 * recognize by name fall back to the older substring/humanize heuristics
 * so an unexpected backend stage still gets a reasonable label. */
export function formatProgressStage(
  stage: string | undefined,
  payload?: Record<string, unknown>,
  context?: ProgressContext,
): string | undefined {
  if (!stage) return undefined
  const key = stage.toLowerCase()
  const p = payload ?? {}
  const filenames = context?.filenames ?? []
  const citationFilenames = context?.citationFilenames ?? []

  switch (key) {
    case 'classifying':
    case 'embedding':
    case 'decontextualizing':
      return 'Understanding your question…'

    case 'rewriting': {
      const variants = readNumber(p, 'variants')
      const suffix = variants != null && variants >= 2 ? ` (${variants} variants)` : ''
      return `Refining your question…${suffix}`
    }

    case 'retrieving':
      return filenames.length > 0
        ? `Searching ${listNames(filenames)}…`
        : 'Searching your documents…'

    case 'retrieved': {
      const candidates = readNumber(p, 'candidates') ?? 0
      const distinctItems = readNumber(p, 'distinct_items') ?? 0
      if (candidates === 0) return 'No matching passages yet…'
      return `Found ${candidates} ${plural(candidates, 'passage')} across ${distinctItems} ${plural(distinctItems, 'document')}…`
    }

    case 'reranking': {
      const total = readNumber(p, 'total')
      return total != null
        ? `Ranking ${total} ${plural(total, 'passage')} by relevance…`
        : 'Finding the best matches…'
    }

    case 'reranked': {
      const selected = readNumber(p, 'selected') ?? 0
      return `Picked the ${selected} most relevant ${plural(selected, 'passage')}…`
    }

    case 'postprocessing': {
      const kept = readNumber(p, 'kept') ?? 0
      return `Checking ${kept} ${plural(kept, 'passage')}…`
    }

    case 'assembling': {
      const chunks = readNumber(p, 'chunks') ?? 0
      return `Reading ${chunks} ${plural(chunks, 'passage')}…`
    }

    case 'generating':
      return citationFilenames.length > 0
        ? `Writing your answer from ${listNames(citationFilenames)}…`
        : 'Writing your answer…'

    case 'planning': {
      const iteration = readNumber(p, 'iteration')
      return iteration != null ? `Planning the answer (step ${iteration})…` : 'Planning the answer…'
    }

    case 'verifying':
      return 'Double-checking the answer…'

    default:
      return legacyFallback(stage)
  }
}

export function formatRouteLabel(strategy: string | undefined): string | undefined {
  if (!strategy) return undefined
  const labels: Record<string, string> = {
    simple: 'Quick lookup…',
    simple_lookup: 'Quick lookup…',
    aggregation: 'Summarizing across documents…',
    agent: 'Working through your question…',
  }
  const label = labels[strategy] ?? humanizeStage(strategy.replace(/_/g, ' '))
  return label.endsWith('…') ? label : `${label}…`
}

export function isLateQueryStage(stage: string | undefined): boolean {
  if (!stage) return false
  const key = stage.toLowerCase()
  return (
    key.includes('generat') ||
    key.includes('assembl') ||
    key.includes('synth') ||
    key.includes('compos') ||
    key.includes('format') ||
    key.includes('final')
  )
}

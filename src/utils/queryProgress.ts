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

export function formatProgressStage(stage: string | undefined): string | undefined {
  if (!stage) return undefined
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

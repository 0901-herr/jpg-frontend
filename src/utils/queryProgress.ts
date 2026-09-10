const STAGE_LABELS: Record<string, string> = {
  classifying: 'Classifying query…',
  embedding: 'Embedding query…',
  rewriting: 'Rewriting query…',
  retrieving: 'Retrieving documents…',
  reranking: 'Reranking results…',
  generating: 'Generating answer…',
}

export function formatProgressStage(stage: string | undefined): string | undefined {
  if (!stage) return undefined
  const key = stage.toLowerCase()
  return STAGE_LABELS[key] ?? `Working (${stage})…`
}

export function formatRouteLabel(strategy: string | undefined): string | undefined {
  if (!strategy) return undefined
  const labels: Record<string, string> = {
    simple: 'Simple lookup…',
    simple_lookup: 'Simple lookup…',
    aggregation: 'Aggregation query…',
    agent: 'Agent query…',
  }
  const label = labels[strategy] ?? strategy
  return label.endsWith('…') ? label : `${label}…`
}

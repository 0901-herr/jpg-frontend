import { displayFilename } from './citations'

const STAGE_LABELS: Record<string, string> = {
  classifying: 'Understanding your question',
  embedding: 'Understanding your question',
  rewriting: 'Refining your question',
  retrieving: 'Searching your documents',
  reranking: 'Finding the best matches',
  generating: 'Putting the answer together',
  assembly: 'Almost done. Putting your answer together',
  assembling: 'Almost done. Putting your answer together',
  synthesizing: 'Almost done. Putting your answer together',
  composing: 'Almost done. Putting your answer together',
  formatting: 'Almost done. Finishing up',
  finalizing: 'Almost done. Finishing up',
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

/** Documents in scope for the query, used to personalize the "retrieving"
 * label — optional, since the caller may not have this context yet (e.g.
 * before scope validation resolves). The "generating" stage deliberately
 * never names files (client feedback), so it needs no context of its own. */
export interface ProgressContext {
  filenames?: string[]
}

function legacyFallback(stage: string): string {
  const key = stage.toLowerCase()
  if (STAGE_LABELS[key]) return STAGE_LABELS[key]

  if (key.includes('generat') || key.includes('assembl') || key.includes('synth')) {
    return 'Almost done. Putting your answer together'
  }
  if (key.includes('retriev') || key.includes('search')) {
    return 'Searching your documents'
  }
  if (key.includes('rank') || key.includes('rerank')) {
    return 'Finding the best matches'
  }
  if (key.includes('classif') || key.includes('embed')) {
    return 'Understanding your question'
  }

  // Plain-language sweep: a raw backend stage name (e.g. `tier_escalated`)
  // must never reach the user, humanized or not — a fixed generic line
  // stands in for anything this function doesn't otherwise recognize.
  return 'Working on it'
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

  switch (key) {
    case 'classifying':
    case 'embedding':
    case 'decontextualizing':
      return 'Understanding your question'

    case 'rewriting':
      // Plain-language sweep: the owner asked for the "(N variants)" suffix
      // gone — a fixed label regardless of how many rewrites ran.
      return 'Refining your question'

    case 'retrieving':
      return filenames.length > 0
        ? `Searching ${listNames(filenames)}`
        : 'Searching your documents'

    case 'retrieved': {
      const candidates = readNumber(p, 'candidates') ?? 0
      const distinctItems = readNumber(p, 'distinct_items') ?? 0
      if (candidates === 0) return 'Nothing matching yet'
      return `Found ${candidates} ${plural(candidates, 'section')} across ${distinctItems} ${plural(distinctItems, 'document')}`
    }

    case 'reranking':
      // Plain-language sweep: always the same fixed line — no passage
      // count ("chunks"/"passages" are exactly the vocabulary the owner
      // asked to remove).
      return 'Finding the best matches'

    case 'reranked': {
      const selected = readNumber(p, 'selected') ?? 0
      return `Picked the ${selected} most relevant ${plural(selected, 'section')}`
    }

    case 'postprocessing': {
      const kept = readNumber(p, 'kept') ?? 0
      return `Checking ${kept} ${plural(kept, 'section')}`
    }

    case 'assembling': {
      const chunks = readNumber(p, 'chunks') ?? 0
      return `Reading ${chunks} ${plural(chunks, 'section')}`
    }

    case 'generating':
      // Deliberately never names files here (client feedback: the
      // "Writing your answer from X, Y" subtitle read as if the model had
      // already decided its sources before it had written anything) — the
      // earlier retrieving/retrieved stages above still name what was
      // searched, this one just says what's happening now. The ticker
      // (`progressTickerLabel` below) shows this label only when there is
      // nothing to name yet — the owner wants "Writing your answer" itself
      // gone from what the user sees.
      return 'Putting the answer together'

    case 'planning': {
      const iteration = readNumber(p, 'iteration')
      return iteration != null ? `Planning the answer (step ${iteration})` : 'Planning the answer'
    }

    case 'verifying':
      return 'Double-checking the answer'

    default:
      return legacyFallback(stage)
  }
}

export function formatRouteLabel(strategy: string | undefined): string | undefined {
  if (!strategy) return undefined
  const labels: Record<string, string> = {
    simple: 'Looking it up',
    simple_lookup: 'Looking it up',
    aggregation: 'Summarizing across documents',
    agent: 'Working through your question',
  }
  return labels[strategy] ?? humanizeStage(strategy.replace(/_/g, ' '))
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

/** Context the progress ticker cycles through while a query is in flight —
 * the real stage label (`formatProgressStage`'s output) plus the names it
 * alternates with. `files`/`folders` are already resolved by the caller to
 * whichever set is right for `stage` (the documents/folders in query scope
 * for every stage except `generating`, which — once it has one — prefers
 * the files actually cited so far; see `ChatMessage.tsx`). */
export interface ProgressTickerContext {
  stageLabel: string | undefined
  stage?: string
  files: string[]
  folders: string[]
}

/** Pure step function for the "searching/reading the files" ticker (client
 * feedback: "a status that says something like 'searching through files
 * XX, files XXX, or maybe folder XX' ... alternating the 'writing your
 * answer' so that the UI appears to be more interactive", later narrowed
 * to: "let's not have 'writing your answer', instead just show different
 * status where the system reads different files for the answer ... only
 * apply to the 'writing your answer' stage, since that's usually stuck the
 * longest"). `tick` advances roughly every 2.5s while a query is in flight
 * (driven by `useProgressTicker`, a plain interval — this function itself
 * is a pure lookup so it's cheap to unit test).
 *
 * `generating` is the special case the owner asked for: it never shows the
 * stage label while there's at least one file or folder to name — every
 * tick advances straight to the next "Reading <file>" / "Reading folder
 * <folder>" line (files first, then folders), wrapping around. With
 * nothing to name yet, it falls back to a neutral "Putting the answer
 * together" line rather than the stage label.
 *
 * Every other stage keeps the original alternation: even ticks always show
 * the real stage label, odd ticks cycle through "Searching <file>" /
 * "Searching folder <folder>" lines one per odd tick. With nothing to
 * name, the scope line has nothing to show, so every tick just returns the
 * stage label unchanged. */
export function progressTickerLabel(
  tick: number,
  { stageLabel, stage, files, folders }: ProgressTickerContext,
): string | undefined {
  const isGenerating = (stage ?? '').toLowerCase() === 'generating'
  const uniqueFiles = [...new Set(files.filter(Boolean))]
  const uniqueFolders = [...new Set(folders.filter(Boolean))]

  if (isGenerating) {
    const scopeLines = [
      ...uniqueFiles.map((name) => `Reading ${name}`),
      ...uniqueFolders.map((name) => `Reading folder ${name}`),
    ]
    if (scopeLines.length === 0) return 'Putting the answer together'
    return scopeLines[tick % scopeLines.length]
  }

  const scopeLines = [
    ...uniqueFiles.map((name) => `Searching ${name}`),
    ...uniqueFolders.map((name) => `Searching folder ${name}`),
  ]

  if (scopeLines.length === 0) return stageLabel
  if (tick % 2 === 0) return stageLabel

  const index = Math.floor(tick / 2) % scopeLines.length
  return scopeLines[index]
}

/** Minimal shape `resolveProgressScope` needs from a selected document —
 * matches `BrowseDocumentItem`, kept narrow here so this file doesn't need
 * to import the browse API types just to describe two fields. */
export interface ProgressScopeDocument {
  filename?: string
  folder_id?: number
}

export interface ProgressScope {
  files: string[]
  folders: string[]
}

/** Resolves the file/folder names `progressTickerLabel` cycles through for
 * one query, from the documents actually in scope (`documentIds`, already
 * trimmed to what `validateQueryScope` returned as accessible) plus the
 * metadata available for them (`documentMeta`, e.g.
 * `useDocumentSelection`'s map — keyed by document id) and a folder-name
 * lookup (e.g. `useBrowseTree`'s `getFolderNode`, keyed by `folder_id`).
 *
 * `BrowseDocumentItem` only carries a `folder_id`, not a folder name, so
 * this always goes through the lookup rather than reading a name field
 * directly off the document — best-effort: a folder whose contents
 * haven't been fetched into that cache yet simply contributes no name,
 * same as a document with no filename on record contributes no file
 * name. Called once, at query start (`AppLayout.tsx`'s `handleSend`), so
 * the ticker has something to show even before the first backend
 * `progress` event arrives. */
export function resolveProgressScope(
  documentIds: string[],
  documentMeta: Map<string, ProgressScopeDocument>,
  getFolderNode: (folderId: number) => { name: string } | undefined,
): ProgressScope {
  const files = documentIds
    .map((id) => documentMeta.get(id)?.filename)
    .filter((name): name is string => Boolean(name))
    .map(displayFilename)

  const folderIds = [
    ...new Set(
      documentIds
        .map((id) => documentMeta.get(id)?.folder_id)
        .filter((id): id is number => typeof id === 'number'),
    ),
  ]
  const folders = folderIds
    .map((folderId) => getFolderNode(folderId)?.name)
    .filter((name): name is string => Boolean(name))

  return { files, folders }
}

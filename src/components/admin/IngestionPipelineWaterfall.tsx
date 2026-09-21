import { Tooltip } from 'antd'
import type { AdminDocumentSummary, LifecycleStatus } from '../../api/types/admin'
import {
  formatDateTime,
  getPipelineProgress,
  PIPELINE_STAGES,
  type PipelineStageState,
} from '../../utils/lifecycle'

interface IngestionPipelineWaterfallProps {
  status: LifecycleStatus
  doc?: Pick<
    AdminDocumentSummary,
    'discovered_at' | 'submitted_at' | 'ready_at' | 'failed_at'
  >
  compact?: boolean
}

function nodeStyles(state: PipelineStageState, compact: boolean): string {
  const size = compact ? 'h-3.5 w-3.5 border' : 'h-5 w-5 border'

  switch (state) {
    case 'complete':
      return `${size} admin-pipeline-node--complete text-white`
    case 'partial':
      return `${size} admin-pipeline-node--partial text-white`
    case 'current':
      return `${size} admin-pipeline-node--current bg-white`
    case 'failed':
      return `${size} admin-pipeline-node--failed text-white`
    default:
      return `${size} admin-pipeline-node--pending bg-white`
  }
}

function segmentTone(
  state: PipelineStageState,
): 'success' | 'partial' | 'active' | 'failed' | 'idle' {
  if (state === 'complete') return 'success'
  if (state === 'partial') return 'partial'
  if (state === 'current') return 'active'
  if (state === 'failed') return 'failed'
  return 'idle'
}

const TOOLTIP_STAGE_LABELS = [
  'Discovered',
  'Queued',
  'Prepared',
  'Staged',
  'Submitted',
  'Indexing',
  'Indexed',
] as const

function stageDate(
  index: number,
  state: PipelineStageState,
  doc: IngestionPipelineWaterfallProps['doc'],
): string | null | undefined {
  if (state === 'failed') return doc?.failed_at
  if (index === 0) return doc?.discovered_at
  if (index === 4) return doc?.submitted_at
  if (index === 6) return doc?.ready_at
  return null
}

function stageTooltip(
  index: number,
  state: PipelineStageState,
  doc: IngestionPipelineWaterfallProps['doc'],
) {
  const date = stageDate(index, state, doc)
  const label =
    state === 'failed'
      ? `${TOOLTIP_STAGE_LABELS[index]} failed`
      : state === 'partial'
        ? 'Partially indexed — searchable, full indexing incomplete'
        : TOOLTIP_STAGE_LABELS[index]
  return (
    <div className="admin-pipeline-tooltip">
      <div>{label}</div>
      {date && <div className="admin-pipeline-tooltip-date">{formatDateTime(date)}</div>}
    </div>
  )
}

function stageShortLabel(index: number, state: PipelineStageState): string {
  if (state === 'partial') return 'Partial'
  return PIPELINE_STAGES[index]?.shortLabel ?? ''
}

function labelClass(state: PipelineStageState): string {
  if (state === 'current') return 'admin-pipeline-label--active font-semibold'
  if (state === 'failed') return 'admin-pipeline-label--failed font-semibold'
  if (state === 'partial') return 'admin-pipeline-label--partial font-semibold'
  if (state === 'complete') return 'admin-pipeline-label--complete font-medium'
  return 'admin-pipeline-label--pending'
}

export default function IngestionPipelineWaterfall({
  status,
  doc,
  compact = true,
}: IngestionPipelineWaterfallProps) {
  const progress = getPipelineProgress(status, doc)
  const nodeRowClass = compact ? 'min-h-[14px]' : 'min-h-[20px]'

  return (
    <div
      className={compact ? 'w-full min-w-[240px] max-w-[320px]' : 'w-full'}
      role="img"
      aria-label={`Pipeline: ${progress.summary}`}
    >
      <div className={`relative ${compact ? '' : 'pb-6'}`}>
        <div className="relative flex justify-between">
          <div
            className={`admin-pipeline-track ${compact ? 'admin-pipeline-track--compact' : ''}`}
            aria-hidden="true"
          >
            {progress.states.slice(1).map((state, index) => (
              <span
                key={`${PIPELINE_STAGES[index]?.id}-${PIPELINE_STAGES[index + 1]?.id}`}
                className={`admin-pipeline-track-segment admin-pipeline-track-segment--${segmentTone(state)}`}
              />
            ))}
          </div>
          {PIPELINE_STAGES.map((stage, index) => {
            const state = progress.states[index]
            return (
              <Tooltip key={stage.id} title={stageTooltip(index, state, doc)}>
                <div className={`flex flex-col items-center ${nodeRowClass}`}>
                  <div
                    className={`relative z-10 flex shrink-0 items-center justify-center rounded-full transition-colors ${nodeStyles(state, compact)}`}
                  >
                  </div>
                  {!compact && (
                    <span
                      className={`mt-1.5 max-w-[4.75rem] text-center text-xs leading-tight ${labelClass(state)}`}
                    >
                      {stageShortLabel(index, state)}
                    </span>
                  )}
                </div>
              </Tooltip>
            )
          })}
        </div>

      </div>
    </div>
  )
}

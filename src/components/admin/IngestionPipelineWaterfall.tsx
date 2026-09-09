import { Tooltip } from 'antd'
import type { AdminDocumentSummary, LifecycleStatus } from '../../api/types/admin'
import {
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

function stageCircleClass(state: PipelineStageState): string {
  switch (state) {
    case 'complete':
      return 'bg-emerald-500 border-emerald-500'
    case 'current':
      return 'bg-blue-500 border-blue-500 ring-2 ring-blue-200'
    case 'failed':
      return 'bg-red-500 border-red-500 ring-2 ring-red-200'
    case 'skipped':
      return 'bg-gray-100 border-gray-300'
    default:
      return 'bg-white border-gray-300'
  }
}

function connectorClass(leftState: PipelineStageState, rightState: PipelineStageState): string {
  if (leftState === 'failed' || rightState === 'failed') return 'bg-red-300'
  if (leftState === 'complete') return 'bg-emerald-400'
  return 'bg-gray-200'
}

export default function IngestionPipelineWaterfall({
  status,
  doc,
  compact = true,
}: IngestionPipelineWaterfallProps) {
  const progress = getPipelineProgress(status, doc)
  const labelClass = compact ? 'text-[9px]' : 'text-[10px]'

  return (
    <div
      className="flex items-start w-full min-w-0 max-w-[280px]"
      role="img"
      aria-label={`Pipeline: ${progress.summary}`}
    >
      {PIPELINE_STAGES.map((stage, index) => {
        const state = progress.states[index]
        const isLast = index === PIPELINE_STAGES.length - 1
        return (
          <div key={stage.id} className="flex flex-1 items-start min-w-0">
            <Tooltip title={`${stage.label}: ${state}`}>
              <div className="flex flex-col items-center flex-1 min-w-0 px-0.5">
                <div
                  className={`h-2.5 w-2.5 rounded-full border shrink-0 ${stageCircleClass(state)}`}
                />
                <span
                  className={`${labelClass} mt-1 text-center leading-tight truncate w-full ${
                    state === 'current'
                      ? 'text-blue-700 font-medium'
                      : state === 'failed'
                        ? 'text-red-700 font-medium'
                        : state === 'complete'
                          ? 'text-emerald-700'
                          : 'text-gray-400'
                  }`}
                >
                  {stage.shortLabel}
                </span>
              </div>
            </Tooltip>
            {!isLast && (
              <div
                className={`h-0.5 w-full mt-[5px] shrink ${connectorClass(state, progress.states[index + 1])}`}
                aria-hidden
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

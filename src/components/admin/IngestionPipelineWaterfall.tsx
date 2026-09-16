import { Tooltip } from 'antd'
import type { AdminDocumentSummary, LifecycleStatus } from '../../api/types/admin'
import {
  PIPELINE_STAGE_ICONS,
  PipelineCheckIcon,
  PipelineCheckIconLg,
  PipelineCloseIcon,
  PipelineCloseIconLg,
} from '../../icons/admin'
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

function trackTipIndex(states: PipelineStageState[]): number {
  const failed = states.findIndex((state) => state === 'failed')
  if (failed >= 0) return failed
  const current = states.findIndex((state) => state === 'current')
  if (current >= 0) return current
  return states.every((state) => state === 'complete') ? states.length - 1 : 0
}

function trackFillPercent(tipIndex: number): number {
  if (PIPELINE_STAGES.length <= 1) return 0
  return (tipIndex / (PIPELINE_STAGES.length - 1)) * 100
}

function nodeStyles(state: PipelineStageState, compact: boolean): string {
  const size = compact ? 'h-3.5 w-3.5 border' : 'h-7 w-7 border-2'

  switch (state) {
    case 'complete':
      return `${size} border-emerald-500 bg-emerald-500 text-white shadow-sm`
    case 'current':
      return `${size} border-[#0084ff] bg-white text-[#0084ff] shadow-[0_0_0_3px_rgba(0,132,255,0.18)]`
    case 'failed':
      return `${size} border-red-500 bg-red-500 text-white shadow-[0_0_0_3px_rgba(207,19,34,0.15)]`
    default:
      return `${size} border-[#d9dee7] bg-white text-[#94a3b8]`
  }
}

function trackTone(states: PipelineStageState[]): 'success' | 'active' | 'failed' | 'idle' {
  if (states.some((state) => state === 'failed')) return 'failed'
  if (states.every((state) => state === 'complete')) return 'success'
  if (states.some((state) => state === 'current')) return 'active'
  return 'idle'
}

function trackFillClass(tone: ReturnType<typeof trackTone>): string {
  switch (tone) {
    case 'failed':
      return 'bg-red-400'
    case 'success':
      return 'bg-emerald-500'
    case 'active':
      return 'bg-[#0084ff]'
    default:
      return 'bg-transparent'
  }
}

function StageIcon({
  index,
  state,
  compact,
}: {
  index: number
  state: PipelineStageState
  compact: boolean
}) {
  if (state === 'complete') {
    return compact ? <PipelineCheckIcon /> : <PipelineCheckIconLg />
  }
  if (state === 'failed') {
    return compact ? <PipelineCloseIcon /> : <PipelineCloseIconLg />
  }
  if (compact) return null
  const Icon = PIPELINE_STAGE_ICONS[index]
  return Icon ? <Icon /> : null
}

function stageTooltip(stageLabel: string, state: PipelineStageState): string {
  const stateLabel =
    state === 'complete'
      ? 'Complete'
      : state === 'current'
        ? 'In progress'
        : state === 'failed'
          ? 'Failed here'
          : 'Pending'
  return `${stageLabel} · ${stateLabel}`
}

export default function IngestionPipelineWaterfall({
  status,
  doc,
  compact = true,
}: IngestionPipelineWaterfallProps) {
  const progress = getPipelineProgress(status, doc)
  const tipIndex = trackTipIndex(progress.states)
  const fillPercent = trackFillPercent(tipIndex)
  const tone = trackTone(progress.states)
  const activeStage = PIPELINE_STAGES[tipIndex]
  const trackOffset = compact ? 'top-[6px]' : 'top-[13px]'
  const nodeRowClass = compact ? 'min-h-[14px]' : 'min-h-[28px]'

  return (
    <div
      className={compact ? 'w-full min-w-[240px] max-w-[320px]' : 'w-full'}
      role="img"
      aria-label={`Pipeline: ${progress.summary}`}
    >
      <div className={`relative ${compact ? 'pb-5' : 'pb-8'}`}>
        <div
          className={`pointer-events-none absolute ${trackOffset} left-[7px] right-[7px] h-0.5 rounded-full bg-[#e8edf2]`}
          aria-hidden
        />
        <div
          className={`pointer-events-none absolute ${trackOffset} left-[7px] h-0.5 rounded-full transition-all duration-300 ${trackFillClass(tone)}`}
          style={{ width: `calc((100% - 14px) * ${fillPercent / 100})` }}
          aria-hidden
        />

        <div className="relative flex justify-between">
          {PIPELINE_STAGES.map((stage, index) => {
            const state = progress.states[index]
            return (
              <Tooltip key={stage.id} title={stageTooltip(stage.label, state)}>
                <div className={`flex flex-col items-center ${nodeRowClass}`}>
                  <div
                    className={`relative z-10 flex shrink-0 items-center justify-center rounded-full transition-colors ${nodeStyles(state, compact)} ${
                      state === 'current' && !compact ? 'admin-pipeline-node-current' : ''
                    }`}
                  >
                    <StageIcon index={index} state={state} compact={compact} />
                  </div>
                  {!compact && (
                    <span
                      className={`mt-2 max-w-[4.75rem] text-center text-xs leading-tight ${
                        state === 'current'
                          ? 'font-semibold text-[#0084ff]'
                          : state === 'failed'
                            ? 'font-semibold text-red-600'
                            : state === 'complete'
                              ? 'font-medium text-emerald-700'
                              : 'text-[#94a3b8]'
                      }`}
                    >
                      {stage.shortLabel}
                    </span>
                  )}
                </div>
              </Tooltip>
            )
          })}
        </div>

        {compact && activeStage && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
            <span
              className={`text-xs font-medium leading-none whitespace-nowrap ${
                tone === 'failed'
                  ? 'text-red-600'
                  : tone === 'success'
                    ? 'text-emerald-700'
                    : tone === 'active'
                      ? 'text-[#0084ff]'
                      : 'text-[#64748b]'
              }`}
            >
              {activeStage.shortLabel}
            </span>
          </div>
        )}
      </div>

      {!compact && <p className="mt-1 text-xs text-[#64748b]">{progress.summary}</p>}
    </div>
  )
}

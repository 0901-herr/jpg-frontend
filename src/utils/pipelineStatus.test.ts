import { describe, expect, it } from 'vitest'
import {
  mockOverviewIdle,
  mockOverviewPaused,
  mockOverviewRunning,
} from '../test/adminFixtures'
import {
  overviewShouldPollFast,
  pipelineCorpusTotal,
  pipelinePrimaryAction,
  pipelineProgressIntro,
  PIPELINE_PROGRESS_INTRO,
  shouldShowProgressBar,
} from './pipelineStatus'

describe('pipelineStatus', () => {
  it('polls fast whenever documents are in flight', () => {
    expect(overviewShouldPollFast(mockOverviewRunning)).toBe(true)
    expect(
      overviewShouldPollFast({
        ...mockOverviewIdle,
        counts: { ...mockOverviewIdle.counts, discovered: 5, ready: 100 },
      }),
    ).toBe(true)
  })

  it('offers pause while pipeline is active', () => {
    expect(pipelinePrimaryAction(mockOverviewRunning)).toBe('pause')
  })

  it('offers resume when gates are paused', () => {
    expect(pipelinePrimaryAction(mockOverviewPaused)).toBe('resume')
  })

  it('offers start when idle', () => {
    expect(pipelinePrimaryAction(mockOverviewIdle)).toBe('start')
  })

  it('counts corpus from lifecycle totals when bulk total_discovered is zero', () => {
    const overview = {
      ...mockOverviewRunning,
      bulk_progress: {
        ...mockOverviewRunning.bulk_progress!,
        job_state: 'completed' as const,
        total_discovered: 0,
      },
      counts: {
        ...mockOverviewRunning.counts,
        discovered: 20,
        staged: 0,
        preparing: 0,
        indexing: 0,
        ready: 0,
      },
    }
    expect(pipelineCorpusTotal(overview)).toBe(20)
    expect(shouldShowProgressBar(overview)).toBe(false)
    expect(pipelineProgressIntro(overview)).toBe(PIPELINE_PROGRESS_INTRO)
  })

  it('explains paused and failed states without repeating counts', () => {
    expect(pipelineProgressIntro(mockOverviewPaused)).toMatch(/Ingestion is paused/)
    expect(pipelineProgressIntro({
      ...mockOverviewIdle,
      bulk_progress: {
        ...mockOverviewIdle.bulk_progress!,
        job_state: 'failed',
        job_error: 'timeout',
      },
    })).toMatch(/Last scan failed/)
  })
})

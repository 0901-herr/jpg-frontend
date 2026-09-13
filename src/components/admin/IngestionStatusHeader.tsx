import { Popover, Typography } from 'antd'
import type { ReactNode } from 'react'
import type { IngestionOverview } from '../../api/types/admin'
import {
  ADMIN_PAGE_SUBTITLE,
  ADMIN_PAGE_TITLE,
  ADMIN_STATUS_HEADER_CLASS,
  ADMIN_STATUS_POPOVER_CLASS,
  ADMIN_TEXT_EMPHASIS,
  ADMIN_TEXT_MONO,
} from '../../config/adminStyles'
import { formatStateLabel } from '../../utils/adminState'
import { formatRelativeTime } from '../../utils/lifecycle'
import { formatServiceTarget } from '../../utils/serviceEndpoint'
import { INGESTION_SECTION_LABELS, type IngestionSection } from './IngestionSectionNav'

const { Title, Text } = Typography

interface IngestionStatusHeaderProps {
  overview: IngestionOverview
  section: IngestionSection
}

type PillTone = 'success' | 'warning' | 'error' | 'neutral'

const PILL_CLASS: Record<PillTone, string> = {
  success: 'admin-status-pill admin-status-pill--success',
  warning: 'admin-status-pill admin-status-pill--warning',
  error: 'admin-status-pill admin-status-pill--error',
  neutral: 'admin-status-pill admin-status-pill--neutral',
}

const DOT_CLASS: Record<PillTone, string> = {
  success: 'admin-status-dot admin-status-dot--success',
  warning: 'admin-status-dot admin-status-dot--warning',
  error: 'admin-status-dot admin-status-dot--error',
  neutral: 'admin-status-dot admin-status-dot--neutral',
}

const TAG_CLASS: Record<PillTone, string> = {
  success: 'admin-status-tag admin-status-tag--success',
  warning: 'admin-status-tag admin-status-tag--warning',
  error: 'admin-status-tag admin-status-tag--error',
  neutral: 'admin-status-tag admin-status-tag--neutral',
}

function runTone(state: string): PillTone {
  if (state === 'RUNNING') return 'success'
  if (state === 'PAUSED' || state === 'PARTIAL') return 'warning'
  if (state === 'DEGRADED' || state === 'ERROR') return 'error'
  return 'neutral'
}

function overallTone(overview: IngestionOverview): PillTone {
  if (overview.circuit_open) return 'error'
  return runTone(overview.overall_state)
}

function circuitTone(open: boolean): PillTone {
  return open ? 'error' : 'success'
}

function StatusDot({ tone }: { tone: PillTone }) {
  return <span className={DOT_CLASS[tone]} aria-hidden />
}

function StatusTag({ label, tone }: { label: string; tone: PillTone }) {
  return <span className={TAG_CLASS[tone]}>{label}</span>
}

function StatusRow({
  label,
  status,
  tone,
  detail,
}: {
  label: string
  status: string
  tone: PillTone
  detail?: string
}) {
  return (
    <div className="admin-status-popover-row">
      <div className="admin-status-popover-row-main">
        <div className="admin-status-popover-label">
          <StatusDot tone={tone} />
          <span>{label}</span>
        </div>
        <StatusTag label={formatStateLabel(status)} tone={tone} />
      </div>
      {detail && <p className="admin-status-popover-detail">{detail}</p>}
    </div>
  )
}

function PopoverPanel({ children }: { children: ReactNode }) {
  return <div className="admin-status-popover-panel">{children}</div>
}

function PopoverNote({ children }: { children: ReactNode }) {
  return <div className="admin-status-popover-row admin-status-popover-note">{children}</div>
}

function overallDetails(overview: IngestionOverview): ReactNode {
  return (
    <PopoverPanel>
      <StatusRow
        label="Discovery"
        status={overview.discovery_state}
        tone={runTone(overview.discovery_state)}
      />
      <StatusRow
        label="Ingestion"
        status={overview.ingestion_state}
        tone={runTone(overview.ingestion_state)}
      />
      <StatusRow
        label="RAG circuit"
        status={formatStateLabel(overview.circuit_open ? 'OPEN' : 'CLOSED')}
        tone={circuitTone(overview.circuit_open)}
      />
    </PopoverPanel>
  )
}

function discoveryDetails(overview: IngestionOverview): ReactNode {
  const auditDetail = overview.audit_sync_enabled
    ? `Audit sync enabled. Last poll ${formatRelativeTime(overview.last_audit_poll_at)}.`
    : 'Audit sync disabled.'

  return (
    <PopoverPanel>
      <StatusRow
        label="Discovery"
        status={overview.discovery_state}
        tone={runTone(overview.discovery_state)}
        detail="Scans LogicalDOC folders and records new documents."
      />
      {overview.discovery_state === 'PAUSED' && overview.discovery_pause_reason && (
        <PopoverNote>Pause reason: {overview.discovery_pause_reason}.</PopoverNote>
      )}
      <PopoverNote>{auditDetail}</PopoverNote>
    </PopoverPanel>
  )
}

function ingestionDetails(overview: IngestionOverview): ReactNode {
  const { counts } = overview
  const inFlight = counts.preparing + counts.staged + counts.indexing + counts.discovered
  const queueDetail = `${inFlight.toLocaleString()} in flight, ${counts.ready.toLocaleString()} ready, ${counts.failed.toLocaleString()} failed.`

  return (
    <PopoverPanel>
      <StatusRow
        label="Ingestion"
        status={overview.ingestion_state}
        tone={runTone(overview.ingestion_state)}
        detail="Prepares documents, submits to RAG, and tracks indexing."
      />
      <PopoverNote>{queueDetail}</PopoverNote>
      {overview.ingestion_state === 'PAUSED' && overview.ingestion_pause_reason && (
        <PopoverNote>Pause reason: {overview.ingestion_pause_reason}.</PopoverNote>
      )}
      {overview.circuit_open && (
        <PopoverNote>RAG circuit is open after repeated failures.</PopoverNote>
      )}
    </PopoverPanel>
  )
}

function circuitDetails(overview: IngestionOverview): ReactNode {
  const ragTarget = formatServiceTarget(
    overview.health.endpoints?.rag_engine ?? overview.rag_api_base_url,
  )

  return (
    <PopoverPanel>
      <StatusRow label="RAG circuit" status={formatStateLabel('OPEN')} tone="error" />
      <PopoverNote>
        The adapter paused new RAG submissions after consecutive failures. In flight work
        continues. Check System health for RAG availability.
      </PopoverNote>
      {ragTarget && (
        <PopoverNote>
          <Text className={ADMIN_TEXT_MONO}>RAG target: {ragTarget}</Text>
        </PopoverNote>
      )}
    </PopoverPanel>
  )
}

interface StatusPillProps {
  label: string
  value: string
  tone: PillTone
  title: string
  details: ReactNode
}

function StatusPill({ label, value, tone, title, details }: StatusPillProps) {
  return (
    <Popover
      title={title}
      content={details}
      trigger="click"
      placement="bottomRight"
      overlayClassName={ADMIN_STATUS_POPOVER_CLASS}
    >
      <button
        type="button"
        className={PILL_CLASS[tone]}
        aria-label={`${label}: ${value}. Click for details.`}
      >
        <StatusDot tone={tone} />
        <span>{label}</span>
        <span className={ADMIN_TEXT_EMPHASIS}>{value}</span>
      </button>
    </Popover>
  )
}

export default function IngestionStatusHeader({
  overview,
  section,
}: IngestionStatusHeaderProps) {
  const sectionLabel = INGESTION_SECTION_LABELS[section]

  return (
    <header className={ADMIN_STATUS_HEADER_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <Title level={3} className={ADMIN_PAGE_TITLE}>
            Ingestion Operations
          </Title>
          <p className={`${ADMIN_PAGE_SUBTITLE} m-0 mt-1`}>
            {sectionLabel} · LogicalDOC to RAG pipeline
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            label="Overall"
            value={formatStateLabel(overview.overall_state)}
            tone={overallTone(overview)}
            title="Overall pipeline"
            details={overallDetails(overview)}
          />
          <StatusPill
            label="Discovery"
            value={formatStateLabel(overview.discovery_state)}
            tone={runTone(overview.discovery_state)}
            title="Discovery"
            details={discoveryDetails(overview)}
          />
          <StatusPill
            label="Ingestion"
            value={formatStateLabel(overview.ingestion_state)}
            tone={runTone(overview.ingestion_state)}
            title="Ingestion"
            details={ingestionDetails(overview)}
          />
          {overview.circuit_open && (
            <StatusPill
              label="RAG circuit"
              value={formatStateLabel('OPEN')}
              tone="error"
              title="RAG circuit breaker"
              details={circuitDetails(overview)}
            />
          )}
        </div>
      </div>
    </header>
  )
}

import { Tag, Typography } from 'antd'
import type { AdminHealthEndpoints, AdminHealthStatus } from '../../api/types/admin'
import { ADMIN_EMPTY, ADMIN_TEXT_LABEL, ADMIN_TEXT_MONO, ADMIN_TEXT_MUTED } from '../../config/adminStyles'
import { formatServiceTarget } from '../../utils/serviceEndpoint'
import AdminCard from './AdminCard'

const { Text } = Typography

interface SystemHealthProps {
  health: AdminHealthStatus
  circuitOpen?: boolean
  ragApiBaseUrl?: string
}

interface HealthRow {
  key: string
  label: string
  status: string | null
  endpoint: string | null
  mode?: string
}

function statusTag(value: string) {
  if (value === 'ok') return <Tag color="success">Healthy</Tag>
  if (value === 'unavailable') return <Tag color="error">Down</Tag>
  return <Tag>Unknown</Tag>
}

function modeTag(label: string, color: 'success' | 'warning' | 'processing' | 'default' = 'default') {
  return (
    <Tag color={color === 'default' ? undefined : color} className="!m-0">
      {label}
    </Tag>
  )
}

function buildRows(
  health: AdminHealthStatus,
  endpoints: AdminHealthEndpoints | null,
  ragApiBaseUrl?: string,
): HealthRow[] {
  const ep = endpoints ?? {
    adapter: '',
    logicaldoc: '',
    rag_engine: ragApiBaseUrl ?? '',
    minio: '',
    rabbitmq: null,
    temporal: null,
  }

  return [
    { key: 'adapter', label: 'Adapter', status: health.adapter, endpoint: ep.adapter },
    { key: 'logicaldoc', label: 'LogicalDOC', status: health.logicaldoc, endpoint: ep.logicaldoc },
    {
      key: 'rag_engine',
      label: 'RAG Engine',
      status: health.rag_engine,
      endpoint: ep.rag_engine || ragApiBaseUrl || null,
    },
    { key: 'minio', label: 'MinIO', status: health.minio, endpoint: ep.minio },
    {
      key: 'rabbitmq',
      label: 'RabbitMQ',
      status: null,
      endpoint: ep.rabbitmq,
      mode: health.mq_consumer_configured ? 'Consumer active' : 'Poll fallback',
    },
    {
      key: 'temporal',
      label: 'Temporal',
      status: null,
      endpoint: ep.temporal,
      mode: health.temporal_enabled ? 'Enabled' : 'Legacy pipeline',
    },
  ]
}

export default function SystemHealth({
  health,
  circuitOpen = false,
  ragApiBaseUrl,
}: SystemHealthProps) {
  const degraded =
    health.logicaldoc !== 'ok' ||
    health.rag_engine !== 'ok' ||
    health.minio !== 'ok' ||
    circuitOpen

  const rows = buildRows(health, health.endpoints ?? null, ragApiBaseUrl)
  const ragEndpoint = rows.find((row) => row.key === 'rag_engine')?.endpoint

  return (
    <AdminCard title="System health">
      {degraded && (
        <Tag color="warning" className="mb-4">
          Degraded
        </Tag>
      )}
      <div className="admin-divide divide-y">
        {rows.map((row) => {
          const target = formatServiceTarget(row.endpoint)
          return (
            <div
              key={row.key}
              className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <Text className={ADMIN_TEXT_LABEL}>{row.label}</Text>
                <Text className={`block mt-0.5 ${ADMIN_TEXT_MONO}`}>
                  {target ?? ADMIN_EMPTY}
                </Text>
              </div>
              <div className="shrink-0">
                {row.status != null
                  ? statusTag(row.status)
                  : modeTag(
                      row.mode ?? ADMIN_EMPTY,
                      row.mode === 'Consumer active' || row.mode === 'Enabled'
                        ? 'success'
                        : 'warning',
                    )}
              </div>
            </div>
          )
        })}
      </div>
      {health.rag_engine !== 'ok' && ragEndpoint?.startsWith('https://') && (
        <Text className={`block mt-4 ${ADMIN_TEXT_MUTED}`}>
          Self signed HTTPS? Set <code>RAG_TLS_VERIFY=false</code> in adapter <code>.env</code>{' '}
          and restart.
        </Text>
      )}
    </AdminCard>
  )
}

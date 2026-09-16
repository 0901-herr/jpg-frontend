import { Alert, Spin } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchAdminDocuments, fetchIngestionActivity, fetchIngestionOverview } from '../../api/admin'
import type { AdminDocumentQuery, AdminDocumentSummary } from '../../api/types/admin'
import AuditSyncStatus from '../../components/admin/AuditSyncStatus'
import DocumentDetailsPanel from '../../components/admin/DocumentDetailsPanel'
import DocumentSearch from '../../components/admin/DocumentSearch'
import DocumentTable from '../../components/admin/DocumentTable'
import FailedDocumentsTable from '../../components/admin/FailedDocumentsTable'
import IngestionActivityLog from '../../components/admin/IngestionActivityLog'
import IngestionControls from '../../components/admin/IngestionControls'
import IngestionSectionNav, {
  getIngestionSection,
} from '../../components/admin/IngestionSectionNav'
import PipelineProgressCard from '../../components/admin/PipelineProgressCard'
import ReconciliationStatus from '../../components/admin/ReconciliationStatus'
import SystemHealth from '../../components/admin/SystemHealth'
import ThroughputSummary from '../../components/admin/ThroughputSummary'
import {
  ADMIN_PAGE_CLASS,
  ADMIN_SECTION_MAIN_CLASS,
  ADMIN_SECTION_NAV_CLASS,
  ADMIN_STACK_GAP,
  ADMIN_STACK_SPACE,
} from '../../config/adminStyles'
import { ADMIN_OVERVIEW_POLL_ACTIVE_MS, ADMIN_OVERVIEW_POLL_MS } from '../../config/admin'
import { overviewShouldPollFast } from '../../utils/pipelineStatus'
import { adminQueryKeys } from '../../lib/adminQueryKeys'
import { ApiError } from '../../api/http'

const DEFAULT_QUERY: AdminDocumentQuery = { offset: 0, limit: 50 }

export default function IngestionOverviewPage() {
  const [searchParams] = useSearchParams()
  const section = getIngestionSection(searchParams)
  const [docQuery, setDocQuery] = useState<AdminDocumentQuery>(DEFAULT_QUERY)
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const overviewQuery = useQuery({
    queryKey: adminQueryKeys.overview,
    queryFn: ({ signal }) => fetchIngestionOverview(signal),
    refetchInterval: (query) =>
      overviewShouldPollFast(query.state.data) ? ADMIN_OVERVIEW_POLL_ACTIVE_MS : ADMIN_OVERVIEW_POLL_MS,
  })

  const documentsQuery = useQuery({
    queryKey: adminQueryKeys.documents(docQuery),
    queryFn: ({ signal }) => fetchAdminDocuments(docQuery, signal),
    placeholderData: (prev) => prev,
    enabled: section === 'documents' || section === 'overview',
    refetchInterval: () => {
      if (section !== 'documents') return false
      return overviewShouldPollFast(overviewQuery.data) ? ADMIN_OVERVIEW_POLL_ACTIVE_MS : ADMIN_OVERVIEW_POLL_MS
    },
  })

  const activityDocsQuery = useQuery({
    queryKey: adminQueryKeys.activityDocuments,
    queryFn: ({ signal }) => fetchAdminDocuments({ offset: 0, limit: 100 }, signal),
    refetchInterval: section === 'activity' ? ADMIN_OVERVIEW_POLL_MS : false,
    enabled: section === 'activity',
  })

  const activityEventsQuery = useQuery({
    queryKey: adminQueryKeys.activityEvents,
    queryFn: ({ signal }) => fetchIngestionActivity(signal),
    refetchInterval: section === 'activity' ? ADMIN_OVERVIEW_POLL_MS : false,
    enabled: section === 'activity',
  })

  const page = Math.floor((docQuery.offset ?? 0) / (docQuery.limit ?? 50)) + 1
  const pageSize = docQuery.limit ?? 50

  const handleSearch = useCallback((query: AdminDocumentQuery) => {
    setDocQuery(query)
  }, [])

  const openDocument = useCallback((doc: AdminDocumentSummary) => {
    setSelectedDocId(doc.source_document_id)
    setDetailsOpen(true)
  }, [])

  const overview = overviewQuery.data

  if (overviewQuery.isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Spin size="large" />
      </div>
    )
  }

  if (overviewQuery.isError) {
    const err = overviewQuery.error
    return (
      <div className="p-6 max-w-2xl">
        <Alert
          type="error"
          showIcon
          message="Failed to load ingestion overview"
          description={err instanceof ApiError ? err.detail ?? err.message : (err as Error).message}
        />
      </div>
    )
  }

  if (!overview) return null

  return (
    <div className={ADMIN_PAGE_CLASS}>
      <aside className={ADMIN_SECTION_NAV_CLASS}>
        <IngestionSectionNav failedCount={overview.counts.failed} />
      </aside>

      <main className={ADMIN_SECTION_MAIN_CLASS}>
        <div className={`max-w-6xl w-full mx-auto ${ADMIN_STACK_SPACE} pb-2`}>
          {section === 'overview' && (
            <div className={ADMIN_STACK_SPACE}>
              <PipelineProgressCard
                overview={overview}
                dataUpdatedAt={overviewQuery.dataUpdatedAt}
                isRefreshing={overviewQuery.isFetching}
                onRefresh={() => {
                  void overviewQuery.refetch()
                }}
              />
              <IngestionControls overview={overview} />
            </div>
          )}

          {section === 'activity' && (
            <IngestionActivityLog
              overview={overview}
              documents={activityDocsQuery.data?.items ?? []}
              systemEvents={activityEventsQuery.data?.items ?? []}
              loading={activityDocsQuery.isFetching || activityEventsQuery.isFetching}
              onRefresh={() => {
                void activityDocsQuery.refetch()
                void activityEventsQuery.refetch()
                void overviewQuery.refetch()
              }}
              onSelectDocument={(docId) => {
                setSelectedDocId(docId)
                setDetailsOpen(true)
              }}
            />
          )}

          {section === 'documents' && (
            <div className={ADMIN_STACK_SPACE}>
              <DocumentSearch
                loading={documentsQuery.isFetching}
                onSearch={(query) => {
                  handleSearch(query)
                }}
              />
              <DocumentTable
                items={documentsQuery.data?.items ?? []}
                total={documentsQuery.data?.total ?? 0}
                loading={documentsQuery.isLoading}
                refreshing={documentsQuery.isFetching && !documentsQuery.isLoading}
                page={page}
                pageSize={pageSize}
                onPageChange={(p, size) => {
                  setDocQuery((prev) => ({
                    ...prev,
                    offset: (p - 1) * size,
                    limit: size,
                  }))
                }}
                onSelect={openDocument}
                onRefresh={() => {
                  void documentsQuery.refetch()
                  void overviewQuery.refetch()
                }}
              />
            </div>
          )}

          {section === 'errors' && <FailedDocumentsTable onSelect={openDocument} />}

          {section === 'system' && (
            <div className={ADMIN_STACK_SPACE}>
              <div className={`grid grid-cols-1 md:grid-cols-2 ${ADMIN_STACK_GAP}`}>
                <SystemHealth
                  health={overview.health}
                  circuitOpen={overview.circuit_open}
                  ragApiBaseUrl={overview.rag_api_base_url}
                />
                <ThroughputSummary bulk={overview.bulk_progress} />
              </div>
              <div className={`grid grid-cols-1 md:grid-cols-2 ${ADMIN_STACK_GAP}`}>
                <AuditSyncStatus overview={overview} />
                <ReconciliationStatus overview={overview} />
              </div>
            </div>
          )}
        </div>
      </main>

      <DocumentDetailsPanel
        docId={selectedDocId}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
      />
    </div>
  )
}

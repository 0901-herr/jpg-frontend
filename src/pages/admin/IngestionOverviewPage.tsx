import { Alert, Spin } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { fetchAdminDocuments, fetchIngestionOverview } from '../../api/admin'
import type { AdminDocumentQuery, AdminDocumentSummary } from '../../api/types/admin'
import AuditSyncStatus from '../../components/admin/AuditSyncStatus'
import DocumentDetailsPanel from '../../components/admin/DocumentDetailsPanel'
import DocumentSearch from '../../components/admin/DocumentSearch'
import DocumentTable from '../../components/admin/DocumentTable'
import FailedDocumentsTable from '../../components/admin/FailedDocumentsTable'
import IngestionControls from '../../components/admin/IngestionControls'
import IngestionStatusHeader from '../../components/admin/IngestionStatusHeader'
import ProgressSummary from '../../components/admin/ProgressSummary'
import ReconciliationStatus from '../../components/admin/ReconciliationStatus'
import SystemHealth from '../../components/admin/SystemHealth'
import ThroughputSummary from '../../components/admin/ThroughputSummary'
import { ADMIN_OVERVIEW_POLL_MS } from '../../config/admin'
import { adminQueryKeys } from '../../lib/adminQueryKeys'
import { ApiError } from '../../api/http'

const DEFAULT_QUERY: AdminDocumentQuery = { offset: 0, limit: 50 }

export default function IngestionOverviewPage() {
  const [docQuery, setDocQuery] = useState<AdminDocumentQuery>(DEFAULT_QUERY)
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const overviewQuery = useQuery({
    queryKey: adminQueryKeys.overview,
    queryFn: ({ signal }) => fetchIngestionOverview(signal),
    refetchInterval: ADMIN_OVERVIEW_POLL_MS,
  })

  const documentsQuery = useQuery({
    queryKey: adminQueryKeys.documents(docQuery),
    queryFn: ({ signal }) => fetchAdminDocuments(docQuery, signal),
    placeholderData: (prev) => prev,
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
      <div className="flex justify-center py-24">
        <Spin size="large" />
      </div>
    )
  }

  if (overviewQuery.isError) {
    const err = overviewQuery.error
    return (
      <Alert
        type="error"
        showIcon
        message="Failed to load ingestion overview"
        description={err instanceof ApiError ? err.detail ?? err.message : (err as Error).message}
      />
    )
  }

  if (!overview) return null

  return (
    <div className="space-y-6">
        <IngestionStatusHeader overview={overview} />

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <ProgressSummary overview={overview} />
            <IngestionControls overview={overview} />
          </div>
          <div className="space-y-6">
            <SystemHealth health={overview.health} circuitOpen={overview.circuit_open} />
            <ThroughputSummary bulk={overview.bulk_progress} />
          </div>
        </div>

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
        />

        <FailedDocumentsTable onSelect={openDocument} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <AuditSyncStatus overview={overview} />
          <ReconciliationStatus overview={overview} />
        </div>

        <DocumentDetailsPanel
          docId={selectedDocId}
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
        />
    </div>
  )
}

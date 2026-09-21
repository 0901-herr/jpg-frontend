import { Alert, Drawer, Spin } from 'antd'
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
  INGESTION_SECTION_LABELS,
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
import { NARROW_LAYOUT_QUERY } from '../../config/layout'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { overviewShouldPollFast } from '../../utils/pipelineStatus'
import { adminQueryKeys } from '../../lib/adminQueryKeys'
import { ApiError } from '../../api/http'
import { ChatChevronIcon, ChatCloseIcon } from '../../icons/chat'

const DEFAULT_QUERY: AdminDocumentQuery = { offset: 0, limit: 50 }

export default function IngestionOverviewPage() {
  const [searchParams] = useSearchParams()
  const section = getIngestionSection(searchParams)
  const [docQuery, setDocQuery] = useState<AdminDocumentQuery>(DEFAULT_QUERY)
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  // P0-1 (UI polish pass): the second nav level (Overview/Activity/
  // Documents/Failures/System) — like AdminLayout's own primary nav — used
  // to be a fixed-width `<aside>` that, below 768px, consumed the rest of
  // the viewport this page's content had left after the primary nav ate
  // its own share, squeezing `<main>` to 0px with no way to scroll to it.
  // Collapses into a "Sections" trigger + Drawer at the same breakpoint,
  // same pattern as AdminLayout's primary nav.
  const isNarrowLayout = useMediaQuery(NARROW_LAYOUT_QUERY)
  const [sectionDrawerOpen, setSectionDrawerOpen] = useState(false)

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
    <div className="flex flex-col h-full min-h-0 min-w-0">
      {isNarrowLayout && (
        <div className="flex items-center justify-between gap-2 h-12 px-4 shrink-0 border-b border-[var(--admin-border)] bg-white">
          <button
            type="button"
            onClick={() => setSectionDrawerOpen(true)}
            className="flex items-center gap-1 admin-text-body"
            aria-label="Open sections menu"
          >
            <span className="font-medium">{INGESTION_SECTION_LABELS[section]}</span>
            <ChatChevronIcon className="docu-tree-chevron expanded" aria-hidden />
          </button>
          {overview.counts.failed > 0 && (
            <span className="admin-text-error text-xs font-medium">
              {overview.counts.failed} failing
            </span>
          )}
        </div>
      )}

      <div className={ADMIN_PAGE_CLASS}>
        {!isNarrowLayout && (
          <aside className={ADMIN_SECTION_NAV_CLASS}>
            <IngestionSectionNav failedCount={overview.counts.failed} />
          </aside>
        )}

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
                onRefresh={() => {
                  void documentsQuery.refetch()
                  void overviewQuery.refetch()
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

      {isNarrowLayout && (
        <Drawer
          placement="left"
          open={sectionDrawerOpen}
          onClose={() => setSectionDrawerOpen(false)}
          size="min(80vw, 280px)"
          closable={{ placement: 'end', 'aria-label': 'Close menu' }}
          closeIcon={<ChatCloseIcon />}
          classNames={{ close: 'docu-mobile-drawer-close' }}
          title={
            <span className="admin-sidebar-title" style={{ fontWeight: 600 }}>
              Sections
            </span>
          }
          styles={{ header: { padding: '0.625rem 1rem' }, body: { padding: 0 } }}
          // Same reasoning as AdminLayout.tsx's own primary-nav Drawer:
          // rendered inline (no portal) so it stays a DOM descendant of
          // the `.admin-panel` div (AdminLayout.tsx) its `--admin-*`
          // custom properties are scoped to.
          getContainer={false}
        >
          {/* Closes the drawer on any section click — IngestionSectionNav's
              rows are plain `<Link>`s with no `onNavigate`-style prop of
              their own, so this relies on the click bubbling up from
              whichever row was clicked rather than threading a new prop
              through it. */}
          <div onClick={() => setSectionDrawerOpen(false)}>
            <IngestionSectionNav failedCount={overview.counts.failed} />
          </div>
        </Drawer>
      )}
    </div>
  )
}

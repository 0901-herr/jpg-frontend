import { AdminRefreshIcon } from '../../icons/admin'
import { App, Button, Table } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnsType } from 'antd/es/table'
import { fetchAdminDocuments, fetchIngestionErrors, retryDocument, retryFailedDocuments } from '../../api/admin'
import type { AdminDocumentSummary } from '../../api/types/admin'
import { ADMIN_EMPTY } from '../../config/adminStyles'
import { adminQueryKeys } from '../../lib/adminQueryKeys'
import { formatDateTime } from '../../utils/lifecycle'
import { ADMIN_TEXT_MUTED } from '../../config/adminStyles'
import AdminCard from './AdminCard'

interface FailedDocumentsTableProps {
  onSelect: (doc: AdminDocumentSummary) => void
}

export default function FailedDocumentsTable({ onSelect }: FailedDocumentsTableProps) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const { data: errors } = useQuery({
    queryKey: adminQueryKeys.errors,
    queryFn: ({ signal }) => fetchIngestionErrors(signal),
  })

  const { data, isLoading } = useQuery({
    queryKey: adminQueryKeys.documents({ lifecycleStatus: 'FAILED', offset: 0, limit: 25 }),
    queryFn: ({ signal }) =>
      fetchAdminDocuments({ lifecycleStatus: 'FAILED', offset: 0, limit: 25 }, signal),
  })

  const retryAllMutation = useMutation({
    mutationFn: () => retryFailedDocuments(),
    onSuccess: (result) => {
      message.success(`Scheduled ${result.retried} retries`)
      void queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
    onError: (err: Error) => message.error(err.message),
  })

  const retryOneMutation = useMutation({
    mutationFn: (docId: string) => retryDocument(docId),
    onSuccess: () => {
      message.success('Retry scheduled')
      void queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
    onError: (err: Error) => message.error(err.message),
  })

  const columns: ColumnsType<AdminDocumentSummary> = [
    { title: 'Filename', dataIndex: 'filename', render: (v, r) => v ?? r.source_document_id },
    { title: 'docId', dataIndex: 'source_document_id', width: 100 },
    {
      title: 'Error',
      dataIndex: 'last_error',
      ellipsis: true,
      render: (v: string | null, row) => v ?? row.last_error_code ?? ADMIN_EMPTY,
    },
    { title: 'Retries', dataIndex: 'retry_count', width: 80 },
    {
      title: 'Last failed',
      dataIndex: 'failed_at',
      width: 160,
      render: (v: string | null) => formatDateTime(v),
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_, row) => (
        <Button
          size="small"
          icon={<AdminRefreshIcon />}
          loading={retryOneMutation.isPending}
          onClick={(e) => {
            e.stopPropagation()
            retryOneMutation.mutate(row.source_document_id)
          }}
        >
          Retry
        </Button>
      ),
    },
  ]

  const totalFailed = data?.total ?? 0

  return (
    <AdminCard
      className="admin-failures-card"
      title={`Failures (${totalFailed.toLocaleString()})`}
      extra={
        totalFailed > 0 ? (
          <Button
            type="primary"
            icon={<AdminRefreshIcon />}
            loading={retryAllMutation.isPending}
            onClick={() => retryAllMutation.mutate()}
          >
            Retry all
          </Button>
        ) : null
      }
    >
      {errors && errors.groups.length > 0 && (
        <div className={`mb-4 ${ADMIN_TEXT_MUTED}`}>
          Top errors:{' '}
          {errors.groups
            .slice(0, 5)
            .map((g) => `${g.error_code ?? 'unknown'} (${g.count})`)
            .join(' · ')}
        </div>
      )}
      <div className="min-w-0 overflow-x-auto -mx-1">
        <Table
          rowKey="source_document_id"
          size="small"
          columns={columns}
          dataSource={data?.items ?? []}
          loading={isLoading}
          pagination={false}
          scroll={{ x: 720 }}
          locale={{ emptyText: 'No failed documents' }}
          onRow={(record) => ({
            onClick: () => onSelect(record),
            className: 'cursor-pointer',
          })}
        />
      </div>
    </AdminCard>
  )
}

import { Table } from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import type { AdminDocumentSummary } from '../../api/types/admin'
import { ADMIN_EMPTY, ADMIN_TABLE_SCROLL } from '../../config/adminStyles'
import { formatDateTime } from '../../utils/lifecycle'
import DocumentStatusBadge from './DocumentStatusBadge'
import IngestionPipelineWaterfall from './IngestionPipelineWaterfall'

interface DocumentTableProps {
  items: AdminDocumentSummary[]
  total: number
  loading?: boolean
  page: number
  pageSize: number
  onPageChange: (page: number, pageSize: number) => void
  onSelect: (doc: AdminDocumentSummary) => void
}

export default function DocumentTable({
  items,
  total,
  loading,
  page,
  pageSize,
  onPageChange,
  onSelect,
}: DocumentTableProps) {
  const columns: ColumnsType<AdminDocumentSummary> = [
    {
      title: 'Filename',
      dataIndex: 'filename',
      key: 'filename',
      ellipsis: true,
      width: 220,
      render: (value: string | null, row) => value ?? `(doc ${row.source_document_id})`,
    },
    {
      title: 'LogicalDOC ID',
      dataIndex: 'source_document_id',
      key: 'source_document_id',
      width: 140,
    },
    {
      title: 'Pipeline',
      key: 'pipeline',
      width: 340,
      render: (_value, row) => (
        <IngestionPipelineWaterfall status={row.lifecycle_status} doc={row} />
      ),
    },
    {
      title: 'Status',
      dataIndex: 'lifecycle_status',
      key: 'lifecycle_status',
      width: 110,
      render: (status) => <DocumentStatusBadge status={status} />,
    },
    {
      title: 'Source',
      dataIndex: 'discovery_source',
      key: 'discovery_source',
      width: 120,
      ellipsis: true,
      render: (v: string | null) => v ?? ADMIN_EMPTY,
    },
    {
      title: 'Retry',
      dataIndex: 'retry_count',
      key: 'retry_count',
      width: 80,
    },
    {
      title: 'Updated',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 170,
      render: (v: string | null) => formatDateTime(v),
    },
  ]

  const pagination: TablePaginationConfig = {
    current: page,
    pageSize,
    total,
    showSizeChanger: true,
    pageSizeOptions: ['25', '50', '100'],
    showTotal: (t) => `${t.toLocaleString()} documents`,
    onChange: onPageChange,
  }

  return (
    <section>
      <div className="admin-table-scroll min-w-0 overflow-x-auto">
        <Table
          rowKey="source_document_id"
          className="admin-document-table"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={pagination}
          scroll={ADMIN_TABLE_SCROLL}
          size="middle"
          tableLayout="fixed"
          onRow={(record) => ({
            onClick: () => onSelect(record),
            className: 'cursor-pointer',
          })}
          locale={{ emptyText: 'No documents match your search' }}
        />
      </div>
    </section>
  )
}

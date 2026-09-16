import { AdminFilterIcon, AdminSearchIcon } from '../../icons/admin'
import { Button, Checkbox, Form, Input, Popover, Select, Space } from 'antd'
import { useState } from 'react'
import type { AdminDocumentQuery, LifecycleStatus } from '../../api/types/admin'
import { LIFECYCLE_LABELS } from '../../utils/lifecycle'
import AdminRefreshButton from './AdminRefreshButton'

export interface DocumentSearchValues {
  search: string
  lifecycleStatus?: LifecycleStatus
  discoverySource?: string
  failedOnly: boolean
}

interface DocumentSearchProps {
  initialValues?: Partial<DocumentSearchValues>
  loading?: boolean
  onSearch: (query: AdminDocumentQuery) => void
  onRefresh?: () => void
}

const lifecycleOptions = Object.entries(LIFECYCLE_LABELS).map(([value, label]) => ({
  value,
  label,
}))

export function buildDocumentQuery(values: DocumentSearchValues, page: number, pageSize: number): AdminDocumentQuery {
  const query: AdminDocumentQuery = { offset: (page - 1) * pageSize, limit: pageSize }
  const term = values.search.trim()
  if (term) {
    if (/^\d+$/.test(term)) query.docId = term
    else query.filename = term
  }
  if (values.failedOnly) query.lifecycleStatus = 'FAILED'
  else if (values.lifecycleStatus) query.lifecycleStatus = values.lifecycleStatus
  if (values.discoverySource) query.discoverySource = values.discoverySource
  return query
}

export default function DocumentSearch({
  initialValues,
  loading,
  onSearch,
  onRefresh,
}: DocumentSearchProps) {
  const [form] = Form.useForm<DocumentSearchValues>()
  const [filtersOpen, setFiltersOpen] = useState(false)

  const submit = (page = 1, pageSize = 50) => {
    const values = form.getFieldsValue()
    onSearch(buildDocumentQuery(values, page, pageSize))
  }

  const clearFilters = () => {
    const search = form.getFieldValue('search') ?? ''
    form.setFieldsValue({
      lifecycleStatus: undefined,
      discoverySource: undefined,
      failedOnly: false,
    })
    onSearch(buildDocumentQuery({ search, failedOnly: false }, 1, 50))
    setFiltersOpen(false)
  }

  const filterContent = (
    <div className="w-64 pt-1">
      <Form.Item label="Status" name="lifecycleStatus">
        <Select allowClear placeholder="Any status" options={lifecycleOptions} />
      </Form.Item>
      <Form.Item label="Source" name="discoverySource">
        <Select
          allowClear
          placeholder="Any source"
          options={[
            { value: 'bfs', label: 'Bulk (BFS)' },
            { value: 'audit', label: 'Audit sync' },
            { value: 'manual', label: 'Manual' },
            { value: 'reconciliation', label: 'Reconciliation' },
          ]}
        />
      </Form.Item>
      <Form.Item name="failedOnly" valuePropName="checked">
        <Checkbox aria-label="Failed only">Failed only</Checkbox>
      </Form.Item>
      <Space className="flex w-full justify-end">
        <Button
          type="primary"
          onClick={() => {
            submit()
            setFiltersOpen(false)
          }}
        >
          Apply
        </Button>
        <Button onClick={clearFilters}>Clear</Button>
      </Space>
    </div>
  )

  return (
    <Form
      className="w-full"
      form={form}
      layout="vertical"
      initialValues={{
        search: '',
        failedOnly: false,
        ...initialValues,
      }}
      onFinish={() => submit()}
    >
      <div className="flex w-full items-center gap-2">
        <Form.Item name="search" className="!mb-0 min-w-0 flex-1 md:max-w-md">
          <Input
            placeholder="LogicalDOC ID or filename"
            allowClear
            prefix={<AdminSearchIcon />}
            disabled={loading}
          />
        </Form.Item>
        <Popover
          content={filterContent}
          title="Filter documents"
          trigger="click"
          placement="bottom"
          arrow={false}
          rootClassName="admin-panel admin-filter-popover"
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
        >
          <Button icon={<AdminFilterIcon />}>Filter</Button>
        </Popover>
        {onRefresh ? <AdminRefreshButton onClick={onRefresh} loading={loading} /> : null}
      </div>
    </Form>
  )
}

import { Spin, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { fetchDocumentFile } from '../api/documents'
import type { DocumentItem } from '../api/types/documents'
import { type, typeColor } from '../styles/typography'

const { Text } = Typography

interface DocumentPreviewProps {
  document: DocumentItem
}

export default function DocumentPreview({ document }: DocumentPreviewProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

    setIsLoading(true)
    setError(null)
    setFileUrl(null)

    fetchDocumentFile(document.doc_id)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setFileUrl(objectUrl)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Could not load document'
        setError(message)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [document.doc_id])

  const title = document.source_file
  const isPdf = title.toLowerCase().endsWith('.pdf')

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-8 py-4 border-b border-gray-200 shrink-0">
        <Text strong className={`${type.body} ${typeColor.primary}`}>
          {title}
        </Text>
      </div>

      <div className="flex-1 min-h-0 px-8 py-4">
        {isLoading ? (
          <div className="flex justify-center items-center h-full">
            <Spin size="large" />
          </div>
        ) : error ? (
          <Text type="danger" className={type.body}>
            {error}
          </Text>
        ) : fileUrl && isPdf ? (
          <iframe
            title={title}
            src={fileUrl}
            className="w-full h-full border-0 rounded-lg bg-gray-50"
          />
        ) : fileUrl ? (
          <div className={`${type.body} ${typeColor.secondary} space-y-3`}>
            <p>Preview is not available for this file type.</p>
            <a href={fileUrl} download={title} className="text-blue-600 hover:underline">
              Download file
            </a>
          </div>
        ) : null}
      </div>
    </div>
  )
}

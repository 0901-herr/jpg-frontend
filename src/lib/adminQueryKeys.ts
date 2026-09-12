import type { AdminDocumentQuery } from '../api/types/admin'

export const adminQueryKeys = {
  overview: ['admin', 'overview'] as const,
  activityFeed: ['admin', 'activity-feed'] as const,
  activityDocuments: ['admin', 'activity-documents'] as const,
  activityEvents: ['admin', 'activity-events'] as const,
  errors: ['admin', 'errors'] as const,
  documents: (params: AdminDocumentQuery) => ['admin', 'documents', params] as const,
  document: (docId: string) => ['admin', 'document', docId] as const,
}

import { useQuery } from '@tanstack/react-query'
import { browseDocuments } from '../../api/documents'
import type { BrowseDocumentsParams } from '../../api/types/documents'
import { queryKeys } from '../../lib/queryClient'
import { documentsToTreeData } from '../../utils/documentsToTree'

export function useDocuments(params: BrowseDocumentsParams = {}) {
  const query = useQuery({
    queryKey: queryKeys.documents(params),
    queryFn: () => browseDocuments(params),
  })

  return {
    ...query,
    documents: query.data?.documents ?? [],
    treeData: query.data ? documentsToTreeData(query.data.documents) : [],
  }
}

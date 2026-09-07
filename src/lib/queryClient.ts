import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export const queryKeys = {
  currentUser: ['auth', 'me'] as const,
  browseRoot: ['browse', 'root'] as const,
  folderContents: (folderId: number, page?: number) =>
    ['browse', 'folder', folderId, page ?? 1] as const,
  documents: (params?: { category?: string; namespace?: string }) =>
    ['documents', 'browse', params ?? {}] as const,
}

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntApp } from 'antd'
import React from 'react'
import { vi } from 'vitest'
import * as adminApi from '../../api/admin'
import ReclassifyMissingButton from './ReclassifyMissingButton'
import { mockReingestMissingResponse } from '../../test/adminFixtures'

vi.mock('../../api/admin')

function renderButton() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <ReclassifyMissingButton />
      </AntApp>
    </QueryClientProvider>,
  )
}

describe('ReclassifyMissingButton', () => {
  beforeEach(() => {
    vi.mocked(adminApi.reingestMissingClassification).mockResolvedValue(
      mockReingestMissingResponse,
    )
  })

  it('calls the re-ingest-missing-classification API after confirmation', async () => {
    const user = userEvent.setup()
    renderButton()
    await user.click(screen.getByRole('button', { name: /Re-ingest missing classification/i }))
    await user.click(await screen.findByRole('button', { name: /^re-ingest$/i }))
    await waitFor(() => expect(adminApi.reingestMissingClassification).toHaveBeenCalled())
  })

  it('shows a success message with the queued count', async () => {
    const user = userEvent.setup()
    renderButton()
    await user.click(screen.getByRole('button', { name: /Re-ingest missing classification/i }))
    await user.click(await screen.findByRole('button', { name: /^re-ingest$/i }))
    expect(await screen.findByText(/Re-queued 2 documents for classification/i)).toBeInTheDocument()
  })
})

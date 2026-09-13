const STATE_LABELS: Record<string, string> = {
  RUNNING: 'Running',
  PAUSED: 'Paused',
  DEGRADED: 'Degraded',
  ERROR: 'Error',
  PARTIAL: 'Partial',
  COMPLETE: 'Complete',
  idle: 'Idle',
  OPEN: 'Open',
  CLOSED: 'Closed',
  completed: 'Completed',
  failed: 'Failed',
  running: 'Running',
}

/** Human-readable pipeline state for the admin UI. */
export function formatStateLabel(state: string): string {
  return STATE_LABELS[state] ?? state.charAt(0).toUpperCase() + state.slice(1).toLowerCase()
}

/** Built-in summarize prompt sent when the user taps Summary in the chat bar. */
export function buildSummaryPrompt(selectedCount: number): string {
  if (selectedCount <= 0) return ''
  if (selectedCount === 1) {
    return (
      'Summarize this document in clear, concise language. Cover the main topics, ' +
      'key findings, and any important conclusions.'
    )
  }
  return (
    `Summarize the ${selectedCount} selected documents. Give a brief overview of each ` +
    'document, then highlight common themes or important differences.'
  )
}

/** Maximum number of document ids that the legacy explicit-scope adapter accepts. */
export const MAX_EXPLICIT_SELECTION = 500

/** Keep selected-file previews useful without mounting one row per selected id. */
export const MAX_SELECTED_FILE_PREVIEW = 20

export const SELECTION_LIMIT_MESSAGE =
  `You can select up to ${MAX_EXPLICIT_SELECTION} documents at a time.`

/** Maximum number of document ids that the legacy explicit-scope adapter accepts. */
export const MAX_EXPLICIT_SELECTION = 500

/** Keep selected-file previews useful without mounting one row per selected id. */
export const MAX_SELECTED_FILE_PREVIEW = 20

export const SELECTION_LIMIT_MESSAGE =
  `Selection limit reached: you can select up to ${MAX_EXPLICIT_SELECTION} files at a time. Deselect some files to add others.`

/** Per-row tooltip on a document that is otherwise selectable but disabled
 * because the explicit-scope limit above has been reached (owner
 * requirement, 2026-09-23 demo prep: the UI must make it unmistakable that
 * a file isn't selectable *because of the limit*, not silently ignore the
 * click). */
export const SELECTION_LIMIT_ROW_HINT =
  `Not selectable — the ${MAX_EXPLICIT_SELECTION}-file selection limit is reached. Deselect a file first.`

export type BrowseViewMode = 'folder' | 'category'

interface BrowseViewToggleProps {
  mode: BrowseViewMode
  onChange: (mode: BrowseViewMode) => void
}

export default function BrowseViewToggle({ mode, onChange }: BrowseViewToggleProps) {
  return (
    <div className="flex justify-center shrink-0 pb-1">
      <div
        className="docu-browse-view-toggle"
        data-mode={mode}
        role="tablist"
        aria-label="Browse view"
      >
        <span className="docu-browse-view-slider" aria-hidden />
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'folder'}
          className={mode === 'folder' ? 'is-active' : undefined}
          onClick={() => onChange('folder')}
        >
          Folder
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'category'}
          className={mode === 'category' ? 'is-active' : undefined}
          onClick={() => onChange('category')}
        >
          Category
        </button>
      </div>
    </div>
  )
}

import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC_DIR = path.resolve(__dirname, '..')

/** Directories under `src/` this guard never walks into at all — the
 * operator-only admin surface (per the brief: "leave them untouched"),
 * plus a couple of categories that structurally never carry user-facing
 * copy no matter what file lands in them:
 *  - `api/` is the HTTP/data layer — every string literal there is an
 *    endpoint path, a header name, a MIME type, or a wire-contract field
 *    key, never rendered copy (verified by inspection: scanning it before
 *    this exclusion produced zero real UI-copy hits, only this noise).
 *  - `test/` holds shared test fixtures (e.g. `adminFixtures.ts`), not
 *    shipped UI copy — same spirit as excluding `*.test.*` files below.
 *  - `mocks/` holds the opt-in admin demo backend and its fixture data;
 *    it is only reached through the admin-only `VITE_ADMIN_MOCK` mode. */
const EXCLUDED_DIRS = new Set(['admin', 'api', 'mocks', 'test'])

/** Individual files outside those directories that are nonetheless
 * exclusively operator-only: every importer of each of these lives under
 * `src/pages/admin` or `src/components/admin` (verified with a grep for
 * `from '.../<name>'` across the whole tree before adding it here — see
 * the round-5 report for the exact commands). They exist in `utils/`
 * rather than `admin/` for historical reasons, but functionally they are
 * the admin surface, and several of their strings are pinned verbatim by
 * `src/pages/admin/IngestionOverviewPage.test.tsx`, a test file this brief
 * says to leave untouched — rewording them here would break that test for
 * zero client-visible benefit. */
const EXCLUDED_FILES = new Set([
  'utils/lifecycle.ts',
  'utils/activityLog.ts',
  'utils/pipelineStatus.ts',
  'utils/progressMetrics.ts',
  'config/admin.ts',
])

/** Every `.ts`/`.tsx` file under `src/`, relative to `src/`, excluding
 * `*.test.*` files (same rationale as `noEllipsis.test.ts`: tests may
 * reference a jargon word as fixture data — e.g. simulating an upstream
 * `status_reason` — without that leaking into shipped copy) and the
 * operator-only/never-UI paths above. */
function listSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry)) continue
      files.push(...listSourceFiles(full))
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue
    if (/\.test\.(ts|tsx)$/.test(entry)) continue
    const rel = path.relative(SRC_DIR, full)
    if (EXCLUDED_FILES.has(rel)) continue
    files.push(rel)
  }
  return files
}

/** Acronym-shaped stems get a trailing word boundary too, not just a
 * leading one — without it "API" matches inside an identifier like
 * `apiPost` (a real false positive hit while building this guard), and
 * "RAG" matches inside an ordinary word like "storage". Every other stem
 * is deliberately a *prefix* match (leading boundary only) so it also
 * catches the natural inflections the brief calls out (e.g. "index"
 * catches "indexed"/"indexing", "retriev" catches "retrieve"/"retrieval"/
 * "retrieving") — a trailing boundary would defeat that on purpose. */
const ACRONYM_STEMS = ['API', 'SSE', 'RAG', 'OCR', 'LLM', 'RRF']
const PREFIX_STEMS = [
  'rerank',
  'chunk',
  'embedding',
  'vector',
  'index',
  'token',
  'model',
  'tier',
  'fusion',
  'segment',
  'variant',
  'pipeline',
  'strategy',
  'agentic',
  'retriev',
  'semantic',
  'lexical',
  'latency',
  'backend',
  'adapter',
  'endpoint',
  'stream',
  'payload',
  'classif',
  'ingest',
  'cache',
  'abstain',
  'fallback',
  'lookup',
  'passage',
  'leaf',
  'subfolder',
]

/** "metadata" is deliberately never a banned stem, on either list above —
 * not an oversight, an explicit product-wording ruling (owner, round-5 fix
 * round 1): it's the feature's own name ("Extract metadata"), and the
 * client also names its own report after it ("Extracted metadata — <file>",
 * "Extract metadata from <file>"), so "metadata" is consistent product
 * wording, not jargon leaking through. The rule is general — the word
 * "metadata" is allowed anywhere on the client path, not only inside the
 * exact phrase "Extract metadata" — while every *other* stem stays banned
 * everywhere, feature name or not. Listed here (unused by
 * `JARGON_PATTERN` — it was never on either stem list) purely so this
 * decision is visible next to the stems it's an exception to, instead of
 * being an absence a future maintainer has to notice and question. */
const ALWAYS_ALLOWED_WORDS = ['metadata']

/** A handful of prefix stems are also complete, common English words whose
 * *letters* can continue into an unrelated word with no word boundary in
 * between — "cache" into "cachet", "stream" into "streamline" — so a
 * leading boundary alone isn't enough for these specific ones the way it
 * is for e.g. "index" (no ordinary English word starts with "index" and
 * continues into something unrelated). Each gets a negative lookahead for
 * the exact continuation(s) known to cause a false positive, rather than a
 * general trailing-boundary rule, which would also block the inflections
 * this guard needs to keep catching (a trailing boundary on "index" would
 * stop it matching "indexed"/"indexing"). Add another entry here the same
 * way if a new collision like this turns up. */
const PREFIX_FALSE_POSITIVE_GUARDS: Record<string, string> = {
  cache: 't', // "cachet"
  stream: 'line', // "streamline"
}

function withFalsePositiveGuard(stem: string): string {
  const blocked = PREFIX_FALSE_POSITIVE_GUARDS[stem]
  return blocked ? `${stem}(?!${blocked})` : stem
}

const JARGON_PATTERN = new RegExp(
  `\\b(?:${ACRONYM_STEMS.join('|')})\\b|\\b(?:${PREFIX_STEMS.map(withFalsePositiveGuard).join('|')})`,
  'i',
)

/** Extracted UI-text regions that legitimately contain a stem but are
 * never shown to a user — the brief's own carve-out ("an allowlist only
 * for the feature names noted above and for non-user-facing identifiers
 * (CSS class names, event names, keys)"), extended to the couple of
 * analogous categories this codebase actually has: a status/stage enum
 * value compared against but never displayed, a wire-contract field key,
 * and — in `userFacingErrors.ts` — a raw upstream-text matching pattern
 * whose entire purpose is to *detect* technical wording before it can
 * reach the user (the matched value is replaced, never shown verbatim).
 * Matched against the extracted region exactly as captured (quotes
 * included for a string/template literal, no quotes for bare JSX text). */
const ALLOWLIST = new Set([
  // Status/stage enum literals — compared against (`message.status ===
  // 'streaming'`), assigned, or named in a union type; never rendered.
  "'streaming'",
  "'INDEXING'",
  // Wire-contract field keys, never displayed.
  "'chunk_id'",
  "'chunks'",
  // `Pick<BrowseDocumentItem, 'indexing_status' | ...>` — TS type-level
  // string-literal union members (field names), not runtime UI text.
  "'indexing_status'",
  "'classification_category'",
  // data-testid value — not a `className`/`classNames` attribute (a plain
  // object literal key instead: `{ 'data-testid': 'streaming-cursor' }`),
  // so `neutralizeClassNameAttributes` below doesn't reach it.
  "'streaming-cursor'",
  // A React Router path, not prose.
  '"/admin/ingestion"',
  // `METADATA_EXTRACTION_KNOWN_DETAILS` in userFacingErrors.ts: the
  // contract's own raw detail text, used only as a lookup key — the mapped
  // *value* is what's actually shown, and that value is jargon-free (see
  // the guard test for `toUserFacingMetadataExtractionError`).
  "'Document is still being indexed. Try again when it is Ready.'",
])

/** Strips `/* ... *‍/` block comments (JSDoc included) and `//` line-comment
 * tails, and blanks out any line carrying the `jargon-ok` escape hatch (a
 * genuine non-UI use this guard should never flag) — mirrors
 * `noEllipsis.test.ts`'s `stripCommentsAndEscapes` exactly. */
function stripCommentsAndEscapes(source: string): string {
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, '')
  return withoutBlockComments
    .split('\n')
    .map((line) => (line.includes('jargon-ok') ? '' : line.replace(/\/\/.*/, '')))
    .join('\n')
}

/** Neutralizes import/require module specifiers before extraction — a
 * path like `'../api/browse'` or `'./index.css'` is never UI text, but
 * would otherwise collide with the "index"/"api" stems on every single
 * import line in the codebase. */
function neutralizeImports(source: string): string {
  return source
    .replace(/from\s+('[^']*'|"[^"]*")/g, "from ''")
    .replace(/import\(\s*('[^']*'|"[^"]*")\s*\)/g, "import('')")
    .replace(/require\(\s*('[^']*'|"[^"]*")\s*\)/g, "require('')")
    .replace(/^(\s*import\s+)('[^']*'|"[^"]*")/gm, "$1''")
}

/** Neutralizes a `className`/`xClassName` JSX attribute's string value —
 * `className="docu-query-tier-option"`, `rootClassName='...'`,
 * `overlayClassName={\`...\`}` — and antd v6's semantic `classNames={{ ... }}`
 * object-literal prop (`classNames={{ root: 'docu-query-tier-menu' }}`).
 * Both shapes are CSS class name(s) by construction, in this codebase and
 * in React generally, never user-facing prose — but the guard's own
 * string-literal scan can't tell a class name from any other string
 * without this. Blanking the *value* (not the whole match) keeps every
 * other neutralizer's shape ("a string literal region") working the same
 * way, and keeps the fix general (one rule for every `*ClassName`
 * attribute and every `classNames` prop) instead of an ever-growing
 * per-class-name ALLOWLIST entry — the growing-list approach this
 * replaced (see git history) required a new entry for every fix that
 * touched or added a class name, which is what generalizing it here is
 * meant to stop needing. None of this codebase's `classNames={{ ... }}`
 * usages nest braces inside the object (always a flat `{ key: 'value' }`
 * shape), so matching up to the first `}}` is safe. */
function neutralizeClassNameAttributes(source: string): string {
  return source
    .replace(/\b\w*[Cc]lassName\s*=\s*"(?:[^"\\]|\\.)*"/g, 'className=""')
    .replace(/\b\w*[Cc]lassName\s*=\s*'(?:[^'\\]|\\.)*'/g, "className=''")
    .replace(/\b\w*[Cc]lassName\s*=\s*\{`(?:[^`\\]|\\.)*`\}/g, 'className={``}')
    .replace(/\bclassNames\s*=\s*\{\{[^{}]*\}\}/g, (match) =>
      match.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""'),
    )
}

/** Neutralizes the two other systematic "this string is compared against,
 * never displayed" shapes: a `switch`/`case` label naming a raw backend
 * stage (`case 'retrieving':`), and a `.includes('...')` (or `.has(...)`)
 * argument — `queryProgress.ts`'s stage-name switch and
 * `userFacingErrors.ts`'s raw-upstream-text matching both live entirely
 * in this shape. Both are structurally guaranteed to be inert to a user:
 * a `case` label only ever selects a branch, and `.includes`/`.has` only
 * ever returns a boolean. */
function neutralizeMatchOnlyLiterals(source: string): string {
  return source
    .replace(/\bcase\s+('[^']*'|"[^"]*")\s*:/g, "case '':")
    .replace(/\.(?:includes|has)\(\s*('[^']*'|"[^"]*")\s*\)/g, ".includes('')")
}

/** Strips a template literal's `${...}` interpolations before matching —
 * they hold JS expressions (variable/property names), not display text.
 * Without this, `` `${indexing} still getting ready` `` false-positives
 * on the *variable name* `indexing`, even though the rendered text is
 * just a number. Doesn't handle an interpolation containing a nested
 * `{}` (none of this codebase's do), an accepted limitation shared with
 * `noEllipsis.test.ts`'s comparable regex trade-offs. */
function stripInterpolations(region: string): string {
  return region.replace(/\$\{[^{}]*\}/g, '')
}

/** Pulls out the only places a jargon word is UI-visible rather than code
 * — string literals, template literals, and bare JSX text runs between
 * tags — same two patterns as `noEllipsis.test.ts`'s `extractUiText`, with
 * one addition: a bare-JSX-text candidate spanning a newline is dropped.
 * Every genuine JSX text run in this codebase is single-line; a
 * multi-line `>...<` match is always TypeScript generic syntax bridging
 * two unrelated statements (e.g. two consecutive `useRef<T>(...)` calls),
 * which — unlike an ellipsis — routinely contains an ordinary English
 * word this guard watches for (confirmed while building this guard: it
 * produced false hits like "streamingCitationsRef" between two typed
 * hooks). Real bare JSX text is never affected by this filter. */
function extractUiText(source: string): string[] {
  const regions: string[] = []

  const stringPattern = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g
  for (const match of source.matchAll(stringPattern)) regions.push(match[0])

  const jsxTextPattern = />([^<>{}]+)</g
  for (const match of source.matchAll(jsxTextPattern)) {
    if (!match[1].includes('\n')) regions.push(match[1])
  }

  return regions
}

function findJargonViolations(rawSource: string): string[] {
  const cleaned = neutralizeClassNameAttributes(
    neutralizeMatchOnlyLiterals(neutralizeImports(stripCommentsAndEscapes(rawSource))),
  )
  const violations: string[] = []
  for (const region of extractUiText(cleaned)) {
    const trimmed = region.trim()
    if (ALLOWLIST.has(trimmed)) continue
    const displayText = stripInterpolations(region)
    const match = JARGON_PATTERN.exec(displayText)
    if (match) violations.push(`"${match[0]}" in: ${trimmed}`)
  }
  return violations
}

describe('no jargon anywhere in shipped, non-admin UI copy', () => {
  it('self-test: flags a stem inside a string literal', () => {
    expect(findJargonViolations(`const label = 'Ranking passages by relevance'`)).toHaveLength(1)
    expect(findJargonViolations(`const label = "Reranking now"`)).toHaveLength(1)
    expect(findJargonViolations('const label = `${n} chunks found`')).toHaveLength(1)
  })

  it('self-test: flags a stem inside bare JSX text', () => {
    expect(findJargonViolations('const el = <span>Reading chunks</span>')).toHaveLength(1)
    expect(findJargonViolations('const el = <p>Still indexing</p>')).toHaveLength(1)
  })

  it('self-test: matches an acronym only as a whole word, not inside a longer identifier', () => {
    expect(findJargonViolations("const fn = apiPost<Response>(url)")).toHaveLength(0)
    expect(findJargonViolations("const s = 'in storage now'")).toHaveLength(0)
    expect(findJargonViolations("const s = 'Calling the API now'")).toHaveLength(1)
  })

  it('self-test: a prefix stem still catches its natural inflections', () => {
    expect(findJargonViolations("const s = 'Still indexing your files'")).toHaveLength(1)
    expect(findJargonViolations("const s = 'Retrieving your documents'")).toHaveLength(1)
    expect(findJargonViolations("const s = 'The answer is cached'")).toHaveLength(1)
    expect(findJargonViolations("const s = 'Now streaming your answer'")).toHaveLength(1)
  })

  it('self-test: "leaf" and "subfolder" are banned stems (round 6, Item A — "leaf folder" is jargon a non-technical user would not understand)', () => {
    expect(findJargonViolations("const s = 'Not available in a leaf folder'")).toHaveLength(1)
    expect(findJargonViolations("const s = 'This folder has no subfolders'")).toHaveLength(1)
  })

  it('self-test: a prefix stem does not false-positive into an unrelated word that starts the same way', () => {
    // The exact two collisions this guard was built to avoid.
    expect(findJargonViolations("const s = 'Business casual, no cachet required'")).toHaveLength(0)
    expect(findJargonViolations("const s = 'We streamlined the whole process'")).toHaveLength(0)
  })

  it('self-test: does not flag a module specifier on an import/require', () => {
    expect(findJargonViolations("import { x } from '../api/browse'")).toHaveLength(0)
    expect(findJargonViolations("import './index.css'")).toHaveLength(0)
    expect(findJargonViolations("const m = await import('./cache-warmer')")).toHaveLength(0)
  })

  it('self-test: does not flag a stem inside a comment', () => {
    expect(findJargonViolations('// still indexing this...\nconst x = 1')).toHaveLength(0)
    expect(findJargonViolations('/** reranks candidates */\nconst x = 1')).toHaveLength(0)
  })

  it('self-test: the "jargon-ok" escape hatch exempts a genuine non-UI same-line use', () => {
    const withoutEscape = "const RE = /rag/i  // matches the literal word 'rag'"
    const withEscape = "const RE = /rag/i // jargon-ok: regex source, not UI text"
    expect(findJargonViolations(withEscape)).toHaveLength(0)
    expect(findJargonViolations(withoutEscape)).toHaveLength(0)
  })

  it('self-test: does not flag a multi-line generic-type false positive between two statements', () => {
    // The exact shape that produced a real false positive while building
    // this guard: two typed hook calls with an unrelated identifier
    // between their generics' closing `>` and the next call's opening `<`.
    const src = `
      const a = useRef<Citation[]>(null)
      const streamingCitationsRef = useRef<Citation[]>([])
    `
    expect(findJargonViolations(src)).toHaveLength(0)
  })

  it('self-test: the allowlist exempts an exact non-user-facing literal but not a lookalike', () => {
    expect(findJargonViolations("const s: Status = 'streaming'")).toHaveLength(0)
    expect(findJargonViolations("const s = 'Now streaming your answer'")).toHaveLength(1)
  })

  it('self-test: "metadata" is never banned — an explicit product-wording ruling, not merely absent', () => {
    for (const word of ALWAYS_ALLOWED_WORDS) {
      expect(JARGON_PATTERN.test(word)).toBe(false)
    }
    // The owner's own product wording ("Extracted metadata" / "Extract
    // metadata"), for any deployment's configured field set, must pass —
    // in a string literal, a template literal, and an aria-label.
    expect(findJargonViolations("const s = '**Extracted metadata — file.pdf**'")).toHaveLength(0)
    expect(
      findJargonViolations('const s = `Extract metadata from ${filename}`'),
    ).toHaveLength(0)
    expect(
      findJargonViolations('const el = <button aria-label="Extract metadata" />'),
    ).toHaveLength(0)
  })

  it('self-test: a className/classNames CSS-class value is never flagged, however it stems-match, but the same word elsewhere on the same line still is', () => {
    // Plain `className`, and any `*ClassName` variant (rootClassName,
    // overlayClassName, ...), double- or single-quoted.
    expect(findJargonViolations('<div className="docu-query-tier-option" />')).toHaveLength(0)
    expect(findJargonViolations("<Drawer rootClassName='docu-tier-drawer' />")).toHaveLength(0)
    expect(
      findJargonViolations('<Tooltip overlayClassName={`docu-${kind}-tier-tip`} />'),
    ).toHaveLength(0)
    // antd v6's semantic `classNames={{ ... }}` object-literal prop.
    expect(
      findJargonViolations("<Dropdown classNames={{ root: 'docu-query-tier-menu' }} />"),
    ).toHaveLength(0)
    // A real violation right next to a `className` on the same line is
    // still caught — the neutralizer only blanks the attribute's own
    // value, not the rest of the line.
    expect(
      findJargonViolations('<p className="docu-tier-row">Now streaming your answer</p>'),
    ).toHaveLength(1)
  })

  const files = listSourceFiles(SRC_DIR)

  it('found at least one source file to check (the walk itself is not broken)', () => {
    expect(files.length).toBeGreaterThan(30)
  })

  it('excludes the admin-only surface and the data/test-fixture layers', () => {
    expect(files.some((f) => f.startsWith('pages/admin/'))).toBe(false)
    expect(files.some((f) => f.startsWith('components/admin/'))).toBe(false)
    expect(files.some((f) => f.startsWith('api/'))).toBe(false)
    expect(files.some((f) => f.startsWith('mocks/'))).toBe(false)
    expect(files.some((f) => f.startsWith('test/'))).toBe(false)
    expect(files.includes('utils/lifecycle.ts')).toBe(false)
  })

  for (const file of files) {
    it(`${file} has no technical-jargon stem in a string literal, template literal, or JSX text`, () => {
      const source = readFileSync(path.join(SRC_DIR, file), 'utf-8')
      expect(findJargonViolations(source)).toEqual([])
    })
  }
})

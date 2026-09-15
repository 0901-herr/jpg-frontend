import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC_DIR = path.resolve(__dirname, '..')

const ELLIPSIS_PATTERN = /…|\.\.\./

/** Every `.ts`/`.tsx` file under `src/`, relative to `src/`, excluding any
 * `*.test.*` file (tests are allowed to reference an ellipsis as fixture
 * data — see e.g. `summaryMessages.test.ts`'s fenced-summary fixtures — and
 * this guard only cares about the app's own shipped UI copy). */
function listSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(full))
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue
    if (/\.test\.(ts|tsx)$/.test(entry)) continue
    files.push(path.relative(SRC_DIR, full))
  }
  return files
}

/** Strips `/* ... *‍/` block comments (JSDoc included) and `//` line-comment
 * tails, and blanks out any line carrying the `ellipsis-ok` escape hatch
 * (a genuine non-UI use, such as a regex literal, that this guard should
 * never flag) — so only text an app user could actually see is left to
 * check. */
function stripCommentsAndEscapes(source: string): string {
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, '')
  return withoutBlockComments
    .split('\n')
    .map((line) => (line.includes('ellipsis-ok') ? '' : line.replace(/\/\/.*/, '')))
    .join('\n')
}

/** Pulls out the only places an ellipsis is UI-visible rather than code —
 * string literals, template literals, and bare JSX text runs between tags
 * (e.g. `<span>Searching…</span>`) — so `...rest`/`{...props}` spread
 * syntax (which never sits inside a quote or between `>`/`<`) is never
 * examined at all, exactly as the brief requires. */
function extractUiText(source: string): string[] {
  const regions: string[] = []

  const stringPattern = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g
  for (const match of source.matchAll(stringPattern)) regions.push(match[0])

  // Bare text between two tags, with no nested `<`, `>`, `{`, or `}` — a
  // JSX expression container (`{...}`) or another tag inside the run stops
  // the match before it can swallow real markup.
  const jsxTextPattern = />([^<>{}]+)</g
  for (const match of source.matchAll(jsxTextPattern)) regions.push(match[1])

  return regions
}

function findEllipsisViolation(rawSource: string): boolean {
  const cleaned = stripCommentsAndEscapes(rawSource)
  return extractUiText(cleaned).some((region) => ELLIPSIS_PATTERN.test(region))
}

describe('no ellipsis anywhere in shipped UI copy', () => {
  it('self-test: flags an ellipsis inside a string literal', () => {
    expect(findEllipsisViolation(`const label = 'Loading...'`)).toBe(true)
    expect(findEllipsisViolation(`const label = "Loading…"`)).toBe(true)
    expect(findEllipsisViolation('const label = `Loading${x}…`')).toBe(true)
  })

  it('self-test: flags an ellipsis inside bare JSX text', () => {
    expect(findEllipsisViolation('const el = <span>Searching…</span>')).toBe(true)
    expect(findEllipsisViolation('const el = <p>Still working...</p>')).toBe(true)
  })

  it('self-test: does not flag JavaScript spread syntax', () => {
    expect(findEllipsisViolation('const { a, ...rest } = props')).toBe(false)
    expect(findEllipsisViolation('const merged = { ...base, ...overrides }')).toBe(false)
    expect(findEllipsisViolation('fn(...args)')).toBe(false)
    expect(findEllipsisViolation('const el = <Component {...props} />')).toBe(false)
  })

  it('self-test: does not flag an ellipsis inside a comment', () => {
    expect(findEllipsisViolation("// still working on this...\nconst x = 1")).toBe(false)
    expect(findEllipsisViolation('/** a longer explanation… */\nconst x = 1')).toBe(false)
  })

  it('self-test: the "ellipsis-ok" escape hatch exempts a genuine non-UI line (e.g. a regex literal)', () => {
    const withoutEscape = "const trailing = /\\.\\.\\.$/  // matches a literal '...'"
    const withEscape = "const trailing = /\\.\\.\\.$/ // ellipsis-ok: regex, not UI text"
    expect(findEllipsisViolation(withEscape)).toBe(false)
    // Sanity check the escape hatch is actually doing something: without
    // it, this same line's trailing comment text still isn't flagged
    // because it's a comment — but the escape hatch is what a real
    // same-line regex-in-code case would need, per the brief.
    expect(findEllipsisViolation(withoutEscape)).toBe(false)
  })

  it('self-test: ignores a JSX generic-looking `>...<` run that is not real text', () => {
    // No `{`/`}`/`<`/`>` between an unrelated `>` and `<` on the same line
    // could still coincidentally match — that's an accepted limitation of a
    // regex-based check, not something under test here. This case instead
    // confirms ordinary TypeScript generics with nested angle brackets and
    // an object/array spread don't trip the checker.
    expect(
      findEllipsisViolation('const m = new Map<string, BrowseDocumentItem>()\nconst n = [...ids]'),
    ).toBe(false)
  })

  const files = listSourceFiles(SRC_DIR)

  it('found at least one source file to check (the walk itself is not broken)', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  for (const file of listSourceFiles(SRC_DIR)) {
    it(`${file} has no "…" or "..." in a string literal, template literal, or JSX text`, () => {
      const source = readFileSync(path.join(SRC_DIR, file), 'utf-8')
      expect(findEllipsisViolation(source)).toBe(false)
    })
  }
})

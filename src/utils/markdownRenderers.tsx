import {
  Fragment,
  cloneElement,
  createElement,
  isValidElement,
  type JSX,
  type ReactElement,
  type ReactNode,
} from 'react'
import type { Components } from 'react-markdown'
import type { Element, ElementContent, Root } from 'hast'
import type { Plugin } from 'unified'
import {
  citationDisplayLabel,
  citationNumberKey,
  numberCitationsByAnswerOrder,
  splitAnswerByDocRefs,
} from './citations'
import { CitationLink } from '../components/CitationList'
import type { Source } from '../types'

/**
 * Recursively walks a React node tree — as produced by react-markdown's
 * per-element component overrides, before it is ever mounted — and turns
 * any `[DocN]` citation marker inside a text node into a `CitationLink`.
 *
 * Markers can appear nested inside inline formatting (e.g. `**[Doc1]**`
 * bold, or inside a table cell), not just as a paragraph's direct string
 * child, so this recurses into every element's `children` rather than only
 * the outermost node handed to a single component override. Because
 * react-markdown builds the tree top-down, a `<strong>` child seen here is
 * still an unrendered element descriptor (its own component override
 * hasn't run yet), so `cloneElement`-ing it with linkified children is safe
 * — the substitution is in place before React ever mounts it.
 *
 * `numbers` is this message's `numberCitationsByAnswerOrder(content, sources)`
 * map (computed once in `createAnswerMarkdownComponents`, below) — each `CitationLink`
 * gets the stable per-message number for its own `(document_id, page)`
 * rather than renumbering locally per call site, so two pills citing the
 * same page anywhere in the answer always show the same digit. The
 * fallback to `segment.source.index` only guards against a `sources` array
 * that somehow doesn't contain the segment's own source — `numbers` is
 * always built from this same array, so in practice every lookup hits.
 */
function linkifyNode(
  node: ReactNode,
  sources: Source[],
  numbers: Map<string, number>,
  keyPrefix: string,
): ReactNode {
  if (typeof node === 'string') {
    if (!node) return node
    const segments = splitAnswerByDocRefs(node, sources)
    // A single text-only segment usually means nothing changed, so the
    // original node can be returned as-is (fast path, no extra Fragment
    // wrapping). But `splitAnswerByDocRefs` can also strip a bracket group
    // down to nothing without producing any `ref` segment — an
    // unresolvable placeholder like a raw "[DocN]" — in which case the one
    // remaining text segment's value differs from `node` and that
    // stripped value must be what actually renders.
    if (segments.length === 1 && segments[0].type === 'text') {
      return segments[0].value === node ? node : segments[0].value
    }
    return segments.map((segment, i) =>
      segment.type === 'ref' ? (
        <CitationLink
          key={`${keyPrefix}-ref-${i}`}
          source={segment.source}
          label={citationDisplayLabel(segment.source)}
          number={numbers.get(citationNumberKey(segment.source)) ?? segment.source.index}
        />
      ) : (
        <Fragment key={`${keyPrefix}-text-${i}`}>{segment.value}</Fragment>
      ),
    )
  }

  if (Array.isArray(node)) {
    return node.map((child, i) => (
      <Fragment key={`${keyPrefix}-${i}`}>
        {linkifyNode(child, sources, numbers, `${keyPrefix}-${i}`)}
      </Fragment>
    ))
  }

  if (isValidElement(node)) {
    const element = node as ReactElement<{ children?: ReactNode }>
    if (element.props.children == null) return element
    return cloneElement(element, {
      children: linkifyNode(element.props.children, sources, numbers, keyPrefix),
    })
  }

  return node
}

function citationAwareBlock<Tag extends keyof JSX.IntrinsicElements>(
  tag: Tag,
  className: string,
  sources: Source[],
  numbers: Map<string, number>,
  keyPrefix: string,
) {
  return function CitationAwareBlock({ children }: { children?: ReactNode }) {
    return createElement(tag, { className }, linkifyNode(children, sources, numbers, keyPrefix))
  }
}

/** Like `citationAwareBlock`, but skips `linkifyNode` — for tags whose
 * children are always other elements, never raw text, in valid Markdown
 * (a `<ul>`'s children are always `<li>`s, a `<table>`'s always
 * `<thead>`/`<tbody>`, a `<tr>`'s always `<td>`/`<th>`). Because
 * react-markdown builds elements top-down, calling `linkifyNode` here would
 * already walk and linkify every descendant leaf before that leaf's own
 * component override (e.g. `li`, `td`) runs and does the same walk again
 * on its own (already-linkified) children — a harmless no-op the second
 * time, but a needless full re-walk of the subtree for every list/table. */
function plainBlock<Tag extends keyof JSX.IntrinsicElements>(tag: Tag, className: string) {
  return function PlainBlock({ children }: { children?: ReactNode }) {
    return createElement(tag, { className }, children)
  }
}

const PARAGRAPH_SPACING = 'mb-[0.75em] last:mb-0'
const HEADING_CLASS = `font-medium ${PARAGRAPH_SPACING}`
// Bottom margin is NOT included here (unlike PARAGRAPH_SPACING above) — it
// would be dead weight: antd's reset.css sets an unlayered
// `ol, ul, dl { margin-bottom: 1em }`, which always beats this layered
// Tailwind utility regardless of specificity. That spacing lives instead
// in the unlayered `.docu-answer ul`/`.docu-answer ol` rule in
// src/index.css.
const LIST_CLASS = 'pl-5 space-y-1'
// `break-words` + `overflow-wrap: anywhere` so a long unbroken value (an
// extracted metadata field, say) wraps inside its cell instead of forcing
// the whole table — and with it the chat pane — wider. Width, border-collapse,
// padding, and `th`'s bold/background live in the unlayered `.docu-answer
// table` / `.docu-answer th` rules in `src/index.css` instead (see the
// comment there) — this class only carries the per-cell border, alignment,
// and wrapping, none of which any unlayered rule contests.
const CELL_CLASS = 'border border-[#ececec] text-left align-top break-words [overflow-wrap:anywhere]'
// `rounded-lg` (8px) rather than the Tailwind default `rounded` (4px) —
// consistency rule: radii are 8/12/16px only across the app.
const INLINE_CODE_CLASS = 'rounded-lg bg-black/[0.05] px-1 py-0.5 font-mono text-[0.9em]'

/** Builds the react-markdown `components` map for one answer render —
 * `sources` closes over the citations available for this specific message,
 * since `[DocN]` markers only resolve against that message's own sources.
 * `numbers` is computed once here (`numberCitationsByAnswerOrder(content,
 * sources)`) — by *answer order*, i.e. the order citations are first
 * quoted in `content`, not the backend's source-list order — and threaded
 * through every citation-aware block so every inline pill in this answer,
 * however deeply nested, numbers consistently and starts back at 1 for
 * every new message — see `linkifyNode`. */
export function createAnswerMarkdownComponents(content: string, sources: Source[]): Components {
  const numbers = numberCitationsByAnswerOrder(content, sources)
  return {
    p: citationAwareBlock('p', PARAGRAPH_SPACING, sources, numbers, 'p'),
    // Headings demoted to bold text — an LLM answer has no document
    // structure of its own to justify a heading's visual weight inside a
    // chat bubble.
    h1: citationAwareBlock('p', HEADING_CLASS, sources, numbers, 'h1'),
    h2: citationAwareBlock('p', HEADING_CLASS, sources, numbers, 'h2'),
    h3: citationAwareBlock('p', HEADING_CLASS, sources, numbers, 'h3'),
    h4: citationAwareBlock('p', HEADING_CLASS, sources, numbers, 'h4'),
    h5: citationAwareBlock('p', HEADING_CLASS, sources, numbers, 'h5'),
    h6: citationAwareBlock('p', HEADING_CLASS, sources, numbers, 'h6'),
    ul: plainBlock('ul', `list-disc ${LIST_CLASS}`),
    ol: plainBlock('ol', `list-decimal ${LIST_CLASS}`),
    li: citationAwareBlock('li', 'leading-relaxed', sources, numbers, 'li'),
    blockquote: citationAwareBlock(
      'blockquote',
      `border-l-2 border-[#ececec] pl-3 text-[#6b6b6b] ${PARAGRAPH_SPACING}`,
      sources,
      numbers,
      'bq',
    ),
    // A wide table (the metadata extraction table, especially) must scroll inside
    // its own box, never the whole chat pane — the wrapper carries the
    // overflow; the `<table>` itself picks up width/border-collapse from
    // the unlayered `.docu-answer table` rule (src/index.css).
    table: ({ children }) => (
      <div className={`max-w-full overflow-x-auto ${PARAGRAPH_SPACING}`}>
        <table className="text-sm">{children}</table>
      </div>
    ),
    thead: plainBlock('thead', ''),
    tbody: plainBlock('tbody', ''),
    tr: plainBlock('tr', ''),
    th: citationAwareBlock('th', CELL_CLASS, sources, numbers, 'th'),
    td: citationAwareBlock('td', CELL_CLASS, sources, numbers, 'td'),
    // `className` is honored when supplied (by the `pre` override below,
    // via `cloneElement`) and otherwise defaults to the inline-code chip
    // style — a component element isn't executed until React actually
    // renders it, so `pre` cloning this element with a new `className`
    // prop only has any effect because this function reads that prop
    // instead of always hard-coding its own classes.
    code: ({ className, children }: { className?: string; children?: ReactNode }) => (
      <code className={className ?? INLINE_CODE_CLASS}>{children}</code>
    ),
    // Fenced code blocks default to `white-space: pre`, which — unlike
    // inline `code` — can force the whole chat pane to scroll sideways on a
    // long line. `pre-wrap` + `break-words` keep it wrapped inside the
    // bubble instead. `children` here is the (not-yet-rendered) `code`
    // element the override above will produce — react-markdown always
    // nests fenced code as `<pre><code>` — re-styled via `cloneElement`
    // with a plain `className` so it doesn't fall back to the inline
    // chip's own padding/background doubled up inside `pre`'s.
    pre: ({ children }) => {
      // `children` may arrive as a bare element or as a single-item array
      // depending on the tree shape, so both are handled the same way.
      const childArray = Array.isArray(children) ? children : [children]
      const content = childArray.map((child, i) =>
        isValidElement<{ className?: string }>(child)
          ? cloneElement(child, { className: 'font-mono', key: child.key ?? i })
          : child,
      )
      return (
        <pre className="whitespace-pre-wrap break-words rounded-lg bg-black/[0.05] p-3 text-[0.9em] font-mono">
          {content}
        </pre>
      )
    },
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-[#c8c8c8] underline-offset-2 hover:decoration-[#6b6b6b]"
      >
        {linkifyNode(children, sources, numbers, 'a')}
      </a>
    ),
  }
}

// Tags whose own last element child may still be *structural* (a list still
// has more items, a table still has more rows) rather than the actual
// content-bearing leaf we want to append into — so the search descends
// through these looking for the real last leaf, and stops at anything else
// (p, li, td, h1..h6, or an inline tag) and appends there directly.
const STREAMING_TAIL_CONTAINER_TAGS = new Set([
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'blockquote',
])

type HastParent = Root | Element

/** Finds the block that a streaming preview/cursor should be appended
 * into: the last real content leaf (`<p>`, `<li>`, `<td>`, a heading, …) in
 * the tree, descending through purely structural wrappers (`<ul>`, `<table>`
 * rows, …) but never into inline formatting (`<strong>`, citation links,
 * …) so the tail is always a direct, appended child of the surrounding
 * block rather than nested inside unrelated inline markup. */
function findStreamingTailTarget(node: HastParent): HastParent {
  const children = node.children
  const last = children[children.length - 1]
  if (!last || last.type !== 'element') return node

  const isContainer = node.type === 'root' || STREAMING_TAIL_CONTAINER_TAGS.has(node.tagName)
  if (!isContainer) return node

  return STREAMING_TAIL_CONTAINER_TAGS.has(last.tagName)
    ? findStreamingTailTarget(last)
    : last
}

function streamingTailSpan(
  className: string,
  children: ElementContent[],
  properties?: Record<string, unknown>,
): Element {
  return {
    type: 'element',
    tagName: 'span',
    properties: { className: className.split(' '), ...properties },
    children,
  }
}

/**
 * A rehype plugin (see `MarkdownAnswer`) that appends the live-typing
 * preview text and the blinking cursor as trailing inline children of the
 * *last* rendered block, instead of as siblings of the whole Markdown tree.
 * `<p>`/`<li>`/etc. are `display: block`, so a plain sibling after the
 * whole tree always starts on its own line the moment any content has
 * finalized into a block; nesting the preview/cursor inside that same
 * block keeps them flowing on the same line while the answer streams in.
 *
 * `liveText` is inserted as a literal hast text node — never parsed as
 * Markdown — so it stays exactly what it always was: an unattributed,
 * pre-wrapped preview of in-flight tokens, not a citation-attributed,
 * block-structured segment.
 */
export function createStreamingTailPlugin(liveText: string): Plugin<[], Root> {
  return () => (tree: Root) => {
    const target = findStreamingTailTarget(tree)
    const tail: ElementContent[] = []
    if (liveText) {
      tail.push(
        streamingTailSpan('opacity-60 whitespace-pre-wrap break-words', [
          { type: 'text', value: liveText },
        ]),
      )
    }
    tail.push(
      streamingTailSpan(
        'inline-block w-1.5 h-4 ml-0.5 bg-zinc-400 animate-pulse align-middle rounded-sm',
        [],
        { 'data-testid': 'streaming-cursor' },
      ),
    )
    ;(target.children as ElementContent[]).push(...tail)
  }
}

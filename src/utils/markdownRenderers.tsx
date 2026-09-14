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
import { citationDisplayLabel, splitAnswerByDocRefs } from './citations'
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
 */
function linkifyNode(node: ReactNode, sources: Source[], keyPrefix: string): ReactNode {
  if (typeof node === 'string') {
    if (!node) return node
    const segments = splitAnswerByDocRefs(node, sources)
    if (segments.length === 1 && segments[0].type === 'text') return node
    return segments.map((segment, i) =>
      segment.type === 'ref' ? (
        <CitationLink
          key={`${keyPrefix}-ref-${i}`}
          source={segment.source}
          label={citationDisplayLabel(segment.source)}
        />
      ) : (
        <Fragment key={`${keyPrefix}-text-${i}`}>{segment.value}</Fragment>
      ),
    )
  }

  if (Array.isArray(node)) {
    return node.map((child, i) => (
      <Fragment key={`${keyPrefix}-${i}`}>{linkifyNode(child, sources, `${keyPrefix}-${i}`)}</Fragment>
    ))
  }

  if (isValidElement(node)) {
    const element = node as ReactElement<{ children?: ReactNode }>
    if (element.props.children == null) return element
    return cloneElement(element, {
      children: linkifyNode(element.props.children, sources, keyPrefix),
    })
  }

  return node
}

function citationAwareBlock<Tag extends keyof JSX.IntrinsicElements>(
  tag: Tag,
  className: string,
  sources: Source[],
  keyPrefix: string,
) {
  return function CitationAwareBlock({ children }: { children?: ReactNode }) {
    return createElement(tag, { className }, linkifyNode(children, sources, keyPrefix))
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
const LIST_CLASS = `${PARAGRAPH_SPACING} pl-5 space-y-1`
// `break-words` + `overflow-wrap: anywhere` so a long unbroken value (an
// MQA metadata field, say) wraps inside its cell instead of forcing the
// whole table — and with it the chat pane — wider.
const CELL_CLASS = 'border border-[#ececec] px-2 py-1 text-left align-top break-words [overflow-wrap:anywhere]'

/** Builds the react-markdown `components` map for one answer render —
 * `sources` closes over the citations available for this specific message,
 * since `[DocN]` markers only resolve against that message's own sources. */
export function createAnswerMarkdownComponents(sources: Source[]): Components {
  return {
    p: citationAwareBlock('p', PARAGRAPH_SPACING, sources, 'p'),
    // Headings demoted to bold text — an LLM answer has no document
    // structure of its own to justify a heading's visual weight inside a
    // chat bubble.
    h1: citationAwareBlock('p', HEADING_CLASS, sources, 'h1'),
    h2: citationAwareBlock('p', HEADING_CLASS, sources, 'h2'),
    h3: citationAwareBlock('p', HEADING_CLASS, sources, 'h3'),
    h4: citationAwareBlock('p', HEADING_CLASS, sources, 'h4'),
    h5: citationAwareBlock('p', HEADING_CLASS, sources, 'h5'),
    h6: citationAwareBlock('p', HEADING_CLASS, sources, 'h6'),
    ul: plainBlock('ul', `list-disc ${LIST_CLASS}`),
    ol: plainBlock('ol', `list-decimal ${LIST_CLASS}`),
    li: citationAwareBlock('li', 'leading-relaxed', sources, 'li'),
    blockquote: citationAwareBlock(
      'blockquote',
      `border-l-2 border-[#ececec] pl-3 text-[#676767] ${PARAGRAPH_SPACING}`,
      sources,
      'bq',
    ),
    // A wide table (the MQA metadata table, especially) must scroll inside
    // its own box, never the whole chat pane — the wrapper carries the
    // overflow, the `<table>` itself keeps its existing sizing.
    table: ({ children }) => (
      <div className={`max-w-full overflow-x-auto ${PARAGRAPH_SPACING}`}>
        <table className="border-collapse border border-[#ececec] w-full text-sm">
          {children}
        </table>
      </div>
    ),
    thead: plainBlock('thead', ''),
    tbody: plainBlock('tbody', ''),
    tr: plainBlock('tr', ''),
    th: citationAwareBlock('th', `${CELL_CLASS} font-medium`, sources, 'th'),
    td: citationAwareBlock('td', CELL_CLASS, sources, 'td'),
    code: ({ children }) => (
      <code className="rounded bg-black/[0.05] px-1 py-0.5 font-mono text-[0.9em]">
        {children}
      </code>
    ),
    // Fenced code blocks default to `white-space: pre`, which — unlike
    // inline `code` — can force the whole chat pane to scroll sideways on a
    // long line. `pre-wrap` + `break-words` keep it wrapped inside the
    // bubble instead; the nested `code` element above still renders inside
    // it (a small amount of doubled padding/background, not worth a second
    // code path just to avoid).
    pre: ({ children }) => (
      <pre className="whitespace-pre-wrap break-words rounded bg-black/[0.05] p-3 text-[0.9em] font-mono">
        {children}
      </pre>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-[#c8c8c8] underline-offset-2 hover:decoration-[#676767]"
      >
        {linkifyNode(children, sources, 'a')}
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

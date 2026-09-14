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
const CELL_CLASS = 'border border-[#ececec] px-2 py-1 text-left align-top'

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
    table: plainBlock('table', `border-collapse border border-[#ececec] w-full text-sm ${PARAGRAPH_SPACING}`),
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

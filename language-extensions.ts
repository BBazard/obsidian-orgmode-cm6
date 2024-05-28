import { HighlightStyle, foldService, syntaxTree } from "@codemirror/language"
import { EditorState } from "@codemirror/state";
import { tags } from "@lezer/highlight"

import { TOKEN } from 'codemirror-lang-orgmode';

export const myHighlightStyle = HighlightStyle.define([
  // Heading
  { tag: tags.heading, class: "org-heading" },
  // Title
  { tag: tags.contentSeparator, class: "org-title org-heading" },
  // Planning
  { tag: tags.annotation, class: "org-planning" },
  // PropertyDrawer
  { tag: tags.meta, class: "org-propertydrawer" },
  // Section/ZerothSection
  { tag: tags.content, class: "org-section" },
  // CommentLine
  { tag: tags.lineComment, class: "org-comment" },
  // TodoKeyword
  { tag: tags.keyword, class: "org-keyword" },
  // Priority
  { tag: tags.unit, class: "org-priority org-heading" },
  // Tags
  { tag: tags.tagName, class: "org-tags org-heading" },
  // TextBold
  { tag: tags.strong, class: "org-text-bold org-section" },
  // TextItalic
  { tag: tags.emphasis, class: "org-text-italic org-section" },
  // TextUnderline
  { tag: tags.modifier, class: "org-text-underline org-section" },
  // TextVerbatim
  { tag: tags.literal, class: "org-text-verbatim org-section" },
  // TextCode
  { tag: tags.monospace, class: "org-text-code org-section" },
  // TextStrikeThrough
  { tag: tags.strikethrough, class: "org-text-strikethrough org-section" },
  // Link
  { tag: tags.link, class: "org-link org-section" },
]);

export const OrgFoldCompute = (state: EditorState, from: number, to: number) => {
  let currentLineNode = syntaxTree(state).topNode.resolve(from, 1).node
  if (currentLineNode.type.id !== TOKEN.Heading) {
    return null
  }
  const heading = currentLineNode
  const hasSection = currentLineNode.getChild(TOKEN.Section)
  const hasHeading = currentLineNode.getChild(TOKEN.Heading)
  let block_to = null
  if (hasSection || hasHeading) {
    block_to = heading.to
  }
  if (state.doc.sliceString(block_to-1, block_to) === '\n') {
    block_to = block_to - 1
  }
  if (block_to) {
    return { from: to, to: block_to };
  }
  return null
}

export const makeHeadingsFoldable = foldService.of(OrgFoldCompute);
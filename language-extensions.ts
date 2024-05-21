import { HighlightStyle, foldService, syntaxTree } from "@codemirror/language"
import { EditorState } from "@codemirror/state";
import { tags } from "@lezer/highlight"

import { TOKEN } from 'codemirror-lang-orgmode';

export const myHighlightStyle = HighlightStyle.define([
  // Heading
  { tag: tags.heading, class: "org-heading" },
  // Title
  { tag: tags.contentSeparator, class: "org-title" },
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
  { tag: tags.unit, class: "org-priority" },
  // Tags
  { tag: tags.tagName, class: "org-tags" },
  // TextBold
  { tag: tags.strong, class: "org-text-bold" },
  // TextItalic
  { tag: tags.emphasis, class: "org-text-italic" },
  // TextUnderline
  { tag: tags.modifier, class: "org-text-underline" },
  // TextVerbatim
  { tag: tags.literal, class: "org-text-verbatim" },
  // TextCode
  { tag: tags.monospace, class: "org-text-code" },
  // TextStrikeThrough
  { tag: tags.strikethrough, class: "org-text-strikethrough" },
]);

export const OrgFoldCompute = (state: EditorState, from: number, to: number) => {
  let currentLineNode = syntaxTree(state).topNode.resolve(from, 1).node
  if (currentLineNode.type.id !== TOKEN.Heading) {
    return null
  }
  const heading = currentLineNode
  const heading_level = state.doc.sliceString(heading.from, heading.to).match(/^\*+/g)[0].length
  let next = currentLineNode.nextSibling
  let block_to = null
  if (next !== null && next.type.id === TOKEN.Section) {
    const section = next
    block_to = section.to
  }
  while (true) {
    if (next !== null && next.type.id === TOKEN.Heading) {
      const current_heading = next
      const current_heading_level = state.doc.sliceString(current_heading.from, current_heading.to).match(/^\*+/g)[0].length
      if (current_heading_level <= heading_level) {
        break
      }
      block_to = current_heading.to
      next = current_heading.nextSibling
      if (next !== null && next.type.id === TOKEN.Section) {
        const section = next
        block_to = section.to
        next = next.nextSibling
      }
    } else if (next !== null && next.type.id == TOKEN.Section) {
      next = next.nextSibling
    } else {
      break
    }
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
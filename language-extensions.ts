import { HighlightStyle, foldService, syntaxTree } from "@codemirror/language"
import { EditorState } from "@codemirror/state";
import { SyntaxNodeRef, SyntaxNode } from "@lezer/common"
import { tags } from "@lezer/highlight"
import { LRParser } from "@lezer/lr";

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

export const markupNodeTypeIds = [
  TOKEN.TextBold,
  TOKEN.TextItalic,
  TOKEN.TextUnderline,
  TOKEN.TextVerbatim,
  TOKEN.TextCode,
  TOKEN.TextStrikeThrough,
]

export function markupClass(node_type_id: number): string {
  if (node_type_id === TOKEN.TextBold) {
    return "org-text-bold"
  } else if (node_type_id === TOKEN.TextItalic) {
    return "org-text-italic"
  } else if (node_type_id === TOKEN.TextUnderline) {
    return "org-text-underline"
  } else if (node_type_id === TOKEN.TextVerbatim) {
    return "org-text-verbatim"
  } else if (node_type_id === TOKEN.TextCode) {
    return "org-text-code"
  } else if (node_type_id === TOKEN.TextStrikeThrough) {
    return "org-text-strikethrough"
  }
  throw Error("Not a markup node")
}

export function injectMarkupInLinktext(linkNode: SyntaxNodeRef, displayText: string, state: EditorState, displayTextFromOffset: number) {
  const nodesToReplace: [number, number, string, string][] = []
  let child = linkNode.node.firstChild
  while (child && markupNodeTypeIds.includes(child.type.id)) {
    const childText = state.doc.sliceString(child.from+1, child.to-1)
    const markup_class = markupClass(child.node.type.id)
    nodesToReplace.push([child.from, child.to, childText, markup_class])
    child = child.nextSibling
  }
  const displayTextStart = linkNode.from + displayTextFromOffset
  let idx = 0
  let displayTextHtml = ""
  for (let i = 0; i < nodesToReplace.length; i++) {
    const [child_from, child_to, child_text, markup_class] = nodesToReplace[i]
    displayTextHtml += (
      displayText.slice(idx, child_from - displayTextStart) +
      `<span class=${markup_class}>` + child_text + "</span>"
    )
    idx = child_to - displayTextStart
  }
  displayTextHtml += displayText.slice(idx)
  return displayTextHtml
}

export const OrgFoldCompute = (state: EditorState, from: number, to: number) => {
  let currentLineNode = syntaxTree(state).topNode.resolve(from, 1).node
  const onFirstLine = (state.doc.lineAt(from).number === state.doc.lineAt(currentLineNode.from).number)
  if (currentLineNode.type.id === TOKEN.Heading) {
    const heading = currentLineNode
    const hasSection = currentLineNode.getChild(TOKEN.Section)
    const hasHeading = currentLineNode.getChild(TOKEN.Heading)
    if (!hasSection && !hasHeading) {
      return null
    }
    let block_to = heading.to
    if (state.doc.sliceString(block_to-1, block_to) === '\n') {
      block_to = block_to - 1
    }
    return { from: to, to: block_to };
  } else if (currentLineNode.type.id === TOKEN.PropertyDrawer) {
    if (!onFirstLine) {
      return null
    }
    const propertyDrawer = currentLineNode
    let block_to = propertyDrawer.to
    if (state.doc.sliceString(block_to-1, block_to) === '\n') {
      block_to = block_to - 1
    }
    return { from: to, to: block_to };
  }
  return null
}

export const makeHeadingsFoldable = foldService.of(OrgFoldCompute);

function linkIsImage(linkText: string) {
  if (!linkText.includes(".")) {
    return false
  }
  const ext = linkText.slice(linkText.lastIndexOf("."))
  const imageExtensions = ['.apng', '.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']
  return imageExtensions.includes(ext)
}

export type LinkHandler = "external" | "internal-file" | "internal-inline-image" | "internal-id"

function parseLinkText(linkText: string): [string, LinkHandler] {
  const idx = linkText.indexOf(':')
  let linkPath = null
  let linkHandler: LinkHandler = null
  let linkType = null
  if (idx === -1) {  // case 'PATHINNER'
    linkHandler = "internal-file"
    linkPath = linkText
  } else if (/:\/\//.test(linkText)) {  // case 'LINKTYPE://PATHINNER'
    linkPath = linkText
    linkHandler = "external"
  } else {  // case 'LINKTYPE:PATHINNER'
    linkType = linkText.slice(0, idx)
    linkPath = linkText.slice(idx+1)
    if (linkType === 'file') {
      linkHandler = "internal-file"
    } else if (linkType === 'id') {
      linkHandler = "internal-id"
    } else {
      // not handled
      linkHandler = "internal-file"
    }
  }
  return [linkPath, linkHandler]
}

export const extractLinkFromNode = (node: number, linkText: string): [string, string, LinkHandler, number] => {
  let linkHandler: LinkHandler = null
  let linkPath = null
  let displayText = null
  let hasLinkDescription = false
  let displayTextFromOffset = null
  let displayTextToOffset = null
  if (node === TOKEN.PlainLink) {
    linkPath = linkText
    displayTextFromOffset = 0
    displayTextToOffset = 0
    linkHandler = "external"
    let [linkPathDetected, linkHandlerDetected] = parseLinkText(linkText)
    if (linkHandlerDetected == "internal-id") {
      linkHandler = "internal-id"
      linkPath = linkPathDetected
    }
  } else if (node === TOKEN.RegularLink) {
    let innerLinkText
    if (/\]\[/.test(linkText)) {
      const idx = linkText.search(/\]\[/)
      innerLinkText = linkText.slice(2, idx)
      displayTextFromOffset = idx + 2
      displayTextToOffset = -2
      hasLinkDescription = true
    } else {
      innerLinkText = linkText.slice(2, -2)
      displayTextFromOffset = 2
      displayTextToOffset = -2
    }
    [linkPath, linkHandler] = parseLinkText(innerLinkText)
  } else if (node === TOKEN.AngleLink) {
    [linkPath, linkHandler] = parseLinkText(linkText.slice(1, -1))
    displayTextFromOffset = 1
    displayTextToOffset = -1
  }
  if (linkHandler === "internal-file" && linkIsImage(linkPath) && !hasLinkDescription) {
    linkHandler = "internal-inline-image"
    displayTextFromOffset = null
    displayTextToOffset = null
  }
  if (displayTextFromOffset !== null) {
    displayText = linkText.slice(displayTextFromOffset, linkText.length+displayTextToOffset)
  }
  return [linkPath, displayText, linkHandler, displayTextFromOffset]
}

function* iterateHeadings(node: SyntaxNode): Iterable<SyntaxNode> {
  const headings = node.getChildren(TOKEN.Heading)
  for (const heading of headings) {
    yield heading
    yield* iterateHeadings(heading)
  }
}

export function* iterateOrgIds(orgmodeParser: LRParser, orgContent: string) {
  const tree = orgmodeParser.parse(orgContent)
  const id_regex = /:ID:\s+([^\s]+)\s*/  // TODO: to replace by a grammar token?
  const topPropertyDrawer = tree.topNode.getChild(TOKEN.ZerothSection)?.getChild(TOKEN.PropertyDrawer)
  if (topPropertyDrawer) {
    const top_pd_content = orgContent.slice(topPropertyDrawer.from, topPropertyDrawer.to)
    const match_file = id_regex.exec(top_pd_content)
    if (match_file) {
      const extracted_id = match_file[1]
      yield {orgId: extracted_id, start: 0}
    }
  }
  for (const heading of iterateHeadings(tree.topNode)) {
    const propertyDrawer = heading.node.getChild(TOKEN.Section)?.getChild(TOKEN.PropertyDrawer)
    if (!propertyDrawer) {
      continue
    }
    const heading_start = heading.from
    const pd_content = orgContent.slice(propertyDrawer.from, propertyDrawer.to)
    const match_heading = id_regex.exec(pd_content)
    if (match_heading) {
      const extracted_id = match_heading[1]
      yield {orgId: extracted_id, start: heading_start}
    }
  }
}
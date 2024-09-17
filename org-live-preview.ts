import {
  Extension,
  StateField,
  Transaction,
  RangeSetBuilder,
  EditorState,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { TOKEN } from 'codemirror-lang-orgmode';
import { extractLinkFromNode, nodeTypeClass } from 'language-extensions';
import { OrgmodePluginSettings } from "settings";

class ImageWidget extends WidgetType {
  path: string
  getImageUri: (linkPath: string) => string
  constructor(path: string, getImageUri: (linkPath: string) => string) {
    super()
    this.path = path
    this.getImageUri = getImageUri
  }
  eq(other: ImageWidget) {
    return this.path == other.path
  }
  toDOM(view: EditorView): HTMLElement {
    const image = document.createElement("img");
    const obsidianPath = this.getImageUri(this.path)
    if (obsidianPath) {
      image.src = this.getImageUri(this.path)
    } else {
      image.src = this.path
    }
    return image
  }
}

function isNodeSelected(selection: {from: number, to: number}, node: {from: number, to: number}) {
  return (
      // selection starts inside node
      (selection.from >= node.from && selection.from <= node.to) ||
      // selection ends inside node
      (selection.to >= node.from && selection.to <= node.to) ||
      // selection is bigger than node
      (selection.from < node.from && selection.to > node.to))
}

function loadDecorations(
  state: EditorState,
  settings: OrgmodePluginSettings,
  obsidianUtils: {
    navigateToFile: (filePath: string) => void,
    getImageUri: (linkPath: string) => string,
    navigateToOrgId: (orgCustomId: string) => void,
}) {
  const builderBuffer = new Array<[number, number, Decoration]>
  const selectionPos = state.selection.main
  syntaxTree(state).iterate({
    enter(node) {
      const nodeIsSelected = isNodeSelected(selectionPos, node)
      if (node.type.id === TOKEN.Block) {
        const firstLine = state.doc.lineAt(node.from)
        const lastLine = state.doc.lineAt(node.to-1)
        for (let i = firstLine.number; i <= lastLine.number; ++i) {
          const line = state.doc.line(i)
          builderBuffer.push([line.from, line.from, Decoration.line({class: nodeTypeClass(node.type.id)})])
        }
        const firstLineIsSelected = isNodeSelected(selectionPos, firstLine)
        if (!firstLineIsSelected) {
          builderBuffer.push([firstLine.from, firstLine.from+"#+BEGIN_".length, Decoration.replace({})])
          builderBuffer.push([firstLine.from+"#+BEGIN_".length, firstLine.to, Decoration.mark({class: "org-block-header"})])
        }
        const lastLineIsSelected = isNodeSelected(selectionPos, lastLine)
        if (!lastLineIsSelected) {
          builderBuffer.push([lastLine.from, lastLine.to, Decoration.replace({})])
        }
      } else if (
        node.type.id === TOKEN.PlainLink ||
        node.type.id === TOKEN.RegularLink ||
        node.type.id === TOKEN.AngleLink
      ) {
        const linkText = state.doc.sliceString(node.from, node.to)
        const [linkPath, displayText, linkHandler, displayTextFromOffset] = extractLinkFromNode(node.type.id, linkText)
        if (linkHandler === "internal-inline-image") {
          if (nodeIsSelected) {
            builderBuffer.push([node.from, node.to, Decoration.mark({class: nodeTypeClass(node.type.id)})])
            builderBuffer.push([
              node.to,
              node.to,
              Decoration.widget({
                widget: new ImageWidget(linkPath, obsidianUtils.getImageUri),
                block: true,
              })
            ])
          } else {
            builderBuffer.push([
              node.from,
              node.to,
              Decoration.replace({
                widget: new ImageWidget(linkPath, obsidianUtils.getImageUri),
              })
            ])
          }
        } else if (!nodeIsSelected) {
          if (node.type.id === TOKEN.RegularLink && linkPath !== displayText) {
            builderBuffer.push([node.from, node.from+displayTextFromOffset, Decoration.replace({})])
            builderBuffer.push([
              node.from+displayTextFromOffset, node.to-2,
              Decoration.mark({tagName: "a", attributes: { href: "#" }}),
            ])
            builderBuffer.push([node.to-2, node.to, Decoration.replace({})])
          } else if (node.type.id === TOKEN.RegularLink) {
            builderBuffer.push([node.from, node.from+2, Decoration.replace({})])
            builderBuffer.push([
              node.from+2, node.to-2,
              Decoration.mark({tagName: "a", attributes: { href: "#" }}),
            ])
            builderBuffer.push([node.to-2, node.to, Decoration.replace({})])
          } else if (node.type.id === TOKEN.AngleLink) {
            builderBuffer.push([node.from, node.from+1, Decoration.replace({})])
            builderBuffer.push([
              node.from+1, node.to-1,
              Decoration.mark({tagName: "a", attributes: { href: "#" }}),
            ])
            builderBuffer.push([node.to-1, node.to, Decoration.replace({})])
          }
        } else {
          builderBuffer.push([node.from, node.to, Decoration.mark({class: nodeTypeClass(node.type.id)})])
        }
      } else if (
        node.type.id === TOKEN.TextBold ||
        node.type.id === TOKEN.TextItalic ||
        node.type.id === TOKEN.TextUnderline ||
        node.type.id === TOKEN.TextVerbatim ||
        node.type.id === TOKEN.TextCode ||
        node.type.id === TOKEN.TextStrikeThrough
      ) {
        if (!nodeIsSelected) {
          builderBuffer.push([node.from, node.from+1, Decoration.replace({})])
        }
        builderBuffer.push([node.from, node.to, Decoration.mark({class: nodeTypeClass(node.type.id)})])
        if (!nodeIsSelected) {
          builderBuffer.push([node.to-1, node.to, Decoration.replace({})])
        }
      } else if (node.type.id === TOKEN.Heading) {
        const headingLine = state.doc.lineAt(node.from)
        const headingLevel = headingLine.text.match(/^\*+/)[0].length
        const headingClass = nodeTypeClass(node.type.id)
        const starsPos = {from: headingLine.from, to: headingLine.from+headingLevel+1}
        const nodeStarsIsSelected = isNodeSelected(selectionPos, starsPos)
        if (settings.hideStars && !nodeStarsIsSelected) {
          builderBuffer.push([headingLine.from, headingLine.from+headingLevel+1, Decoration.replace({})])
          builderBuffer.push([headingLine.from, headingLine.to, Decoration.mark({
            class: `${headingClass} ${headingClass}-${headingLevel}`
          })])
        } else {
          builderBuffer.push([headingLine.from, headingLine.to, Decoration.mark({
            class: `${headingClass} ${headingClass}-${headingLevel}`
          })])
        }
        const section = node.node.getChild(TOKEN.Section)
        if (section) {
          builderBuffer.push([section.from, section.to, Decoration.mark({
            class: `${headingClass}-${headingLevel}`
          })])
        }
      } else if (
        node.type.id === TOKEN.Title ||
        node.type.id === TOKEN.PlanningDeadline ||
        node.type.id === TOKEN.PlanningScheduled ||
        node.type.id === TOKEN.PlanningClosed ||
        node.type.id === TOKEN.PropertyDrawer ||
        node.type.id === TOKEN.ZerothSection ||
        node.type.id === TOKEN.Section ||
        node.type.id === TOKEN.CommentLine ||
        node.type.id === TOKEN.KeywordComment ||
        node.type.id === TOKEN.TodoKeyword ||
        node.type.id === TOKEN.Priority ||
        node.type.id === TOKEN.Tags
      ) {
        builderBuffer.push([node.from, node.to, Decoration.mark({class: nodeTypeClass(node.type.id)})])
      }
    },
  })
  builderBuffer.sort(([from, to, x], [from2, to2, x2]) => from - from2)
  const builder = new RangeSetBuilder<Decoration>();
  for (const [from, to, decoration] of builderBuffer) {
    builder.add(from, to, decoration)
  }
  return builder.finish();
}

export const orgmodeLivePreview = (
  codeMirror: EditorView,
  settings: OrgmodePluginSettings,
  obsidianUtils: {
    navigateToFile: (filePath: string) => void,
    getImageUri: (linkPath: string) => string,
    navigateToOrgId: (orgCustomId: string) => void,
}) => {
  return StateField.define<DecorationSet>({
    create(state: EditorState): DecorationSet {
      return loadDecorations(state, settings, obsidianUtils)
    },
    update(oldState: DecorationSet, transaction: Transaction): DecorationSet {
      return loadDecorations(transaction.state, settings, obsidianUtils)
    },
    provide(field: StateField<DecorationSet>): Extension {
      return [
        EditorView.decorations.from(field),
        EditorView.domEventHandlers({
          mousedown: (e: MouseEvent) => {
            const clickPos = codeMirror.posAtCoords(e)
            const state = codeMirror.state
            let nodeIterator = syntaxTree(state).resolveStack(clickPos)
            let linkNode = null
            while (nodeIterator) {
              if (
                nodeIterator.node.type.id === TOKEN.RegularLink ||
                nodeIterator.node.type.id === TOKEN.AngleLink ||
                nodeIterator.node.type.id === TOKEN.PlainLink
              ) {
                linkNode = nodeIterator.node
                break
              }
              nodeIterator = nodeIterator.next
            }
            if (!linkNode) {
              return
            }
            const linkText = state.doc.sliceString(linkNode.from, linkNode.to)
            const [linkPath, displayText, linkHandler, displayTextFromOffset] = extractLinkFromNode(linkNode.type.id, linkText)
            const orgmodeDecorationSet = state.field(field)
            orgmodeDecorationSet.between(clickPos, clickPos, (from, to, deco) => {
              if (deco.spec.tagName === "a") {
                if (linkHandler === "external") {
                  window.open(linkPath)
                } else if (linkHandler === "internal-file") {
                  obsidianUtils.navigateToFile(linkPath)
                } else if (linkHandler === "internal-id") {
                  const orgCustomId = linkPath
                  obsidianUtils.navigateToOrgId(orgCustomId)
                }
                return false
              }
            })
          }
        }),
      ]
    },
  });
}

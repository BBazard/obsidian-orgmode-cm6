import {
  Extension,
  StateField,
  Transaction,
  RangeSetBuilder,
  EditorState
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { TOKEN } from 'codemirror-lang-orgmode';
import { LinkHandler, extractLinkFromNode, injectMarkupInLinktext, markupClass, markupNodeTypeIds } from 'language-extensions';

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

class LinkWidget extends WidgetType {
  linkPath: string
  displayHtml: string
  linkHandler: LinkHandler
  navigateToFile: (filePath: string) => void
  navigateToOrgId: (orgCustomId: string) => void
  classes: string[]
  constructor(
    linkPath: string,
    displayHtml: string,
    linkHandler: LinkHandler,
    navigateToFile: (filePath: string) => void,
    navigateToOrgId: (orgCustomId: string) => void,
    classes: string[]
  ) {
    super()
    this.linkPath = linkPath
    this.displayHtml = displayHtml
    this.linkHandler = linkHandler
    this.navigateToFile = navigateToFile
    this.navigateToOrgId = navigateToOrgId
    this.classes = classes
  }
  eq(other: LinkWidget) {
    return (
      this.linkPath == other.linkPath &&
      this.displayHtml == other.displayHtml &&
      this.linkHandler == other.linkHandler &&
      JSON.stringify(this.classes.sort()) == JSON.stringify(other.classes.sort())
    )
  }
  toDOM(view: EditorView): HTMLElement {
    const link = document.createElement("a");
    link.innerHTML = this.displayHtml
    link.href = "#"
    link.addClasses(this.classes)
    link.addEventListener("click", () => {
      if (this.linkHandler === "external") {
        window.open(this.linkPath)
      } else if (this.linkHandler === "internal-file") {
        this.navigateToFile(this.linkPath)
      } else if (this.linkHandler === "internal-id") {
        const orgCustomId = this.linkPath
        this.navigateToOrgId(orgCustomId)
      }
    })
    return link
  }
}

function loadDecorations(
  state: EditorState,
  obsidianUtils: {
    navigateToFile: (filePath: string) => void,
    getImageUri: (linkPath: string) => string,
    navigateToOrgId: (orgCustomId: string) => void,
}) {
  const builderBuffer = new Array<[number, number, Decoration]>
  const cursorPos = state.selection.main.head
  syntaxTree(state).iterate({
    enter(node) {
      const isCursorInsideDecoration = (cursorPos >= node.from && cursorPos <= node.to)
      if (node.type.id === TOKEN.Block) {
        const firstLine = state.doc.lineAt(node.from)
        const lastLine = state.doc.lineAt(node.to-1)
        for (let i = firstLine.number; i <= lastLine.number; ++i) {
          const line = state.doc.line(i)
          builderBuffer.push([line.from, line.from, Decoration.line({class: 'org-block'})])
        }
        builderBuffer.push([firstLine.from, firstLine.from, Decoration.line({class: 'org-block-begin'})])
        builderBuffer.push([lastLine.from, lastLine.from, Decoration.line({class: 'org-block-end'})])
      } else if (
        node.type.id === TOKEN.PlainLink ||
        node.type.id === TOKEN.RegularLink ||
        node.type.id === TOKEN.AngleLink
      ) {
        const linkText = state.doc.sliceString(node.from, node.to)
        const [linkPath, displayText, linkHandler, displayTextFromOffset] = extractLinkFromNode(node.type.id, linkText)
        if (linkHandler === "internal-inline-image") {
          if (isCursorInsideDecoration) {
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
        } else if (!isCursorInsideDecoration) {
          let link_css_classes = ["org-link"]
          let parent_is_markup = false
          if (markupNodeTypeIds.includes(node.node.parent.type.id)) {
            link_css_classes.push(markupClass(node.node.parent.type.id))
            parent_is_markup = true
          }
          let displayHtml = displayText
          if (!parent_is_markup) {
            displayHtml = injectMarkupInLinktext(node, displayText, state, displayTextFromOffset)
          }
          builderBuffer.push([
            node.from,
            node.to,
            Decoration.replace({
              widget: new LinkWidget(
                linkPath, displayHtml, linkHandler,
                obsidianUtils.navigateToFile, obsidianUtils.navigateToOrgId,
                link_css_classes,
              ),
            })
          ])
        }
      } else if (
        node.type.id === TOKEN.TextBold ||
        node.type.id === TOKEN.TextItalic ||
        node.type.id === TOKEN.TextUnderline ||
        node.type.id === TOKEN.TextVerbatim ||
        node.type.id === TOKEN.TextCode ||
        node.type.id === TOKEN.TextStrikeThrough
      ) {
        if (!isCursorInsideDecoration) {
          builderBuffer.push([node.from, node.from+1, Decoration.replace({})])
          builderBuffer.push([node.to-1, node.to, Decoration.replace({})])
          if (
            node.node.parent.type.id === TOKEN.RegularLink ||
            node.node.parent.type.id === TOKEN.AngleLink
          ) {
            builderBuffer.push([node.from+1, node.to-1, Decoration.mark({class: 'org-link'})])
          }
        } else {
          if (
            node.node.parent.type.id === TOKEN.RegularLink ||
            node.node.parent.type.id === TOKEN.AngleLink
          ) {
            builderBuffer.push([node.from, node.to, Decoration.mark({class: 'org-link'})])
          }
        }
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

export const orgmodeLivePreview = (obsidianUtils: {
    navigateToFile: (filePath: string) => void,
    getImageUri: (linkPath: string) => string,
    navigateToOrgId: (orgCustomId: string) => void,
}) => {
  return StateField.define<DecorationSet>({
    create(state: EditorState): DecorationSet {
      return loadDecorations(state, obsidianUtils)
    },
    update(oldState: DecorationSet, transaction: Transaction): DecorationSet {
      return loadDecorations(transaction.state, obsidianUtils)
    },
    provide(field: StateField<DecorationSet>): Extension {
      return EditorView.decorations.from(field);
    },
  });
}

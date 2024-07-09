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
import { LinkHandler, extractLinkFromNode } from 'language-extensions';

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
  displayText: string
  linkHandler: LinkHandler
  navigateToFile: (filePath: string) => void
  navigateToOrgId: (orgCustomId: string) => void
  constructor(
    linkPath: string,
    displayText: string,
    linkHandler: LinkHandler,
    navigateToFile: (filePath: string) => void,
    navigateToOrgId: (orgCustomId: string) => void,
  ) {
    super()
    this.linkPath = linkPath
    this.displayText = displayText
    this.linkHandler = linkHandler
    this.navigateToFile = navigateToFile
    this.navigateToOrgId = navigateToOrgId
  }
  eq(other: LinkWidget) {
    return this.linkPath == other.linkPath && this.displayText == other.displayText
  }
  toDOM(view: EditorView): HTMLElement {
    const link = document.createElement("a");
    link.innerText = this.displayText
    link.href = "#"
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
      if (
        node.type.id === TOKEN.PlainLink ||
        node.type.id === TOKEN.RegularLink ||
        node.type.id === TOKEN.AngleLink
      ) {
        const linkText = state.doc.sliceString(node.from, node.to)
        const [linkPath, displayText, linkHandler] = extractLinkFromNode(node.type.id, linkText)
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
          builderBuffer.push([
            node.from,
            node.to,
            Decoration.replace({
              widget: new LinkWidget(linkPath, displayText, linkHandler, obsidianUtils.navigateToFile, obsidianUtils.navigateToOrgId),
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
        if (isCursorInsideDecoration) {
          return
        }
        builderBuffer.push([node.from, node.from+1, Decoration.replace({})])
        builderBuffer.push([node.to-1, node.to, Decoration.replace({})])
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

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
import { orgLinkParameters } from "codemirror-lang-orgmode";

class PlainLinkWidget extends WidgetType {
  linkText: string
  constructor(linkText: string) {
    super()
    this.linkText = linkText
  }
  eq(other: PlainLinkWidget) {
    return this.linkText == other.linkText
  }
  toDOM(view: EditorView): HTMLElement {
    const link = document.createElement("a");
    link.innerText = this.linkText
    link.href = "#"
    link.addEventListener("click", () => {
      window.open(this.linkText)
    })
    return link
  }
}

class RegularLinkWidget extends WidgetType {
  linkText: string
  href: string
  openLink: (href: string) => void
  constructor(linkText: string, openLinkCallback: (href: string) => void) {
    super()
    this.openLink = openLinkCallback
    if (/\]\[/.test(linkText)) {
      let desc = linkText.split("][")[1]
      let href = linkText.split("][")[0].substring(2)
      desc = desc.substring(0, desc.length-2)
      this.linkText = desc
      this.href = href
    } else {
      this.linkText = linkText.substring(2, linkText.length-2)
      this.href = this.linkText
    }
  }
  eq(other: RegularLinkWidget) {
    return this.linkText == other.linkText
  }
  toDOM(view: EditorView): HTMLElement {
    const link = document.createElement("a");
    link.innerText = this.linkText
    link.href = "#"
    let type = null
    for (const lparam of orgLinkParameters) {
      if (this.href.startsWith(`${lparam}:`)) {
        type = "LINKTYPE"
      }
    }
    link.addEventListener("click", () => {
      if (type === "LINKTYPE") {
        window.open(this.href)
      } else {
        this.openLink(this.href)
      }
    });
    return link;
  }
}

class AngleLinkWidget extends WidgetType {
  linkText: string
  constructor(linkText: string) {
    super()
    this.linkText = linkText.substring(1, linkText.length-1)
  }
  eq(other: AngleLinkWidget) {
    return this.linkText == other.linkText
  }
  toDOM(view: EditorView): HTMLElement {
    const link = document.createElement("a");
    link.innerText = this.linkText
    link.href = "#"
    link.addEventListener("click", () => {
      window.open(this.linkText)
    });
    return link;
  }
}

function loadDecorations(state: EditorState, openLinkCallback: (href: string) => void) {
  const builder = new RangeSetBuilder<Decoration>();
  const cursorPos = state.selection.main.head
  syntaxTree(state).iterate({
    enter(node) {
      const isCursorInsideDecoration = (cursorPos >= node.from && cursorPos <= node.to)
      if (isCursorInsideDecoration) {
        return
      }
      if (
        node.type.name === "PlainLink" ||
        node.type.name === "RegularLink" ||
        node.type.name === "AngleLink"
      ) {
        const linkText = state.doc.sliceString(node.from, node.to)
        if (node.type.name === "PlainLink") {
          builder.add(
            node.from,
            node.to,
            Decoration.replace({
              widget: new PlainLinkWidget(linkText),
            })
          )
        } else if (node.type.name === "RegularLink") {
          builder.add(
            node.from,
            node.to,
            Decoration.replace({
              widget: new RegularLinkWidget(linkText, openLinkCallback),
            })
          )
        } else if (node.type.name === "AngleLink") {
          builder.add(
            node.from,
            node.to,
            Decoration.replace({
              widget: new AngleLinkWidget(linkText),
            })
          )
        }
      }
      if (
        node.type.name === "TextBold" ||
        node.type.name === "TextItalic" ||
        node.type.name === "TextUnderline" ||
        node.type.name === "TextVerbatim" ||
        node.type.name === "TextCode" ||
        node.type.name === "TextStrikeThrough"
      ) {
        builder.add(node.from, node.from+1, Decoration.replace({}))
        builder.add(node.to-1, node.to, Decoration.replace({}))
      }
    },
  })
  return builder.finish();
}

export const orgmodeLivePreview = (openLinkCallback: (href: string) => void) => {
  return StateField.define<DecorationSet>({
    create(state: EditorState): DecorationSet {
      return loadDecorations(state, openLinkCallback)
    },
    update(oldState: DecorationSet, transaction: Transaction): DecorationSet {
      return loadDecorations(transaction.state, openLinkCallback)
    },
    provide(field: StateField<DecorationSet>): Extension {
      return EditorView.decorations.from(field);
    },
  });
}

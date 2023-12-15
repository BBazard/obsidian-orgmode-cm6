import { EditorView, keymap, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { syntaxHighlighting, HighlightStyle, foldGutter, foldService, syntaxTree } from "@codemirror/language"
import { EditorState } from "@codemirror/state";

import { SyntaxNode } from "@lezer/common";
import { tags } from "@lezer/highlight"
import { vim, Vim } from "@replit/codemirror-vim"

import { Orgmode } from './codemirror-lang-orgmode/dist';

import { App, PluginSettingTab, Plugin, WorkspaceLeaf, TextFileView, Setting } from "obsidian";

import { DEFAULT_SETTINGS, OrgmodePluginSettings } from 'settings';

const myHighlightStyle = HighlightStyle.define([
  // Block
  // {tag: tags.atom},
  // Heading
  { tag: tags.heading, class: "org-heading" },
  // Title
  { tag: tags.contentSeparator, class: "org-title" },
  // Planning
  { tag: tags.annotation, class: "org-planning" },
  // PropertyDrawer
  { tag: tags.meta, class: "org-propertydrawer" },
  // Section
  { tag: tags.content, class: "org-section" },
  // Comment
  { tag: tags.lineComment, class: "org-comment" },
  // TodoKeyword
  { tag: tags.keyword, class: "org-keyword" },
  // Priority
  { tag: tags.unit, class: "org-priority" },
  // Tags
  { tag: tags.tagName, class: "org-tags" },
]);



export class OrgmodeSettingTab extends PluginSettingTab {
  plugin: OrgmodePlugin;

  constructor(app: App, plugin: OrgmodePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName('Keywords for active (todo) tasks')
      .addTextArea((text) => {
        text.setValue(this.plugin.settings.todoKeywords.toString())
          .setPlaceholder('comma-separated values')
          .onChange(async (value) => {
            this.plugin.settings.todoKeywords = value.split(',');
            await this.plugin.saveSettings();
          })
      })
    new Setting(containerEl)
      .setName('Keywords for completed (done) tasks')
      .addTextArea((text) => {
        text.setValue(this.plugin.settings.doneKeywords.toString())
          .setPlaceholder('comma-separated values')
          .onChange(async (value) => {
            this.plugin.settings.doneKeywords = value.split(',');
            await this.plugin.saveSettings();
          })
      })
  }
}

export default class OrgmodePlugin extends Plugin {

  settings: OrgmodePluginSettings;
  settingTab: OrgmodeSettingTab = null;

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    global.todoKeywords = this.settings.todoKeywords
    global.doneKeywords = this.settings.doneKeywords
  }

  async saveSettings() {
    await this.saveData(this.settings);
    global.todoKeywords = this.settings.todoKeywords
    global.doneKeywords = this.settings.doneKeywords
  }

  orgViewCreator = (leaf: WorkspaceLeaf) => {
    return new OrgView(leaf);
  };

  async onload() {
    await this.loadSettings();
    this.settingTab = new OrgmodeSettingTab(this.app, this)
    this.addSettingTab(this.settingTab);

    this.registerView("orgmode", this.orgViewCreator);
    this.registerExtensions(["org"], "orgmode");
  }
}

export const makeHeadingsFoldable = foldService.of((state: EditorState, from, to) => {
  let is_heading = false
  let block_to = null
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(to, -1); node; node = node.parent) {
    if (node.type.name == "Heading") {
      is_heading = true
    }
    if (node.type.name == "Block") {
      block_to = node.to
    }
  }
  if (is_heading && block_to && from != to) {
    return { from: to, to: block_to - 1 };
  }
  return null
});

class OrgView extends TextFileView {
  // Internal code mirror instance:
  codeMirror: EditorView;

  public get extContentEl(): HTMLElement {
    return this.contentEl;
  }

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);

    this.codeMirror = new EditorView({
      doc: "",
      extensions: [
        // @ts-expect-error, not typed
        vim(this.app?.vault?.config?.vimMode),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        drawSelection(),
        Orgmode(),
        syntaxHighlighting(myHighlightStyle),
        EditorView.lineWrapping,
        makeHeadingsFoldable,
        foldGutter({
          markerDOM: (open) => {
            // icon copied from obsidian minimal theme
            const foldIcon = document.createElement("div");
            const foldIcon_svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            const foldIcon_svg_path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            foldIcon_svg.setAttributeNS(null, "width", "24");
            foldIcon_svg.setAttributeNS(null, "height", "24");
            foldIcon_svg.setAttributeNS(null, "viewBox", "0 0 24 24");
            foldIcon_svg.setAttributeNS(null, "fill", "none");
            foldIcon_svg.setAttributeNS(null, "stroke", "currentColor");
            foldIcon_svg.setAttributeNS(null, "stroke-width", "2");
            foldIcon_svg.setAttributeNS(null, "stroke-linecap", "round");
            foldIcon_svg.setAttributeNS(null, "stroke-linejoin", "round");
            foldIcon_svg.setAttributeNS(null, "class", "svg-icon");
            foldIcon_svg_path.setAttribute("d", "M3 8L12 17L21 8");
            foldIcon_svg.appendChild(foldIcon_svg_path);
            if (open) {
              foldIcon_svg.addClass("open-fold-icon");
            } else {
              foldIcon_svg.addClass("closed-fold-icon");
              foldIcon_svg.setCssStyles({ "transform": "rotate(-90deg)" });
            }
            foldIcon.appendChild(foldIcon_svg);
            return foldIcon
          }
        }),
        EditorView.editorAttributes.of({ class: "orgmode-view" }),
        EditorView.editorAttributes.of({ class: "mod-cm6" }),
        EditorView.baseTheme({
          ".cm-gutters": {
            backgroundColor: "unset !important",
            border: "unset !important",
          },
          ".open-fold-icon": {
            opacity: "0",
          },
          ".open-fold-icon:hover": {
            opacity: "1",
          },
          ".cm-panels": {
            backgroundColor: "#2e2e2e",
          },
        })
      ],
      parent: this.contentEl
    })
    // see https://github.com/replit/codemirror-vim/blob/ab5a5a42171573604e8ae74b8a720aecd53d9eb1/src/vim.js#L266
    Vim.defineEx('write', 'w', () => {
      // @ts-expect-error, not typed
      this.app?.commands.executeCommandById('editor:save-file');
    });
  }

  getViewData = () => {
    return this.codeMirror.state.doc.toString()
  };

  setViewData = (data: string, clear: boolean) => {
    if (clear) {
      this.codeMirror.dispatch({
        changes: { from: 0, to: 0, insert: data }
      })
    } else {
      this.codeMirror.dispatch({
        changes: { from: 0, to: this.codeMirror.state.doc.length, insert: data }
      })
    }
  };

  clear = () => {
    this.codeMirror.dispatch({
      changes: { from: 0, to: this.codeMirror.state.doc.length, insert: "" }
    })
  };

  getDisplayText() {
    if (this.file) {
      return this.file.basename;
    } else {
      return "org (No File)";
    }
  }

  canAcceptExtension(extension: string) {
    return extension === "org";
  }

  getViewType() {
    return "orgmode";
  }
}

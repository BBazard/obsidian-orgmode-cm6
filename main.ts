import { EditorView, keymap, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { syntaxHighlighting, HighlightStyle, foldGutter, foldService, syntaxTree } from "@codemirror/language"
import { EditorState, Extension } from "@codemirror/state";
import { Heading, Block } from './codemirror-lang-orgmode/src/parser.terms';

import { SyntaxNode } from "@lezer/common";
import { tags } from "@lezer/highlight"
import { vim, Vim } from "@replit/codemirror-vim"

import { Orgmode } from './codemirror-lang-orgmode/dist';

import { App, PluginSettingTab, Plugin, WorkspaceLeaf, TextFileView, Setting, parseYaml, MarkdownRenderChild } from "obsidian";

import { DEFAULT_SETTINGS, OrgmodePluginSettings } from 'settings';
import { OrgmodeTask, StatusType } from 'org-tasks';
import { OrgTasksSync } from 'org-tasks-file-sync';

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

    this.registerMarkdownCodeBlockProcessor("orgmode-tasks", async (src, el, ctx) => {
      try {
        let parameters = null;
        parameters = parseYaml(src)
        if (typeof parameters.filepath === 'undefined') {
          throw Error("Missing parameters filepath")
        }
        const tfile = this.app.vault.getFileByPath(parameters.filepath)
        if (!tfile) {
          throw Error(`file not found: ${parameters.filepath}`)
        }
        const orgTasksSync = new OrgTasksSync(this.settings, this.app.vault)
        const rootEl = el.createEl("div");
        const renderChild = new MarkdownRenderChild(el)
        ctx.addChild(renderChild);
        renderChild.unload = () => {
          orgTasksSync.onunload()
        }
        const onStatusChange = async (orgmode_task: OrgmodeTask) => {
          await orgTasksSync.updateTaskStatus(tfile, orgmode_task)
        }
        let orgmode_tasks: Array<OrgmodeTask> = await orgTasksSync.getTasks(tfile)
        this.render(orgmode_tasks, rootEl, onStatusChange)
        orgTasksSync.onmodified(tfile, (refreshed_tasks: OrgmodeTask[]) => {
          this.render(refreshed_tasks, rootEl, onStatusChange)
        })
      } catch (e) {
          el.createEl("h3", {text: "Error: " + e.message});
        return;
      }
    });
  }

  private render(orgmode_tasks: Array<OrgmodeTask>, rootEl: HTMLElement, onStatusChange: (orgmode_task: OrgmodeTask) => void) {
    rootEl.innerHTML = ""
    var list = rootEl.createEl("ul", { cls: "contains-task-list plugin-tasks-query-result tasks-layout-hide-urgency tasks-layout-hide-edit-button" });
    orgmode_tasks.forEach((orgmode_task, i) => {
      const li = list.createEl("li", { cls: "task-list-item plugin-tasks-list-item" })
      li.setAttribute("data-line", i.toString())
      li.setAttribute("data-task-priority", "normal")  // orgmode_task.priority
      li.setAttribute("data-task-status-type", orgmode_task.statusType)
      if (orgmode_task.statusType === StatusType.DONE) {
        li.setAttribute("data-task", "x")
        li.setAttribute("data-task-status-name", "Done")
      } else {
        li.setAttribute("data-task", "")
        li.setAttribute("data-task-status-name", "Todo")
      }
      const input = li.createEl("input", { cls: "task-list-item-checkbox", type: "checkbox" })
      input.setAttribute("data-line", i.toString())
      input.checked = orgmode_task.statusType === StatusType.DONE
      input.addEventListener('click', e => {
        onStatusChange(orgmode_task)
      })
      li.createSpan({ cls: "tasks-list-text" }).createSpan({ cls: "task-description" }).createSpan({ text: orgmode_task.description })
    })
  }
}

export const makeHeadingsFoldable = foldService.of((state: EditorState, from, to) => {
  let is_heading = false
  let block_to = null
  let heading_level = null
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(to, -1); node; node = node.parent) {
    if (node.type.id == Heading) {
      heading_level = state.doc.sliceString(node.from, node.to).match(/^\*+/g)[0].length
      is_heading = true
    }
    if (node.type.id == Block) {
      block_to = node.to
      let current_node = node.nextSibling
      while (current_node) {
        const stars_match = state.doc.sliceString(current_node.from, current_node.to).match(/^\*+/g)
        if (!stars_match) {
          break
        }
        const current_heading_level = stars_match[0].length
        if (current_heading_level <= heading_level) {
          break
        }
        block_to = current_node.to
        current_node = current_node.nextSibling
      }
    }
  }
  if (state.doc.sliceString(block_to-1, block_to) === '\n') {
    block_to = block_to - 1
  }
  if (is_heading && block_to && block_to > to) {
    return { from: to, to: block_to };
  }
  return null
});

class OrgView extends TextFileView {
  // Internal code mirror instance:
  codeMirror: EditorView;
  extensions: Extension;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.codeMirror = new EditorView({
      parent: this.contentEl
    })
    this.extensions = [
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
        }),
        EditorView.updateListener.of((v) => {
          if (v.docChanged) {
            this.requestSave()
          }
        }),
      ]
    // see https://github.com/replit/codemirror-vim/blob/ab5a5a42171573604e8ae74b8a720aecd53d9eb1/src/vim.js#L266
    Vim.defineEx('write', 'w', () => {
      this.save()
    });
  }

  getViewData = () => {
    return this.codeMirror.state.doc.toString()
  };

  setViewData = (data: string, clear: boolean) => {
    this.codeMirror.setState(EditorState.create({
      doc: data,
      extensions: this.extensions,
    }))
  }

  clear = () => {
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

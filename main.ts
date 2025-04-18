import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { foldGutter } from "@codemirror/language"
import { EditorState, Extension, Compartment } from "@codemirror/state";
import { LRParser } from "@lezer/lr";
import { vim, Vim } from "@replit/codemirror-vim"

import { App, PluginSettingTab, Plugin, WorkspaceLeaf, TextFileView, Setting, parseYaml, MarkdownRenderChild, Notice } from "obsidian";

import { OrgmodeLanguage, OrgmodeParser } from 'codemirror-lang-orgmode';

import { DEFAULT_SETTINGS, OrgmodePluginSettings } from 'settings';
import { OrgmodeTask, StatusType } from 'org-tasks';
import { OrgTasksSync } from 'org-tasks-file-sync';
import { makeHeadingsFoldable, iterateOrgIds } from 'language-extensions';
import { orgmodeLivePreview } from "org-live-preview";
import { computeQuery } from 'orgzly-search';
import type { ConditionValue, ConditionResolver } from 'orgzly-search';
import { moment } from 'obsidian';

let todoKeywordsReloader = new Compartment
let vimCompartment = new Compartment

function parseKeywordTextArea(value: string): string[] {
  return value.replace(/\n/g, ",").split(',').map(x=>x.trim()).filter(x => x != "");
}

class ConditionResolverObsidian implements ConditionResolver {
  now: number
  constructor() {
    this.now = moment().valueOf()
  }
  resolve(value: ConditionValue): string | number {
    if ('date' in value) {
      return moment(value['date']).startOf('day').valueOf()
    }
    if ('text' in value) {
      return value['text']
    }
    if ('duration' in value) {
      return moment(this.now).add(...value['duration'] as any).startOf('day').valueOf()
    }
  }
}

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
        text.setValue(this.plugin.settings.todoKeywords.join(","))
          .setPlaceholder('comma-separated values')
          .onChange(async (value) => {
            this.plugin.settings.todoKeywords = parseKeywordTextArea(value)
            await this.plugin.saveSettings();
          })
      })
    new Setting(containerEl)
      .setName('Keywords for completed (done) tasks')
      .addTextArea((text) => {
        text.setValue(this.plugin.settings.doneKeywords.join(","))
          .setPlaceholder('comma-separated values')
          .onChange(async (value) => {
            this.plugin.settings.doneKeywords = parseKeywordTextArea(value)
            await this.plugin.saveSettings();
          })
      })
    new Setting(containerEl)
      .setName('Hide heading stars')
      .setDesc('Hiding the stars is useful when using CSS to replace them')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.hideStars)
          .onChange(async (value) => {
            this.plugin.settings.hideStars = value
            await this.plugin.saveSettings();
          })
      })
  }
}

export default class OrgmodePlugin extends Plugin {

  settings: OrgmodePluginSettings;
  orgmodeParser: LRParser
  settingTab: OrgmodeSettingTab = null;

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings.todoKeywords = parseKeywordTextArea(this.settings.todoKeywords.join(","))
    this.settings.doneKeywords = parseKeywordTextArea(this.settings.doneKeywords.join(","))
    const words = [...this.settings.todoKeywords, ...this.settings.doneKeywords]
    this.orgmodeParser = OrgmodeParser(words)
  }

  async saveSettings() {
    await this.saveData(this.settings);
    const view = this.app.workspace.getActiveViewOfType(OrgView)
    const words = [...this.settings.todoKeywords, ...this.settings.doneKeywords]
    this.orgmodeParser = OrgmodeParser(words)
    view.codeMirror.dispatch({
      effects: todoKeywordsReloader.reconfigure(OrgmodeLanguage(this.orgmodeParser))
    })
  }

  orgViewCreator = (leaf: WorkspaceLeaf) => {
    return new OrgView(leaf, this.orgmodeParser, this.settings);
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
        let query = "it.todo or it.done"  // backward compatibility
        if (typeof parameters.query !== 'undefined') {
          query = parameters.query
        }
        const orgTasksSync = new OrgTasksSync(this.settings, this.orgmodeParser, this.app.vault)
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
        const resolver = new ConditionResolverObsidian()
        if (query) {
          orgmode_tasks = orgmode_tasks.filter(task => computeQuery(query, task, resolver, this.settings))
        }
        this.render(orgmode_tasks, rootEl, onStatusChange)
        orgTasksSync.onmodified(tfile, (refreshed_tasks: OrgmodeTask[]) => {
          if (query) {
            refreshed_tasks = refreshed_tasks.filter(task => computeQuery(query, task, resolver, this.settings))
          }
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
    if (orgmode_tasks.length == 0) {
      const list = rootEl.createEl("ul", { cls: "contains-task-list plugin-tasks-query-result tasks-layout-hide-urgency tasks-layout-hide-edit-button" });
      list.createSpan({ cls: "tasks-list-text", text: 'Your search did not match any notes' })
    }
    const list = rootEl.createEl("ul", { cls: "contains-task-list plugin-tasks-query-result tasks-layout-hide-urgency tasks-layout-hide-edit-button" });
    orgmode_tasks.forEach((orgmode_task, i) => {
      this.renderTask(orgmode_task, i, list, onStatusChange)
    })
  }

  private renderTask(orgmode_task: OrgmodeTask, i: number, list: HTMLElement, onStatusChange: (orgmode_task: OrgmodeTask) => void) {
      const li = list.createEl("li")
      if (orgmode_task.statusType !== null) {
        li.addClasses(["task-list-item", "plugin-tasks-list-item"])
      }
      li.setAttribute("data-line", i.toString())
      li.setAttribute("data-task-priority", "normal")  // orgmode_task.priority
      li.setAttribute("data-task-status-type", orgmode_task.statusType)
      if (orgmode_task.statusType === StatusType.DONE) {
        li.setAttribute("data-task", "x")
        li.setAttribute("data-task-status-name", "Done")
        const input = li.createEl("input", { cls: "task-list-item-checkbox", type: "checkbox" })
        input.setAttribute("data-line", i.toString())
        input.checked = true
        input.addEventListener('click', e => {
          onStatusChange(orgmode_task)
        })
      } else if (orgmode_task.statusType === StatusType.TODO) {
        li.setAttribute("data-task", "")
        li.setAttribute("data-task-status-name", "Todo")
        const input = li.createEl("input", { cls: "task-list-item-checkbox", type: "checkbox" })
        input.setAttribute("data-line", i.toString())
        input.checked = false
        input.addEventListener('click', e => {
          onStatusChange(orgmode_task)
        })
      } else {
        li.createSpan({ cls: "list-bullet" })
      }
      li.createSpan({ cls: "tasks-list-text" }).createSpan({ cls: "task-description" }).createSpan({ text: orgmode_task.description })
  }
}


class OrgView extends TextFileView {
  // Internal code mirror instance:
  codeMirror: EditorView;
  extensions: Extension[];

  constructor(leaf: WorkspaceLeaf, orgmodeParser: LRParser, settings: OrgmodePluginSettings) {
    super(leaf);
    this.codeMirror = new EditorView({
      parent: this.contentEl
    })
    this.extensions = [
        history(),
        // @ts-expect-error, not typed
        vimCompartment.of((this.app.vault.getConfig("vimMode")) ? vim() : []),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        todoKeywordsReloader.of(OrgmodeLanguage(orgmodeParser)),
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
            foldIcon_svg.setCssStyles({ "height": "100%" });
            if (open) {
              foldIcon.addClass("open-fold-icon");
            } else {
              foldIcon.addClass("closed-fold-icon");
              foldIcon_svg.setCssStyles({ "transform": "rotate(-90deg)", "color": "var(--text-accent)" });
            }
            foldIcon.appendChild(foldIcon_svg);
            foldIcon.setCssStyles({ "height": "100%" });
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
          if (v.focusChanged) {
            const compartmentState = vimCompartment.get(this.codeMirror.state) as Array<any>
            const loaded = !!(Array.isArray(compartmentState) && compartmentState.length)
            // @ts-expect-error, not typed
            const userset = !!this.app.vault.getConfig("vimMode")
            if (userset && !loaded) {
              this.codeMirror.dispatch({
                effects: vimCompartment.reconfigure(vim())
              })
            }
            if (!userset && loaded) {
              this.codeMirror.dispatch({
                effects: vimCompartment.reconfigure([])
              })
            }
          }
        }),
        orgmodeLivePreview(
          this.codeMirror,
          settings,
          {
          navigateToFile: (filePath: string) => {
            try {
              let tfile = this.app.metadataCache.getFirstLinkpathDest(filePath, ".");
              if (!tfile) {
                tfile = this.app.metadataCache.getFirstLinkpathDest(filePath+".org", ".");
              }
              this.leaf.openFile(tfile)
            } catch {
              return
            }
          },
          getImageUri: (linkPath: string) => {
            try {
              let imageFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, ".");
              let browserUri = this.app.vault.getResourcePath(imageFile)
              return browserUri
            } catch {
              return null
            }
          },
          navigateToOrgId: async (orgCustomId: string) => {
            try {
              const orgFiles = this.app.vault.getFiles().filter(x => x.extension == 'org')
              for (const orgFile of orgFiles) {
                const orgContent = await this.app.vault.cachedRead(orgFile)
                for (const {orgId, start} of iterateOrgIds(orgmodeParser, orgContent)) {
                  if (orgCustomId === orgId) {
                    this.leaf.openFile(orgFile).then(() => {
                      this.codeMirror.focus()
                      this.codeMirror.dispatch(
                        { selection: { head: start, anchor: start } },
                        { effects: EditorView.scrollIntoView(start, { y: "start" }) }
                      )
                    })
                    return
                  }
                }
              }
              new Notice(`Cannot find entry with ID "${orgCustomId}"`)
            } catch (e) {
              console.log(e)
              return
            }
          },
          getVaultFiles: () => {
            try {
              const orgFiles = this.app.vault.getFiles().map(x => [x.name, x.path])
              return orgFiles
            } catch (e) {
              console.log(e)
              return
            }
          },
          listOrgIds: async () => {
            try {
              const orgFiles = this.app.vault.getFiles().filter(x => x.extension == 'org')
              const orgIds = []
              for (const orgFile of orgFiles) {
                const orgContent = await this.app.vault.cachedRead(orgFile)
                for (const orgid of Array.from(iterateOrgIds(orgmodeParser, orgContent)).map(x => x.orgId)) {
                  orgIds.push([orgid, orgFile.path])
                }
              }
              return orgIds
            } catch (e) {
              console.log(e)
              return
            }
          },
        }),
      ]
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

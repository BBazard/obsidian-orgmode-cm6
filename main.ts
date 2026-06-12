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
import { Orgzly } from 'orgzly-search';
import { ConditionValue, ConditionResolver, AgendaGroup, OrgzlyView } from 'orgzly-search';
import { moment } from 'obsidian';
import { orgzlyI18n_overdue } from "orgzly-l18n";

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
  public safeEval(toEval: string, task: OrgmodeTask) {
    if (toEval === 'task.status') {
      return task.status
    } else if (toEval === 'task.statusType') {
      return task.statusType
    } else if (toEval === 'task.description') {
      return task.description
    } else if (toEval === 'task.taskLocation') {
      return task.taskLocation
    } else if (toEval === 'task.scheduled') {
      return task.scheduled
    } else if (toEval === 'task.deadline') {
      return task.deadline
    } else if (toEval === 'task.closed') {
      return task.closed
    } else if (toEval === 'task.priority') {
      return task.priority
    }
    throw Error(`Unexpected safeEval param '${toEval}'`)
  }
  resolve(value: ConditionValue, task: OrgmodeTask): string | number {
    if ('text' in value) {
      return value['text']
    }
    if ('duration' in value) {
      return moment(this.now).add(...value['duration'] as any).startOf('day').valueOf()
    }
    if ('eval' in value) {
      return this.safeEval(value['eval'], task)
    }
    if ('evalDateStartOfDay' in value) {
      const evalDateStartOfDay = this.safeEval(value['evalDateStartOfDay'], task)
      return moment(evalDateStartOfDay).startOf('day').valueOf()
    }
    if ('evalDate' in value) {
      const evalDate = this.safeEval(value['evalDate'], task)
      return moment(evalDate).valueOf()
    }
  }
  agendaFormatDate(timestamp: number | "overdue"): string {
    if (timestamp === "overdue") {
      const locale: string = moment.locale()
      if (orgzlyI18n_overdue.has(locale)) {
        return orgzlyI18n_overdue.get(locale)
      }
      return orgzlyI18n_overdue.get("default")
    }
    let localizedDate: string = moment(timestamp).format("LLLL")
    const currentYear = moment().year()
    if (moment(timestamp).year() == currentYear) {
      localizedDate = localizedDate.replace(new RegExp(`[, ]*${currentYear}.*$`), '')
    } else {
      localizedDate = localizedDate.replace(new RegExp(`${moment(timestamp).year()}.*$`), `${moment(timestamp).year()}`)
    }
    return localizedDate
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
      .setName("Default priority")
      .setDesc('For sorting items without a priority')
      .addText((text) => {
        text.setValue(this.plugin.settings.defaultPriority)
          .setPlaceholder("priority cookie like 'B'")
          .onChange(async (value) => {
            this.plugin.settings.defaultPriority = value
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
        let orgzlyExpression = "it.todo or it.done"  // backward compatibility
        if (typeof parameters.query !== 'undefined') {
          orgzlyExpression = parameters.query
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
        const initial_orgmode_tasks: Array<OrgmodeTask> = await orgTasksSync.getTasks(tfile)
        const resolver = new ConditionResolverObsidian()
        const orgzly = new Orgzly(this.settings, resolver)
        const orgzly_view = orgzly.search(orgzlyExpression, initial_orgmode_tasks)
        this.render(rootEl, orgzly_view, onStatusChange, resolver)
        orgTasksSync.onmodified(tfile, (refreshed_tasks: OrgmodeTask[]) => {
          const refreshed_orgzly_view = orgzly.search(orgzlyExpression, refreshed_tasks)
          this.render(rootEl, refreshed_orgzly_view, onStatusChange, resolver)
        })
      } catch (e) {
          el.createEl("h3", {text: "Error: " + e.message});
        return;
      }
    });
  }

  private render(
    rootEl: HTMLElement,
    orgzlyView: OrgzlyView,
    onStatusChange: (orgmode_task: OrgmodeTask) => void,
    resolver: ConditionResolver,
  ) {
    rootEl.innerHTML = ""
    if ('agendaView' in orgzlyView) {
      const agenda_tasks = orgzlyView.agendaView
      this.renderAgenda(rootEl, agenda_tasks, onStatusChange, resolver)
      return
    }
    if ('regularView' in orgzlyView) {
      const orgmode_tasks = orgzlyView.regularView
      this.renderTaskList(rootEl, orgmode_tasks, onStatusChange)
      return
    }
  }

  private renderTaskList(rootEl: HTMLElement, orgmode_tasks: OrgmodeTask[], onStatusChange: (orgmode_task: OrgmodeTask) => void) {
    const list = rootEl.createEl("ul");
    if (orgmode_tasks.length === 0) {
        rootEl.createDiv({ text: 'Your search did not match any notes' })
        return
    }
    orgmode_tasks.forEach((orgmode_task) => {
      const li = list.createEl("li", {cls: "org-agenda-item"})
      const taskMainLineDiv = li.createDiv({ cls: "org-agenda-item-line" })
      this.renderTaskMainLine(taskMainLineDiv, orgmode_task, onStatusChange)
    })
  }

  private renderAgenda(rootEl: HTMLElement, agenda_groups: AgendaGroup[], onStatusChange: (orgmode_task: OrgmodeTask) => void, resolver: ConditionResolver) {
    const orgAgendaEl = rootEl.createDiv({ cls: "org-agenda" })
    agenda_groups.forEach((agenda_groups) => {
      orgAgendaEl.createDiv({ cls: "org-agenda-group-heading", text: resolver.agendaFormatDate(agenda_groups.date) })
      const list = orgAgendaEl.createEl("ul");
      agenda_groups.tasks.forEach(({task, sortKey}) => {
        const orgmode_task = task
        const li = list.createEl("li", {cls: "org-agenda-item"})
        const taskMainLineDiv = li.createDiv({ cls: "org-agenda-item-line" })
        this.renderTaskMainLine(taskMainLineDiv, orgmode_task, onStatusChange)
        const taskAttributeLineDiv = li.createDiv({ cls: "org-agenda-item-line" })
        taskAttributeLineDiv.createDiv({ cls: "org-agenda-item-gutter" })
        if (sortKey == 'scheduled') {
          taskAttributeLineDiv.createDiv({
            cls: `org-agenda-item-date org-agenda-item-date-scheduled`,
            text: `${resolver.safeEval(`task.scheduled`, task)}`,
            attr: {'aria-label': 'scheduled', 'data-tooltip-position': "left"},
          })
        } else if (sortKey == 'deadline') {
          taskAttributeLineDiv.createDiv({
            cls: `org-agenda-item-date org-agenda-item-date-deadline`,
            text: `${resolver.safeEval(`task.deadline`, task)}`,
            attr: {'aria-label': 'deadline', 'data-tooltip-position': "left"},
          })
        }
      })
    })
  }

  private renderTaskMainLine(taskMainLineDiv: HTMLElement, orgmode_task: OrgmodeTask, onStatusChange: (orgmode_task: OrgmodeTask) => void) {
      const gutter = taskMainLineDiv.createDiv({ cls: "org-agenda-item-gutter" })
      if (orgmode_task.statusType === StatusType.DONE) {
        // data-task and checked are needed for native checkbox styling
        const input = gutter.createEl("input", { cls: "org-agenda-item-input", attr: {"data-task": "x"}, type: "checkbox" })
        input.checked = true
        input.addEventListener('click', e => {
          onStatusChange(orgmode_task)
        })
      } else if (orgmode_task.statusType === StatusType.TODO) {
        // data-task and checked are needed for native checkbox styling
        const input = gutter.createEl("input", { cls: "org-agenda-item-input", attr: {"data-task": " "}, type: "checkbox" })
        input.checked = false
        input.addEventListener('click', e => {
          onStatusChange(orgmode_task)
        })
      }
      taskMainLineDiv.createSpan({ text: orgmode_task.description })
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

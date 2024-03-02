import { OrgmodeTask, parseOrgmodeContent, cycleOrgmodeTaskStatusContent } from 'org-tasks';
import { TFile, Vault, EventRef } from "obsidian";
import { OrgmodePluginSettings } from 'settings';

export class OrgTasksSync {
  private onModifiedRef: EventRef | null

  constructor(
    private settings: OrgmodePluginSettings,
    private vault: Vault
  ) {
    this.vault = vault
    this.settings = settings
    this.onModifiedRef = null
  }

  public onunload() {
    if (this.onModifiedRef !== null) {
      this.vault.offref(this.onModifiedRef)
    }
  }

  public onmodified(tfile: TFile, callback: (tasks: OrgmodeTask[]) => any) {
    if (this.onModifiedRef !== null) {
      this.vault.offref(this.onModifiedRef)
    }
    this.onModifiedRef = this.vault.on("modify", async (file: TFile) => {
      if (file !== tfile) {
        return
      }
      const newest_orgmode_content = await this.vault.read(tfile)
      const orgmode_tasks: Array<OrgmodeTask> = parseOrgmodeContent(newest_orgmode_content, this.settings)
      callback(orgmode_tasks)
    })
  }

  public async updateTaskStatus(tfile: TFile, orgmode_task: OrgmodeTask): Promise<void> {
    await this.vault.process(tfile, (newest_orgmode_content: string) => {
      const replaced_content = cycleOrgmodeTaskStatusContent(orgmode_task, newest_orgmode_content)
      return replaced_content
    })
  }

  public async getTasks(tfile: TFile): Promise<OrgmodeTask[]> {
    const orgmode_tasks: Array<OrgmodeTask> = parseOrgmodeContent(await this.vault.read(tfile), this.settings)
    return orgmode_tasks
  }
}

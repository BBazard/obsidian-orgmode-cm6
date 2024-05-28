import { LRParser } from '@lezer/lr';
import { TFile, Vault, EventRef } from "obsidian";

import { OrgmodePluginSettings } from 'settings';
import { OrgmodeTask, parseOrgmodeTasks, cycleOrgmodeTaskStatusContent } from 'org-tasks';

export class OrgTasksSync {
  private onModifiedRef: EventRef | null
  private unloaded: boolean

  constructor(
    private settings: OrgmodePluginSettings,
    private orgmodeParser: LRParser,
    private vault: Vault
  ) {
    this.vault = vault
    this.settings = settings
    this.onModifiedRef = null
    this.unloaded = false
    this.orgmodeParser = orgmodeParser
  }

  public onunload() {
    if (!this.unloaded) {
      if (this.onModifiedRef !== null) {
        this.vault.offref(this.onModifiedRef)
      }
      this.unloaded = true
    }
  }

  public onmodified(tfile: TFile, callback: (tasks: OrgmodeTask[]) => any) {
    if (this.unloaded) {
      return
    }
    if (this.onModifiedRef !== null) {
      this.vault.offref(this.onModifiedRef)
    }
    this.onModifiedRef = this.vault.on("modify", async (file: TFile) => {
      if (file !== tfile) {
        return
      }
      const newest_orgmode_content = await this.vault.read(tfile)
      const orgmode_tasks: Array<OrgmodeTask> = parseOrgmodeTasks(newest_orgmode_content, this.settings, this.orgmodeParser)
      callback(orgmode_tasks)
    })
  }

  public async updateTaskStatus(tfile: TFile, orgmode_task: OrgmodeTask): Promise<void> {
    if (this.unloaded) {
      return
    }
    await this.vault.process(tfile, (newest_orgmode_content: string) => {
      const replaced_content = cycleOrgmodeTaskStatusContent(orgmode_task, newest_orgmode_content)
      return replaced_content
    })
  }

  public async getTasks(tfile: TFile): Promise<OrgmodeTask[]> {
    if (this.unloaded) {
      return
    }
    const orgmode_tasks: Array<OrgmodeTask> = parseOrgmodeTasks(await this.vault.read(tfile), this.settings, this.orgmodeParser)
    return orgmode_tasks
  }
}

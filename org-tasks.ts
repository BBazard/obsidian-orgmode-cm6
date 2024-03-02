import { TreeCursor } from "@lezer/common";
import { OrgmodeLanguage } from './codemirror-lang-orgmode/dist';
import { Heading, TodoKeyword, Title, Priority } from './codemirror-lang-orgmode/src/parser.terms';
import { OrgmodePluginSettings } from "settings";

export enum StatusType {
  TODO = 'TODO',
  DONE = 'DONE',
}

export class OrgmodeTaskLocation {
  status: number[]
  priority: number[]
}

export class OrgmodeTask {
  status: string;
  statusType: StatusType;
  description: string;
  taskLocation: OrgmodeTaskLocation;
  priority: string;
}

export function cycleOrgmodeTaskStatusContent(orgmode_task: OrgmodeTask, orgmode_content: string) {
    const pos = orgmode_task.taskLocation.status
    const new_keyword = orgmode_task.statusType == StatusType.DONE ? "TODO" : "DONE"
    const replaced_content = orgmode_content.substring(0, pos[0]) + new_keyword + orgmode_content.substring(pos[1]);
    return replaced_content
}

export function parseOrgmodeContent(orgmode_content: string, settings: OrgmodePluginSettings): OrgmodeTask[] {
  const parsed = OrgmodeLanguage.parser.parse(orgmode_content)
  const cursor = parsed.cursor()
  const orgmode_tasks: Array<OrgmodeTask> = new Array()
  while (cursor.next()) {
    if (cursor.node.type.id === Heading) {
      const task = extractTaskFromHeadingNode(cursor, orgmode_content, settings)
      if (task) {
        orgmode_tasks.push(task)
      }
    }
  }
  return orgmode_tasks
}

function extractTaskFromHeadingNode(cursor: TreeCursor, orgmode_content: string, settings: OrgmodePluginSettings): OrgmodeTask | null {
  let item: Map<string, any> = new Map()
  item.set('taskLocation', new Map())
  cursor.iterate((node) => {
    if (node.type.id === TodoKeyword) {
      item.set('status', orgmode_content.slice(node.from, node.to))
      item.get('taskLocation').set('status', [node.from, node.to])
    }
    if (node.type.id === Title) {
      item.set('description', orgmode_content.slice(node.from, node.to).trim())
    }
    if (node.type.id === Priority) {
      const priority_match = orgmode_content.slice(node.from, node.to).match(new RegExp("\\[#(.)\\]"))
      item.set('priority', priority_match[1])
      item.get('taskLocation').set('priority', [node.from + priority_match.index + 2, node.from + priority_match.index + 3])
    }
  })
  if (item.get('status')) {
    const taskLocation: OrgmodeTaskLocation = {
      status: item.get('taskLocation').get('status') ?? null,
      priority: item.get('taskLocation').get('priority') ?? null,
    }
    const status = item.get("status") ?? null
    const statusType = settings.doneKeywords.includes(status) ? StatusType.DONE : StatusType.TODO
    const task: OrgmodeTask = {
      status: status,
      statusType: statusType,
      description: item.get("description"),
      priority: item.get("priority") ?? null,
      taskLocation: taskLocation,
    }
    return task
  }
  return null
}

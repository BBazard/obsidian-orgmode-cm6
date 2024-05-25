import { SyntaxNode } from "@lezer/common";
import { TOKEN } from 'codemirror-lang-orgmode';
import { LRParser } from "@lezer/lr";
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
  status: string
  statusType: StatusType
  description: string
  taskLocation: OrgmodeTaskLocation
  priority: string
  children: OrgmodeTask[]
}

export function cycleOrgmodeTaskStatusContent(orgmode_task: OrgmodeTask, orgmode_content: string) {
    const pos = orgmode_task.taskLocation.status
    const new_keyword = orgmode_task.statusType === StatusType.DONE ? "TODO" : "DONE"
    const replaced_content = orgmode_content.substring(0, pos[0]) + new_keyword + orgmode_content.substring(pos[1]);
    return replaced_content
}

function parseOrgmodeHeading(heading: SyntaxNode, orgmode_content: string, settings: OrgmodePluginSettings): OrgmodeTask {
  const children = heading.getChildren(TOKEN.Heading)
  const task: any = extractTaskFromHeadingNode(heading, orgmode_content, settings)
  if (task === null) {
    return null
  }
  if (children && children.length !== 0) {
    const tasks = children.map(heading => parseOrgmodeHeading(heading, orgmode_content, settings))
    task.children = tasks.filter(task => task !== null)
  }
  return task
}

export function parseOrgmodeContent(orgmode_content: string, settings: OrgmodePluginSettings, orgmodeParser: LRParser): OrgmodeTask[] {
  const parsed = orgmodeParser.parse(orgmode_content)
  const topNode = parsed.topNode
  const children = topNode.getChildren(TOKEN.Heading)
  const orgmode_tasks: Array<OrgmodeTask> = children.map(heading => {
    return parseOrgmodeHeading(heading, orgmode_content, settings)
  }).filter(x => x !== null)
  console.log(JSON.stringify(orgmode_tasks, null, 2))
  return orgmode_tasks
}

function extractTaskFromHeadingNode(heading: SyntaxNode, orgmode_content: string, settings: OrgmodePluginSettings): OrgmodeTask | null {
  let item: Map<string, any> = new Map()
  item.set('taskLocation', new Map())
  const TodoKeywordNode = heading.getChild(TOKEN.TodoKeyword)
  const TitleNode = heading.getChild(TOKEN.Title)
  const PriorityNode = heading.getChild(TOKEN.Priority)
  if (TodoKeywordNode) {
    item.set('status', orgmode_content.slice(TodoKeywordNode.from, TodoKeywordNode.to))
    item.get('taskLocation').set('status', [TodoKeywordNode.from, TodoKeywordNode.to])
  }
  if (TitleNode) {
    item.set('description', orgmode_content.slice(TitleNode.from, TitleNode.to).trim())
  }
  if (PriorityNode) {
    const priority_match = orgmode_content.slice(PriorityNode.from, PriorityNode.to).match(new RegExp("\\[#(.)\\]"))
    item.set('priority', priority_match[1])
    item.get('taskLocation').set('priority', [PriorityNode.from + priority_match.index + 2, PriorityNode.from + priority_match.index + 3])
  }
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
      children: [],  // will be set later
    }
    return task
  }
  return null
}

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

export class OrgmodeHeading {
  status: string
  statusType: StatusType
  description: string
  taskLocation: OrgmodeTaskLocation
  priority: string
  children: OrgmodeHeading[]
}

export class OrgmodeTask {
  status: string
  statusType: StatusType
  description: string
  taskLocation: OrgmodeTaskLocation
  priority: string
}

export function cycleOrgmodeTaskStatusContent(orgmode_task: OrgmodeTask, orgmode_content: string) {
    const pos = orgmode_task.taskLocation.status
    const new_keyword = orgmode_task.statusType === StatusType.DONE ? "TODO" : "DONE"
    const replaced_content = orgmode_content.substring(0, pos[0]) + new_keyword + orgmode_content.substring(pos[1]);
    return replaced_content
}

function parseOrgmodeHeading(headingNode: SyntaxNode, orgmode_content: string, settings: OrgmodePluginSettings): OrgmodeHeading {
  const children = headingNode.getChildren(TOKEN.Heading)
  const orgHeading = extractOrgHeadingFromHeadingNode(headingNode, orgmode_content, settings)
  if (children && children.length !== 0) {
    const orgHeadingChildren = children.map(heading => parseOrgmodeHeading(heading, orgmode_content, settings))
    orgHeading.children = orgHeadingChildren.filter(task => task !== null)
  }
  return orgHeading
}

function iterateTasks(heading: OrgmodeHeading): OrgmodeTask[] {
  if (heading.status !== null) {
    const task: OrgmodeTask = {
      status: heading.status,
      statusType: heading.statusType,
      description: heading.description,
      taskLocation: heading.taskLocation,
      priority: heading.priority,
    }
    return [task, ...heading.children.map(x=>iterateTasks(x)).flat()]
  } else {
    return [...heading.children.map(x=>iterateTasks(x)).flat()]
  }
}

export function parseOrgmodeTasks(orgmode_content: string, settings: OrgmodePluginSettings, orgmodeParser: LRParser): OrgmodeTask[] {
  const headings = parseOrgmodeContent(orgmode_content, settings, orgmodeParser)
  return headings.map(x=>iterateTasks(x)).flat()
}


export function parseOrgmodeContent(orgmode_content: string, settings: OrgmodePluginSettings, orgmodeParser: LRParser): OrgmodeHeading[] {
  const parsed = orgmodeParser.parse(orgmode_content)
  const topNode = parsed.topNode
  const children = topNode.getChildren(TOKEN.Heading)
  const orgmode_headings = children.map(heading => {
    return parseOrgmodeHeading(heading, orgmode_content, settings)
  }).filter(x => x !== null)
  return orgmode_headings
}

function extractOrgHeadingFromHeadingNode(headingNode: SyntaxNode, orgmode_content: string, settings: OrgmodePluginSettings): OrgmodeHeading {
  const item: Map<string, any> = new Map()
  item.set('taskLocation', new Map())
  const TodoKeywordNode = headingNode.getChild(TOKEN.TodoKeyword)
  const TitleNode = headingNode.getChild(TOKEN.Title)
  const PriorityNode = headingNode.getChild(TOKEN.Priority)
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
  const taskLocation: OrgmodeTaskLocation = {
    status: item.get('taskLocation').get('status') ?? null,
    priority: item.get('taskLocation').get('priority') ?? null,
  }
  const status = item.get("status") ?? null
  const statusType = settings.doneKeywords.includes(status) ? StatusType.DONE : StatusType.TODO
  const task: OrgmodeHeading = {
    status: status,
    statusType: statusType,
    description: item.get("description"),
    priority: item.get("priority") ?? null,
    taskLocation: taskLocation,
    children: [],  // will be set later
  }
  return task
}

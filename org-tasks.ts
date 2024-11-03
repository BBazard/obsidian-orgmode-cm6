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
  scheduled: number[]
  closed: number[]
  deadline: number[]
}

export class OrgmodeHeading {
  status: string
  statusType: StatusType
  description: string
  taskLocation: OrgmodeTaskLocation
  priority: string
  scheduled: string
  deadline: string
  closed: string
  children: OrgmodeHeading[]
}

export class OrgmodeTask {
  status: string
  statusType: StatusType
  description: string
  taskLocation: OrgmodeTaskLocation
  scheduled: string
  deadline: string
  closed: string
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
  if (heading) {
    const task: OrgmodeTask = {
      status: heading.status,
      statusType: heading.statusType,
      description: heading.description,
      taskLocation: heading.taskLocation,
      scheduled: heading.scheduled,
      deadline: heading.deadline,
      closed: heading.closed,
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
  const SectionNode = headingNode.getChild(TOKEN.Section)
  if (SectionNode) {
    const PlanningScheduled = SectionNode.getChild(TOKEN.PlanningScheduled)
    if (PlanningScheduled) {
      const scheduledValueNode = PlanningScheduled.nextSibling
      if (scheduledValueNode && scheduledValueNode.type.id == TOKEN.PlanningValue) {
        const scheduledValue = orgmode_content.slice(scheduledValueNode.from, scheduledValueNode.to).trim()
        item.set('scheduled', scheduledValue)
        item.get('taskLocation').set('scheduled', [scheduledValueNode.from, scheduledValueNode.to])
      }
    }
    const PlanningClosed = SectionNode.getChild(TOKEN.PlanningClosed)
    if (PlanningClosed) {
      const closedValueNode = PlanningClosed.nextSibling
      if (closedValueNode && closedValueNode.type.id == TOKEN.PlanningValue) {
        const closedValue = orgmode_content.slice(closedValueNode.from, closedValueNode.to).trim()
        item.set('closed', closedValue)
        item.get('taskLocation').set('closed', [closedValueNode.from, closedValueNode.to])
      }
    }
    const PlanningDeadline = SectionNode.getChild(TOKEN.PlanningDeadline)
    if (PlanningDeadline) {
      const deadlineValueNode = PlanningDeadline.nextSibling
      if (deadlineValueNode && deadlineValueNode.type.id == TOKEN.PlanningValue) {
        const deadlineValue = orgmode_content.slice(deadlineValueNode.from, deadlineValueNode.to).trim()
        item.set('deadline', deadlineValue)
        item.get('taskLocation').set('deadline', [deadlineValueNode.from, deadlineValueNode.to])
      }
    }
  }
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
    scheduled: item.get('taskLocation').get('scheduled') ?? null,
    closed: item.get('taskLocation').get('closed') ?? null,
    deadline: item.get('taskLocation').get('deadline') ?? null,
  }
  const status = item.get("status") ?? null
  let statusType = null
  if (settings.doneKeywords.includes(status)) {
    statusType = StatusType.DONE
  } else if (settings.todoKeywords.includes(status)) {
    statusType = StatusType.TODO
  }
  const task: OrgmodeHeading = {
    status: status,
    statusType: statusType,
    description: item.get("description"),
    priority: item.get("priority") ?? null,
    taskLocation: taskLocation,
    scheduled: item.get("scheduled") ?? null,
    deadline: item.get("deadline") ?? null,
    closed: item.get("closed") ?? null,
    children: [],  // will be set later
  }
  return task
}

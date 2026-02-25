import { buildParser } from '@lezer/generator'
import { SyntaxNode, Tree } from "@lezer/common"
import { OrgmodeTask, StatusType } from 'org-tasks';
import { grammarFile } from "./boolean_expression_generated_grammar";
import { OrgmodePluginSettings } from 'settings';

export interface ConditionResolver {
  // interface needed to use moment.js with obsidian
  safeEval: (toEval: string, task: OrgmodeTask) => any
  resolve: (value: ConditionValue, task: OrgmodeTask) => string | number
  agendaFormatDate: (timestamp: number | "overdue") => string
}

const BooleanExpressionParser = buildParser(grammarFile.toString())

export function parseBooleanExpression(boolExpr: string): { tree: Tree, normalizedExpr: string } {
  if (boolExpr.match(/[&|]/)) {
    throw Error('Special characters "&" / "|" are not accepted in expression, use "and" / "or" instead')
  }
  boolExpr = boolExpr.replace(/ and /gi, " & ").replace(/ or /gi, ' | ')
  try {
    BooleanExpressionParser.configure({strict: true}).parse(boolExpr)
  } catch(e) {
    throw Error(`query is not a valid expression ${e}`)
  }
  return {tree: BooleanExpressionParser.parse(boolExpr), normalizedExpr: boolExpr }
}


function parseExpTime(timeVal: string): [number, string] {
  if (timeVal === "today" || timeVal === "tod") {
    timeVal = "0d"
  }
  if (timeVal === "tomorrow" || timeVal === "tmrw" || timeVal === "tom") {
    timeVal = "1d"
  }
  if (timeVal === "yesterday") {
    timeVal = "-1d"
  }
  if (timeVal === "now") {
    timeVal = "0d"
  }

  let intervalStr = timeVal.slice(timeVal.length-1)
  if (intervalStr === "m") {
    // "m" is minutes for Moment.js
    // we want month "M"
    intervalStr = "M"
  }
  const nb = +timeVal.slice(0, timeVal.length-1)
  return [nb, intervalStr]
}

function extractTaskTime(exp_key: string): ConditionValue  {
  let dateToEval = ""
  if (exp_key == "d") {
    dateToEval = "task.deadline"
  } else if (exp_key == "c") {
    dateToEval = "task.closed"
  } else if (exp_key == "s") {
    dateToEval = "task.scheduled"
  }
  if (!dateToEval) {
    return null
  }
  return {"evalDateStartOfDay": dateToEval}
}

export type ConditionValue =
  | { text: string, date?: never, duration?: never, eval?: never }
  | { duration: [number, string], text?: never, state?: never, eval?: never }
  | { eval: string, date?: never, text?: never, duration?: never }
  | { evalDateStartOfDay: string, date?: never, text?: never, duration?: never }
  | { evalDate: string, date?: never, text?: never, duration?: never }
export type Condition = [ConditionValue, Neg, ExpOp, ConditionValue]
export type SortOrderChoice =
  //'+notebook' | '-notebook'
  // | '+title' | '-title'
  | '+scheduled' | '-scheduled'
  | '+deadline' | '-deadline'
  // | '+event' | '-event'
  | '+closed' | '-closed'
  // | '+created' | '-created'
  | '+priority' | '-priority'
  | '+status' | '-status'  // state in orgzly query
export type SortOrder = { sort: SortOrderChoice[] }
export type AgendaRange = { agenda: number }
export type SortOrderAgendaRange = { sort: SortOrderChoice[], agenda: number }
export type IntermediateRepr =
  []  // all tasks
  | Condition
  | SortOrder
  | AgendaRange
  | { and: IntermediateRepr[] }
  | { or: IntermediateRepr[] }
export enum ExpOp {
  EQ="eq",
  NE="ne",
  LT="lt",
  LE="le",
  GT="gt",
  GE="ge",
}
export type Neg = "is" | "not"
// TODO: tagged union for OrgmodeTask[] | AgendaGroups
export type AgendaGroupItem = {
  task: OrgmodeTask,
  sortKey: "scheduled" | "deadline",
}
export type AgendaGroup = {
  date: number | "overdue", // timestamp for i18n during rendering
  tasks: AgendaGroupItem[]
}
type AgendaGroupsIr = Map<"overdue" | number, AgendaGroupItem[]>
export type OrgzlyView =
  | {regularView: OrgmodeTask[], agendaView?: never }
  | {regularView?: never, agendaView: AgendaGroup[] }



function parseCondition(conditionStr: string, settings: OrgmodePluginSettings): Condition | SortOrder | AgendaRange {
  let initialConditionStr = conditionStr
  try {
    let negated: Neg = "is"
    if (conditionStr.startsWith(".")) {
      negated = "not"
      conditionStr = conditionStr.slice(1)
    }
    const words = conditionStr.split(".")
    const exp_key = words[0]

    if (negated === "not" && ["s", "d", "d", "c", "cr", "ad"].includes(exp_key)) {
      throw Error(`Negation with leading '.' not supported in query for OP "${exp_key}"`)
    }

    if (exp_key === "o") {
      const sortKey = words[1]
      const ascDescSymbol = (negated === "is") ? "+" : "-"
      if (['b', 'book', 'notebook'].includes(sortKey)) {
        throw Error(`Could not parse condition "${initialConditionStr}"`)
        // return {"sort": [`${ascDescSymbol}notebook`]}
      } else if (['t', 'title'].includes(sortKey)) {
        throw Error(`Could not parse condition "${initialConditionStr}"`)
        // return {"sort": [`${ascDescSymbol}title`]}
      } else if (['s', 'sched', 'scheduled'].includes(sortKey)) {
        return {"sort": [`${ascDescSymbol}scheduled`]}
      } else if (['d', 'dead', 'deadline'].includes(sortKey)) {
        return {"sort": [`${ascDescSymbol}deadline`]}
      } else if (['e', 'event'].includes(sortKey)) {
        throw Error(`Could not parse condition "${initialConditionStr}"`)
        // return {"sort": [`${ascDescSymbol}event`]}
      } else if (['c', 'close', 'closed'].includes(sortKey)) {
        return {"sort": [`${ascDescSymbol}closed`]}
      } else if (['cr', 'created'].includes(sortKey)) {
        throw Error(`Could not parse condition "${initialConditionStr}"`)
        // return {"sort": [`${ascDescSymbol}created`]}
      } else if (['p', 'pri', 'prio', 'priority'].includes(sortKey)) {
        return {"sort": [`${ascDescSymbol}priority`]}
      } else if (['st', 'state'].includes(sortKey)) {
        return {"sort": [`${ascDescSymbol}status`]}
      }
    }
    if (exp_key === "ad") {
      return {"agenda": +words[1]}
    }
    if (["s", "d", "c"].includes(exp_key)) {
      let exp_op = ExpOp.EQ
      if (["s", "d", "cr"].includes(exp_key)) {
        // Default value for s, d and cr is le
        // Default value for c is eq
        exp_op = ExpOp.LE
      }
      let exp_timeVal = ""
      if (words.length == 2) {
        exp_timeVal = words[1]
      } else if (words.length == 3) {
        if (!Object.values(ExpOp).includes(words[1] as any)) {
          throw Error(`Condition "${conditionStr}" is not valid`)
        }
        exp_op = words[1] as ExpOp
        exp_timeVal = words[2]
      }
      const dateExpr = extractTaskTime(exp_key)
      if (exp_timeVal === 'none' || exp_timeVal === 'no') {
        return [dateExpr, negated, exp_op, {'text': null}]
      }
      const [nb, intervalStr] = parseExpTime(exp_timeVal)
      return [dateExpr, negated, exp_op, {'duration': [nb, intervalStr]}]
    } else if (exp_key === "i") {
      const todoDoneKeywords = [...settings.todoKeywords, ...settings.doneKeywords]
      if (!todoDoneKeywords.map(x => x.toLowerCase()).includes(words[1].toLowerCase())) {
        throw Error(`Condition "${conditionStr}" is not valid, todo keyword "${words[1]}" not in settings`)
      }
      const stateRef = words[1].toUpperCase()
      return [{'eval': `task.status`}, negated, ExpOp.EQ, {'text': stateRef}]
    } else if (exp_key === "it") {
      if (!Object.values(StatusType).includes(words[1].toUpperCase() as any)) {
        throw Error(`Condition "${initialConditionStr}" is not valid`)
      }
      const stateTypeRef = words[1].toUpperCase() as StatusType
      return [{'eval': `task.statusType ?? ""`}, negated, ExpOp.EQ, {'text': stateTypeRef}]
    }
    throw Error(`Could not parse condition "${initialConditionStr}"`)
  } catch {
    throw Error(`Could not parse condition "${initialConditionStr}"`)
  }
}

function normalizeTask(task: OrgmodeTask): OrgmodeTask {
  function normalizeDate(dateStr: string) {
    if (dateStr) {
      // <date> or [date] -> date
      dateStr = dateStr.replace(/[\<\[\]\>]/g, "")
      // 2021-02-03 Tue 8:20 -> 2021-02-03 8:20
      dateStr = dateStr.replace(/[a-z]/gi, " ").replace(/ +/g, " ")
    }
    return dateStr
  }
  return {
    ...task,
    deadline: normalizeDate(task.deadline),
    closed: normalizeDate(task.closed),
    scheduled: normalizeDate(task.scheduled),
  }
}

function evalCondition(
  parsedCond: Condition,
  task: OrgmodeTask,
  resolver: ConditionResolver,
): boolean {
  const [taskValue, neg, expOp, refValue] = parsedCond
  const taskValueResolved = resolver.resolve(taskValue, normalizeTask(task))
  const refValueResolved = resolver.resolve(refValue, normalizeTask(task))
  let computation = false
  if (expOp == "eq") {
    computation = taskValueResolved == refValueResolved
  } else if (expOp == "ne") {
    computation = taskValueResolved != refValueResolved
  } else if (expOp == "lt") {
    computation = taskValueResolved < refValueResolved
  } else if (expOp == "le") {
    computation = taskValueResolved <= refValueResolved
  } else if (expOp == "gt") {
    computation = taskValueResolved > refValueResolved
  } else if (expOp == "ge") {
    computation = taskValueResolved >= refValueResolved
  }
  if (neg === 'not') {
    computation = !computation
  }
  return computation
}

export class Orgzly {
  constructor(
    private settings: OrgmodePluginSettings,
    private resolver: ConditionResolver,
  ) {
    this.settings = settings
    this.resolver = resolver
  }

  public search(orgzlyExpr: string, tasks: OrgmodeTask[]): OrgzlyView {
    const {ir, sort, agenda} = this.compile(orgzlyExpr)
    return this.execute(ir, sort, agenda, tasks)
  }

  public compile(orgzlyExpr: string): {ir: IntermediateRepr, sort: SortOrderChoice[], agenda: number} {
    if (!orgzlyExpr) {
      return {ir: [], sort: [], agenda: null}
    }
    const { tree, normalizedExpr } = parseBooleanExpression(orgzlyExpr)
    const sortOrderChoiceAgenda: SortOrderAgendaRange = {sort: [], agenda: null}
    const ir = this.computeExpression(tree.topNode.firstChild, normalizedExpr, sortOrderChoiceAgenda)
    // Orgzly documentation:
    // > Default ordering of notes is by notebook name then priority.
    // > If s or d are used in the query, they are also sorted by scheduled or deadline time.
    // > They are always sorted by position in the notebook last.
    if (!sortOrderChoiceAgenda.sort.includes("+priority") && !sortOrderChoiceAgenda.sort.includes("-priority")) {
      sortOrderChoiceAgenda.sort.push("+priority")
    }
    return {ir: ir, sort: sortOrderChoiceAgenda.sort, agenda: sortOrderChoiceAgenda.agenda}
  }

  private compareDate(a: OrgmodeTask, b: OrgmodeTask, prop: string, asc: boolean) {
    // We don't round to the start of the day
    // to have more precision when sorting
    const aProp = +this.resolver.resolve(
      {"evalDate": `task.${prop}`},
      normalizeTask(a)
    )
    const bProp = +this.resolver.resolve(
      {"evalDate": `task.${prop}`},
      normalizeTask(b)
    )
    if (asc) {
      return aProp - bProp
    }
    return bProp - aProp
  }

  private compareText(a: OrgmodeTask, b: OrgmodeTask, prop: string, asc: boolean, default_text: string = null) {
    let aProp = (this.resolver.resolve(
      {"eval": `task.${prop}`},
      normalizeTask(a)) ?? ""
    ).toString().toLocaleLowerCase()
    let bProp = (this.resolver.resolve(
      {"eval": `task.${prop}`},
      normalizeTask(b)) ?? ""
    ).toString().toLocaleLowerCase()
    if (default_text && !aProp) {
      aProp = default_text
    }
    if (default_text && !bProp) {
      bProp = default_text
    }
    if (asc) {
      return aProp.localeCompare(bProp)
    }
    return bProp.localeCompare(aProp)
  }

  private compareTasks(a: OrgmodeTask, b: OrgmodeTask, prop: string, asc: boolean) {
    if (['scheduled', 'deadline', 'closed'].includes(prop)) {
      return this.compareDate(a, b, prop, asc)
    } else if (['priority'].includes(prop)) {
      return this.compareText(a, b, prop, asc, this.settings.defaultPriority)
    } else if (['status'].includes(prop)) {
      return this.compareText(a, b, prop, asc)
    }
    throw Error(`Cannot compare tasks with property "${prop}"`)
  }

  private sortStrategy(a: OrgmodeTask, b: OrgmodeTask, sortOrderChoice: SortOrderChoice[]): number {
    let criteria = 0
    for (const sortOrderCriteria of sortOrderChoice) {
      const asc = sortOrderCriteria[0] === "+"
      const prop = sortOrderCriteria.slice(1)
      criteria = this.compareTasks(a, b, prop, asc)
      if (criteria !== 0) {
        return criteria
      }
    }
    return criteria
  }

  public execute(ir: IntermediateRepr, sortOrderChoice: SortOrderChoice[], agenda: number, tasks: OrgmodeTask[]): OrgzlyView {
    const filteredTasks = this.evalAllTasks(ir, tasks)
    if (agenda === null) {
      return {regularView: filteredTasks.sort((a, b) => this.sortStrategy(a, b, sortOrderChoice))}
    }
    return {agendaView: this.createAgenda(filteredTasks, sortOrderChoice, agenda)}
  }

  public createAgenda(tasks: OrgmodeTask[], sortOrderChoice: SortOrderChoice[], agenda: number): AgendaGroup[] {
    // Create a map with all agenda days having an empty list of tasks
    const agendaIr: AgendaGroupsIr = new Map()
    agendaIr.set("overdue", [])
    for (let i = 0; i < agenda; i++) {
      agendaIr.set(+this.resolver.resolve({"duration": [i, "d"]}, null), [])
    }

    // Put the tasks in the relevant agenda days
    const dates = Array.from(agendaIr.keys()).filter(element => element !== "overdue").sort()
    // Sentinel value: the day after the last day of the agenda
    dates.push(+this.resolver.resolve({"duration": [agenda, "d"]}, null))
    const maybeAddAgendaItem = (date: number, task: OrgmodeTask, dateType: "deadline" | "scheduled") => {
      const agendaGroupItem : AgendaGroupItem = {task: task, sortKey: dateType}
      if (date < dates[0]) {  // `dates[0]` is today
        if (dateType == "deadline") {
          agendaIr.get("overdue").push(agendaGroupItem)
        } else if (dateType == "scheduled") {
          // scheduled tasks before today appears for today
          // See https://github.com/orgzly-revived/orgzly-android-revived/pull/856
          agendaIr.get(dates[0]).push(agendaGroupItem)
        }
        return
      }
      for (let i = 1; i < dates.length; i++) {
        if (date >= dates[i-1] && date < dates[i]) {
          agendaIr.get(dates[i-1]).push(agendaGroupItem)
          return
        }
      }
    }
    for (const task of tasks) {
      const deadlineVal = +this.resolver.resolve({"evalDateStartOfDay": "task.deadline"}, normalizeTask(task))
      maybeAddAgendaItem(deadlineVal, task, "deadline")
      const scheduledVal = +this.resolver.resolve({"evalDateStartOfDay": "task.scheduled"}, normalizeTask(task))
      maybeAddAgendaItem(scheduledVal, task, "scheduled")
    }
    if (agendaIr.get("overdue").length === 0) {
      agendaIr.delete("overdue")
    }

    // sort inside each group
    const agendaIr2: AgendaGroupsIr = new Map()
    agendaIr.forEach((tasks, date) => {
      agendaIr2.set(date, tasks.sort(({task: taskA, sortKey: dateTypeA}, {task: taskB, sortKey: dateTypeB}) => {
        // From orgzly-revived docs: (https://www.orgzlyrevived.com/docs#search-agenda)
        // > Ordering in the agenda view is different from the regular search view.
        // > In the agenda view, notes are always sorted chronologically according to
        // > their timestamps within each day.
        const dateA = +this.resolver.resolve({"evalDate": `task.${dateTypeA}`}, normalizeTask(taskA))
        const dateB = +this.resolver.resolve({"evalDate": `task.${dateTypeB}`}, normalizeTask(taskB))

        // > Timestamps that include a date but no specific time of day will
        // > be ordered later in the day.
        // > For example, <2025-03-30 15:00> comes before <2025-03-30>.
        const hasTimeRegex = /\d{2}:\d{2}/;
        const hasDateATime = hasTimeRegex.test(this.resolver.safeEval(`task.${dateTypeA}`, taskA))
        const hasDateBTime = hasTimeRegex.test(this.resolver.safeEval(`task.${dateTypeB}`, taskB))
        if (hasDateATime && !hasDateBTime) {
          return -1
        }
        if (!hasDateATime && hasDateBTime) {
          return 1
        }

        // > When two notes have the same timestamps, the ordering will
        // > be determined using the same criteria described in the Sorting section above.
        if (dateA == dateB) {
          return this.sortStrategy(taskA, taskB, sortOrderChoice)
        }
        return dateA - dateB
      }))
    })

    const agendaGroups: AgendaGroup[] = Array.from(agendaIr2).map(([date, tasks]) => {
      return {date: date, tasks: tasks}
    })
    return agendaGroups
  }

  private isSortOrderOrAgenda(node: SyntaxNode, content: string, sortOrderChoiceAgenda: SortOrderAgendaRange): boolean {
    if (node.type.name === "Condition") {
      const conditionStr = content.slice(node.from, node.to)
      const condition = parseCondition(conditionStr, this.settings)
      if (!Array.isArray(condition) && "sort" in condition) {
        sortOrderChoiceAgenda.sort.push(condition["sort"][0])
        return true
      }
      if (!Array.isArray(condition) && "agenda" in condition) {
        sortOrderChoiceAgenda.agenda = condition["agenda"]
        return true
      }
    }
    return false
  }

  private *iterateChildrenExcludingSortOrder(node: SyntaxNode, content: string, sortOrderChoiceAgenda: SortOrderAgendaRange): Iterable<SyntaxNode> {
    if (!node.firstChild) {
      return
    }
    node = node.firstChild
    if (!this.isSortOrderOrAgenda(node, content, sortOrderChoiceAgenda)) {
      yield node
    }
    while (node.nextSibling) {
      node = node.nextSibling
      if (!this.isSortOrderOrAgenda(node, content, sortOrderChoiceAgenda)) {
        yield node
      }
    }
  }

  private computeExpression(node: SyntaxNode, content: string, sortOrderChoiceAgenda: SortOrderAgendaRange): IntermediateRepr {
    if (!node) {
      return null
    }
    if (node.type.name === "Condition") {
      const conditionStr = content.slice(node.from, node.to)
      const condition = parseCondition(conditionStr, this.settings)
      if (!Array.isArray(condition) && "sort" in condition) {
        // only happens if there is only one order condition in the query
        // since we are filtering the children
        sortOrderChoiceAgenda.sort.push(condition["sort"][0])
        return []
      }
      if (!Array.isArray(condition) && "agenda" in condition) {
        // only happens if there is only one agenda condition in the query
        // since we are filtering the children
        sortOrderChoiceAgenda.agenda = condition["agenda"]
        return []
      }
      return condition

    }
    const childrenExpr = [...this.iterateChildrenExcludingSortOrder(node, content, sortOrderChoiceAgenda)]
      .map(node => this.computeExpression(node, content, sortOrderChoiceAgenda))
    if (node.type.name === "And") {
      return {"and": childrenExpr}
    } else if (node.type.name === "Or") {
      return {"or": childrenExpr}
    }
    throw Error(`Unexpected node.type.name=${node.type.name}`)
  }

  public evalTask(ir: IntermediateRepr, task: OrgmodeTask): boolean {
    if ("and" in ir) {
      return ir["and"].reduce((acc, curr) => acc && this.evalTask(curr, task), true);
    } else if ("or" in ir) {
      return ir["or"].reduce((acc, curr) => acc || this.evalTask(curr, task), false);
    }
    if (Array.isArray(ir) && ir.length !== 0) {
      const condition = ir
      return evalCondition(condition, task, this.resolver)
    }
    throw Error(`Unexpected ir=${JSON.stringify(ir)}`)
  }

  public evalAllTasks(ir: IntermediateRepr, tasks: OrgmodeTask[]): OrgmodeTask[] {
    if (Array.isArray(ir) && ir.length === 0) {
      // no ir ; all tasks
      return tasks
    }
    const result = []
    for (const task of tasks) {
      if (this.evalTask(ir, task)) {
        result.push(task)
      }
    }
    return result
  }
}
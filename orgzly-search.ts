import { buildParser } from '@lezer/generator'
import { SyntaxNode } from "@lezer/common"
import { OrgmodeTask, StatusType } from 'org-tasks';
import { grammarFile } from "./orgzly_search_generated_grammar";
import { OrgmodePluginSettings } from 'settings';

export interface ConditionResolver {
  // interface needed to use moment.js with obsidian
  resolve: (value: ConditionValue) => string | number
}

export const OrgzlyExpressionParser = buildParser(grammarFile.toString())

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

function extractTaskTime(exp_key: string, task: OrgmodeTask): string | null {
  let dateStr = ""
  if (exp_key == "d") {
    dateStr = task.deadline
  } else if (exp_key == "c") {
    dateStr = task.closed
  } else if (exp_key == "s") {
    dateStr = task.scheduled
  }
  if (!dateStr) {
    return null
  }
  // <date> or [date] -> date
  dateStr = dateStr.replace(/[\<\[\]\>]/g, "")
  // 2021-02-03 Tue 8:20 -> 2021-02-03 8:20
  dateStr = dateStr.replace(/[a-z]/gi, " ").replace(/ +/g, " ")
  return dateStr
}

export type ConditionValue =
  | { date: string, text?: never, duration?: never }
  | { text: string, date?: never, duration?: never }
  | { duration: [number, string], text?: never, state?: never }
export enum ExpOp {
  EQ="eq",
  NE="ne",
  LT="lt",
  LE="le",
  GT="gt",
  GE="ge",
}
export type Neg = "is" | "not"


export function parseCondition(condition: string, task: OrgmodeTask, settings: OrgmodePluginSettings): [ConditionValue, Neg, ExpOp, ConditionValue] {
  try {
    let negated: Neg = "is"
    if (condition.startsWith(".")) {
      negated = "not"
      condition = condition.slice(1)
    }
    const words = condition.split(".")
    const exp_key = words[0]

    if (negated === "not" && ["s", "d", "d", "c", "cr"].includes(exp_key)) {
      throw Error(`Negation with leading '.' not supported in query for OP "${exp_key}"`)
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
          throw Error(`Condition "${condition}" is not valid`)
        }
        exp_op = words[1] as ExpOp
        exp_timeVal = words[2]
      }
      const dateStr = extractTaskTime(exp_key, task)
      if (exp_timeVal === 'none' || exp_timeVal === 'no') {
        return [{'date': dateStr}, negated, exp_op, {'text': null}]
      }
      const [nb, intervalStr] = parseExpTime(exp_timeVal)
      return [{'date': dateStr}, negated, exp_op, {'duration': [nb, intervalStr]}]
    } else if (exp_key === "i") {
      const todoDoneKeywords = [...settings.todoKeywords, ...settings.doneKeywords]
      if (!todoDoneKeywords.map(x => x.toLowerCase()).includes(words[1].toLowerCase())) {
        throw Error(`Condition "${condition}" is not valid, todo keyword "${words[1]}" not in settings`)
      }
      const stateRef = words[1].toLowerCase()
      return [{'text': task.status?.toLowerCase() ?? ""}, negated, ExpOp.EQ, {'text': stateRef}]
    } else if (exp_key === "it") {
      if (!Object.values(StatusType).includes(words[1].toUpperCase() as any)) {
        throw Error(`Condition "${condition}" is not valid`)
      }
      const stateTypeRef = words[1].toLowerCase() as StatusType
      return [{'text': task.statusType?.toLowerCase() ?? ""}, negated, ExpOp.EQ, {'text': stateTypeRef}]
    }
    throw Error(`Could not parse condition "${condition}"`)
  } catch {
    throw Error(`Could not parse condition "${condition}"`)
  }
}

function computeExpression(node: SyntaxNode, content: string, task: OrgmodeTask, resolver: ConditionResolver, settings: OrgmodePluginSettings): boolean {
  if (!node) {
    return false
  }
  if (node.type.name === "Condition") {
    const condition = content.slice(node.from, node.to)
    const [taskValue, neg, expOp, refValue] = parseCondition(condition, task, settings)
    const taskValueResolved = resolver.resolve(taskValue)
    const refValueResolved = resolver.resolve(refValue)
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
    console.log("condition", condition, computation)
    return computation
  }
  console.log("expression")
  const leftSide = computeExpression(node.firstChild, content, task, resolver, settings)
  const rightSide = computeExpression(node.firstChild.nextSibling, content, task, resolver, settings)
  if (node.type.name === "And") {
    const result = leftSide && rightSide
    console.log(`${content.slice(node.from, node.to)} ===> ${leftSide} and ${rightSide} = ${result}`)
    return result
  } else if (node.type.name === "Or") {
    const result = leftSide || rightSide
    console.log(`${content.slice(node.from, node.to)} ===> ${leftSide} or ${rightSide} = ${result}`)
    return result
  }
  throw Error()
}

export function preParseOrgzlyQuery(query: string): string {
  if (query.match(/[&|]/)) {
    throw Error('Special characters "&" / "|" are not accepted in query, use "and" / "or" instead')
  }
  return query.replace(/ and /gi, " & ").replace(/ or /gi, ' | ')
}

export function computeQuery(query: string, task: OrgmodeTask, resolver: ConditionResolver, settings: OrgmodePluginSettings): boolean {
  const content = preParseOrgzlyQuery(query)
  try {
    OrgzlyExpressionParser.configure({strict: true}).parse(content)
  } catch {
    throw Error("Query is not a valid expression")
  }
  const tree = OrgzlyExpressionParser.parse(content)
  const topNode = tree.topNode
  return computeExpression(topNode.firstChild, content, task, resolver, settings)
}

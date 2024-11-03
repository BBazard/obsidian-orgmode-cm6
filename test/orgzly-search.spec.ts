import { expect, test } from 'vitest';
import { OrgmodeTask, StatusType } from 'org-tasks';
import { parseCondition, preParseOrgzlyQuery, computeQuery } from 'orgzly-search';
import type { ConditionValue, ConditionResolver } from 'orgzly-search';
import { OrgzlyExpressionParser } from 'orgzly-search';
import { testTree } from "@lezer/generator/dist/test"
import { OrgmodePluginSettings } from 'settings';

const moment = require('moment');  // replace `import { moment } from 'obsidian'` for testing

const settings: OrgmodePluginSettings = {
  todoKeywords: ["TODO"],
  doneKeywords: ["DONE"],
  hideStars: false,
};

class ConditionResolverNode implements ConditionResolver {
  now: number
  constructor(epochMs: number) {
    this.now = moment(epochMs).valueOf()
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

test("isolated conditions", () => {
    const task: OrgmodeTask = {
      status: 'DONE',
      statusType: StatusType.DONE,
      description: 'task description',
      priority: null,
      taskLocation: {
        priority: null,
        status: [2, 6],
        scheduled: [18, 39],
        closed: [49, 70],
        deadline: [82, 103],
      },
      closed: "<2022-11-07 Sat 18:27>",
      deadline: "<2021-07-01 Sun 14:25>",
      scheduled: "<2020-03-02 Fri 12:06>",
    }
    expect(parseCondition("s.today", task, settings)).toEqual([{'date': '2020-03-02 12:06'}, 'is', 'le', {'duration': [0, "d"]}])
    expect(parseCondition("d.le.2d", task, settings)).toEqual([{'date': '2021-07-01 14:25'}, 'is', 'le', {'duration': [2, "d"]}])
    //expect(parseCondition("e.ge.now", task)).toEqual([])
    expect(parseCondition("c.yesterday", task, settings)).toEqual([{'date': '2022-11-07 18:27'}, 'is', 'eq', {'duration': [-1, "d"]}])
    //expect(parseCondition("cr.ge.yesterday", task)).toEqual([])
    expect(parseCondition("i.todo", task, settings)).toEqual([{'text': 'done'}, 'is', 'eq', {'text': "todo"}])
    expect(parseCondition(".it.done", task, settings)).toEqual([{'text': 'done'}, 'not', 'eq', {'text': 'done'}])
    //expect(parseCondition(".b.Work", task)).toEqual([])
    //expect(parseCondition("t.errand", task)).toEqual([])
    //expect(parseCondition("tn.toRead", task)).toEqual([])
    //expect(parseCondition(".p.c", task)).toEqual([])
    //expect(parseCondition("ps.b", task)).toEqual([])

    expect(parseCondition("s.no", task, settings)).toEqual([{'date': '2020-03-02 12:06'}, 'is', 'le', {'text': null}])
})

test("resolved conditions", () => {
    const epochMs =  moment('2023-11-02 23:13:20').valueOf()
    const r = new ConditionResolverNode(epochMs)
    expect(r.resolve({'text': 'done'})).toEqual('done')
    expect(r.resolve({'date': '2020-03-02 12:06'})).toEqual(moment('2020-03-02').valueOf())
    expect(r.resolve({'duration': [3, 'd']})).toEqual(moment('2023-11-05').valueOf())
    expect(r.resolve({'duration': [0, 'd']})).toEqual(moment('2023-11-02').valueOf())
    expect(r.resolve({'duration': [-3, 'd']})).toEqual(moment('2023-10-30').valueOf())
    expect(r.resolve({'duration': [1, 'w']})).toEqual(moment('2023-11-09').valueOf())
    expect(r.resolve({'duration': [1, 'M']})).toEqual(moment('2023-12-02').valueOf())
    expect(r.resolve({'duration': [1, 'y']})).toEqual(moment('2024-11-02').valueOf())
})

test("computeQuery", () => {
    const epochMs =  moment('2022-07-15').valueOf()
    const resolver = new ConditionResolverNode(epochMs)
    const task: OrgmodeTask = {
      status: 'DONE',
      statusType: StatusType.DONE,
      description: 'task description',
      priority: null,
      taskLocation: {
        priority: null,
        status: [2, 6],
        scheduled: [18, 39],
        closed: [49, 70],
        deadline: [82, 103],
      },
      closed: "<2022-07-16 Sat 18:27>",
      deadline: "<2022-07-15 Sun 14:25>",
      scheduled: "<2022-07-13 Fri 12:06>",
    }
    expect(computeQuery("i.done", task, resolver, settings)).toBe(true)
    expect(computeQuery("i.DONE", task, resolver, settings)).toBe(true)
    expect(computeQuery("i.todo", task, resolver, settings)).toBe(false)
    expect(computeQuery("s.-2d", task, resolver, settings)).toBe(true)
    expect(computeQuery("c.tomorrow", task, resolver, settings)).toBe(true)
    expect(computeQuery("d.today", task, resolver, settings)).toBe(true)
    expect(computeQuery("s.1d", task, resolver, settings)).toBe(true)
    expect(computeQuery("c.0d", task, resolver, settings)).toBe(false)
    expect(computeQuery("d.2d", task, resolver, settings)).toBe(true)
    expect(computeQuery("s.-2d c.tomorrow d.today", task, resolver, settings)).toBe(true)
    expect(computeQuery("s.-9d or c.tomorrow or d.-9d", task, resolver, settings)).toBe(true)
})

test("tree of expressions", () => {
  function expressionTree(query: string) {
      const content = preParseOrgzlyQuery(query)
      return OrgzlyExpressionParser.parse(content)
  }

  testTree(expressionTree("(x or y)"), "Program(Or(Condition, Condition))")
  testTree(expressionTree("(x and y)"), "Program(And(Condition, Condition))")
  testTree(expressionTree("(x OR y)"), "Program(Or(Condition, Condition))")
  testTree(expressionTree("(x AND y)"), "Program(And(Condition, Condition))")
  testTree(expressionTree("x y"), "Program(And(Condition, Condition))")
  testTree(expressionTree("x y z"), "Program(And(And(Condition, Condition), Condition))")
  testTree(expressionTree("x and y and z"), "Program(And(And(Condition, Condition), Condition))")
  testTree(expressionTree("x or y or z"), "Program(Or(Or(Condition, Condition), Condition))")

  // x and y or z ==> (x and y) or z
  testTree(expressionTree("x and y or z"), "Program(Or(And(Condition,Condition),Condition))")
  // x or y and z ==> x or (y or z)
  testTree(expressionTree("x or y and z"), "Program(Or(Condition,And(Condition,Condition)))")
  testTree(expressionTree("x or (y and z)"), "Program(Or(Condition,And(Condition,Condition)))")
  testTree(expressionTree("(x or y) and z"), "Program(And(Or(Condition,Condition),Condition))")
})
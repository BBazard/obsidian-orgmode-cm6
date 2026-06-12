import { expect, test } from 'vitest';
import { OrgmodeTask, StatusType } from 'org-tasks';
import { Orgzly, parseBooleanExpression } from 'orgzly-search';
import type { ConditionValue, ConditionResolver, IntermediateRepr, ExpOp } from 'orgzly-search';
import { testTree } from "@lezer/generator/dist/test"
import { OrgmodePluginSettings } from 'settings';
import { orgzlyI18n_overdue } from 'orgzly-l18n';

const moment = require('moment');  // replaces `import { moment } from 'obsidian'` for testing

const settings: OrgmodePluginSettings = {
  todoKeywords: ["TODO"],
  doneKeywords: ["DONE"],
  defaultPriority: 'B',
  hideStars: false,
};

class ConditionResolverNode implements ConditionResolver {
  now: number
  constructor(epochMs: number) {
    this.now = moment(epochMs).valueOf()
  }
  public safeEval(toEval: string, task: OrgmodeTask) {
      // equivalent of "return eval(toEval)"
      // but only using "task" as context
      // for example toEval="task.scheduled"
      return (new Function('task', `return ${toEval}`))(task)
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

test("isolated conditions", () => {
    const epochMs =  moment('2022-07-15').valueOf()
    const resolver = new ConditionResolverNode(epochMs)
    const orgzly = new Orgzly(settings, resolver)
    expect(orgzly.compile("d.today")["ir"]).toEqual([{'evalDateStartOfDay': 'task.deadline'}, 'is', 'le', {'duration': [0, "d"]}])
    expect(orgzly.compile("s.today")["ir"]).toEqual([{'evalDateStartOfDay': 'task.scheduled'}, 'is', 'le', {'duration': [0, "d"]}])
    expect(orgzly.compile("d.le.2d")["ir"]).toEqual([{'evalDateStartOfDay': 'task.deadline'}, 'is', 'le', {'duration': [2, "d"]}])
    // expect(orgzly.compile("e.ge.now")["ir"]).toEqual([])
    expect(orgzly.compile("c.yesterday")["ir"]).toEqual([{'evalDateStartOfDay': 'task.closed'}, 'is', 'eq', {'duration': [-1, "d"]}])
    //expect(orgzly.compile("cr.ge.yesterday")["ir"]).toEqual([])
    expect(orgzly.compile("i.todo")["ir"]).toEqual([{'eval': 'task.status'}, 'is', 'eq', {'text': "TODO"}])
    expect(orgzly.compile(".it.done")["ir"]).toEqual([{'eval': 'task.statusType ?? ""'}, 'not', 'eq', {'text': 'DONE'}])
    //expect(orgzly.compile(".b.Work")["ir"]).toEqual([])
    //expect(orgzly.compile("t.errand")["ir"]).toEqual([])
    //expect(orgzly.compile("tn.toRead")["ir"]).toEqual([])
    //expect(orgzly.compile(".p.c")["ir"]).toEqual([])
    //expect(orgzly.compile("ps.b")["ir"]).toEqual([])

    expect(orgzly.compile("s.no")["ir"]).toEqual([{'evalDateStartOfDay': 'task.scheduled'}, 'is', 'le', {'text': null}])
    expect(orgzly.compile("o.st")).toEqual({"ir": [], "sort": ["+status", "+priority"], "agenda": null})
    expect(orgzly.compile("ad.7")).toEqual({"ir": [], "sort": ["+priority"], "agenda": 7})
})

test("resolved conditions", () => {
    const epochMs =  moment('2023-11-02 23:13:20').valueOf()
    const r = new ConditionResolverNode(epochMs)
    expect(r.resolve({'text': 'done'}, null)).toEqual('done')
    expect(r.resolve({'duration': [3, 'd']}, null)).toEqual(moment('2023-11-05').valueOf())
    expect(r.resolve({'duration': [0, 'd']}, null)).toEqual(moment('2023-11-02').valueOf())
    expect(r.resolve({'duration': [-3, 'd']}, null)).toEqual(moment('2023-10-30').valueOf())
    expect(r.resolve({'duration': [1, 'w']}, null)).toEqual(moment('2023-11-09').valueOf())
    expect(r.resolve({'duration': [1, 'M']}, null)).toEqual(moment('2023-12-02').valueOf())
    expect(r.resolve({'duration': [1, 'y']}, null)).toEqual(moment('2024-11-02').valueOf())
})

test("evalTask", () => {
    const epochMs =  moment('2022-07-15').valueOf()
    const resolver = new ConditionResolverNode(epochMs)
    const orgzly = new Orgzly(settings, resolver)
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

    expect(orgzly.evalTask(orgzly.compile("i.done")["ir"], task)).toBe(true)
    expect(orgzly.evalTask(orgzly.compile("i.DONE")["ir"], task)).toBe(true)
    expect(orgzly.evalTask(orgzly.compile("i.todo")["ir"], task)).toBe(false)
    expect(orgzly.evalTask(orgzly.compile("s.-2d")["ir"], task)).toBe(true)
    expect(orgzly.evalTask(orgzly.compile("c.tomorrow")["ir"], task)).toBe(true)
    expect(orgzly.evalTask(orgzly.compile("d.today")["ir"], task)).toBe(true)
    expect(orgzly.evalTask(orgzly.compile("s.1d")["ir"], task)).toBe(true)
    expect(orgzly.evalTask(orgzly.compile("c.0d")["ir"], task)).toBe(false)
    expect(orgzly.evalTask(orgzly.compile("d.2d")["ir"], task)).toBe(true)
    expect(orgzly.evalTask(orgzly.compile("s.-2d c.tomorrow d.today")["ir"], task)).toBe(true)
    expect(orgzly.evalTask(orgzly.compile("s.-9d or c.tomorrow or d.-9d")["ir"], task)).toBe(true)
})

test("tree of expressions", () => {
  testTree(parseBooleanExpression("(x or y)")["tree"], "Program(Or(Condition, Condition))")
  testTree(parseBooleanExpression("(x and y)")["tree"], "Program(And(Condition, Condition))")
  testTree(parseBooleanExpression("(x OR y)")["tree"], "Program(Or(Condition, Condition))")
  testTree(parseBooleanExpression("(x AND y)")["tree"], "Program(And(Condition, Condition))")
  testTree(parseBooleanExpression("x y")["tree"], "Program(And(Condition, Condition))")
  testTree(parseBooleanExpression("x y z")["tree"], "Program(And(And(Condition, Condition), Condition))")
  testTree(parseBooleanExpression("x and y and z")["tree"], "Program(And(And(Condition, Condition), Condition))")
  testTree(parseBooleanExpression("x or y or z")["tree"], "Program(Or(Or(Condition, Condition), Condition))")

  // x and y or z ==> (x and y) or z
  testTree(parseBooleanExpression("x and y or z")["tree"], "Program(Or(And(Condition,Condition),Condition))")
  // x or y and z ==> x or (y or z)
  testTree(parseBooleanExpression("x or y and z")["tree"], "Program(Or(Condition,And(Condition,Condition)))")
  testTree(parseBooleanExpression("x or (y and z)")["tree"], "Program(Or(Condition,And(Condition,Condition)))")
  testTree(parseBooleanExpression("(x or y) and z")["tree"], "Program(And(Or(Condition,Condition),Condition))")
})

test("orgzly compiling", () => {
  const epochMs =  moment('2023-11-02 23:13:20').valueOf()
  const resolver = new ConditionResolverNode(epochMs)
  const orgzly = new Orgzly(settings, resolver)
  const { ir: intermediateRepr } = orgzly.compile("s.-2d c.tomorrow d.today")
  expect(intermediateRepr).toEqual({
    "and": [{
      "and": [
          [ {"evalDateStartOfDay": 'task.scheduled'}, "is", "le", {"duration": [-2, "d"]} ],
          [ {"evalDateStartOfDay": 'task.closed'}, "is", "eq", {"duration": [1, "d"]} ]
        ]
      },
      [ {"evalDateStartOfDay": 'task.deadline'}, "is", "le", {"duration": [0, "d"]} ]
    ]
  })
})

test("orgzly executing", () => {
  const epochMs =  moment('2023-11-02 23:13:20').valueOf()
  const resolver = new ConditionResolverNode(epochMs)
  const orgzly = new Orgzly(settings, resolver)
  const intermediateRepr: IntermediateRepr = {
    "and": [{
      "and": [
          [ {"evalDateStartOfDay": 'task.scheduled'}, "is", "le", {"duration": [-2, "d"]} ] as IntermediateRepr,
          [ {"evalDateStartOfDay": 'task.closed'}, "is", "eq", {"duration": [1, "d"]} ] as IntermediateRepr
        ]
      },
      [ {"evalDateStartOfDay": 'task.deadline'}, "is", "le", {"duration": [0, "d"]} ] as IntermediateRepr
    ]
  }
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
    closed: "<2023-11-03 Sat 18:27>",
    deadline: "<2021-07-15 Sun 14:25>",
    scheduled: "<2021-07-13 Fri 12:06>",
  }

  expect(orgzly.execute(
    intermediateRepr, [], null, [task]
  )).toStrictEqual({regularView: [task]})

  expect(orgzly.execute(
    intermediateRepr, [], null, [{...task, closed: "<2021-07-13 Fri 12:06>"}]
  )).toStrictEqual({regularView: []})
})

test("orgzly executing sorting", () => {
  const epochMs =  moment('2023-11-02 23:13:20').valueOf()
  const resolver = new ConditionResolverNode(epochMs)
  const orgzly = new Orgzly(settings, resolver)
  const intermediateRepr: IntermediateRepr = [ {"evalDateStartOfDay": 'task.deadline'}, "is", "le" as ExpOp, {"duration": [3, "d"]} ]
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
    closed: "<2023-11-03 Sat 18:27>",
    deadline: "<2021-07-15 Sun 14:25>",
    scheduled: "<2021-07-13 Fri 12:06>",
  }
  const task2 = {...task, deadline: "<2021-07-15 Sun 14:26>" }
  const task3 = {...task, deadline: "<2021-07-15 Sun 14:27>" }
  const task4 = {...task, deadline: "<2021-07-15 Sun 14:29>" } // out of order
  const task5 = {...task, deadline: "<2021-07-15 Sun 14:28>" }

  expect(orgzly.execute(
    intermediateRepr, ["+deadline"], null, [task, task2, task3, task4, task5]
  )).toStrictEqual({regularView: [
    task,
    task2,
    task3,
    task5,
    task4, // back in order
  ]})

  expect(orgzly.execute(
    intermediateRepr, ["-deadline"], null, [task, task2, task3, task4, task5]
  )).toStrictEqual({regularView: [
    task4, // back in order
    task5,
    task3,
    task2,
    task,
  ]})

})

test("orgzly agenda", () => {
  const epochMs =  moment('2023-11-02 23:13:20').valueOf()
  const resolver = new ConditionResolverNode(epochMs)
  const orgzly = new Orgzly(settings, resolver)

  const task: OrgmodeTask = {
    status: 'DONE',
    statusType: StatusType.DONE,
    description: 'task',
    priority: null,
    taskLocation: {
      priority: null,
      status: [2, 6],
      scheduled: [18, 39],
      closed: [49, 70],
      deadline: [82, 103],
    },
    closed: "",
    deadline: "",
    scheduled: "",
  }
  const task2 = {...task, description: "task2", deadline: "<2023-11-10 Thu 08:10>", scheduled: "2023-11-02 Thu 13:33>"}
  const task3 = {...task, description: "task3", scheduled: "<2023-11-01 Thu 14:29>"}
  const task4 = {...task, description: "task4", deadline: "<2023-11-03 Thu 15:02>"}
  expect(orgzly.createAgenda([task, task2, task3, task4], [], 3)).toEqual([
    {
      date: moment('2023-11-02').valueOf(),
      tasks: [
        { sortKey: "scheduled", task: task3 },
        { sortKey: "scheduled", task: task2 },
      ]
    },
    {
      date: moment('2023-11-03').valueOf(),
      tasks: [
        { sortKey: "deadline", task: task4 },
      ]
    },
    {
      date: moment('2023-11-04').valueOf(),
      tasks: [ ]
    },
  ])

  const taskWithoutTime = {...task, description: "task with time", scheduled: "<2023-11-02>"}
  const taskWithTime = {...task, description: "task without time", scheduled: "<2023-11-02 15:01>"}
  expect(orgzly.createAgenda([taskWithoutTime, taskWithTime], [], 3)).toEqual([
    {
      date: moment('2023-11-02').valueOf(),
      tasks: [
        { sortKey: "scheduled", task: taskWithTime },
        { sortKey: "scheduled", task: taskWithoutTime },
      ]
    },
    {
      date: moment('2023-11-03').valueOf(),
      tasks: [ ]
    },
    {
      date: moment('2023-11-04').valueOf(),
      tasks: [ ]
    },
  ])
})

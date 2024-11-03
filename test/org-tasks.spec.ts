import { expect, test } from 'vitest'
import { LRParser } from '@lezer/lr'

import { OrgmodeParser } from 'codemirror-lang-orgmode'

import { cycleOrgmodeTaskStatusContent, parseOrgmodeTasks } from 'org-tasks'
import { OrgmodePluginSettings } from 'settings'

const settings: OrgmodePluginSettings = {
  todoKeywords: ["TODO"],
  doneKeywords: ["DONE"],
  hideStars: false,
};
const words = [...settings.todoKeywords, ...settings.doneKeywords]
const orgmodeParser: LRParser = OrgmodeParser(words)

test('Parsing orgmode tasks', async () => {
  const content = "* TODO task description\n"
  const tasks = parseOrgmodeTasks(content, settings, orgmodeParser)
  expect(tasks[0]).toStrictEqual({
    status: 'TODO',
    statusType: 'TODO',
    description: 'task description',
    priority: null,
    taskLocation: {
      priority: null,
      status: [2, 6],
      closed: null,
      deadline: null,
      scheduled: null,
    },
    closed: null,
    deadline: null,
    scheduled: null,
  })
  const new_content = cycleOrgmodeTaskStatusContent(tasks[0], content)
  expect(new_content).toBe("* DONE task description\n")
  const new_tasks = parseOrgmodeTasks(new_content, settings, orgmodeParser)
  expect(new_tasks[0]).toStrictEqual({
    status: 'DONE',
    statusType: 'DONE',
    description: 'task description',
    priority: null,
    taskLocation: {
      priority: null,
      status: [2, 6],
      closed: null,
      deadline: null,
      scheduled: null,
    },
    closed: null,
    deadline: null,
    scheduled: null,
  })
})

test('Parsing orgmode tasks planning lines', async () => {
  const content = [
    "* TODO task description\n",
    "SCHEDULED: <2023-12-08 Fri 11:13> CLOSED: <2023-12-09 Sat 08:07> DEADLINE: <2023-12-10 Sun 13:28>\n",
  ].join("")
  const tasks = parseOrgmodeTasks(content, settings, orgmodeParser)
  console.log(tasks[0])
  expect(tasks[0]).toStrictEqual({
    status: 'TODO',
    statusType: 'TODO',
    description: 'task description',
    priority: null,
    taskLocation: {
      priority: null,
      status: [2, 6],
      closed: [66, 89],
      deadline: [99, 122],
      scheduled: [35, 58],
    },
    closed: "<2023-12-09 Sat 08:07>",
    deadline: "<2023-12-10 Sun 13:28>",
    scheduled: "<2023-12-08 Fri 11:13>",
  })
})

test('nested orgmode tasks', async () => {
  const content = [
    "* TODO task description 1",
    "** description 2",
    "*** TODO task description 3",
    "",
  ].join('\n')
  const tasks = parseOrgmodeTasks(content, settings, orgmodeParser)
  expect(tasks).toStrictEqual([
    {
      status: 'TODO',
      statusType: 'TODO',
      description: 'task description 1',
      priority: null,
      closed: null,
      deadline: null,
      scheduled: null,
      taskLocation: {
        priority: null,
        status: [2, 6],
        closed: null,
        deadline: null,
        scheduled: null,
      },
    },
    {
      status: null,
      statusType: null,
      description: "description 2",
      priority: null,
      closed: null,
      deadline: null,
      scheduled: null,
      taskLocation: {
        priority: null,
        status: null,
        closed: null,
        deadline: null,
        scheduled: null,
      },
    },
    {
      status: 'TODO',
      statusType: 'TODO',
      description: 'task description 3',
      priority: null,
      closed: null,
      deadline: null,
      scheduled: null,
      taskLocation: {
        priority: null,
        status: [47, 51],
        closed: null,
        deadline: null,
        scheduled: null,
      },
    }
  ])
  const new_content = cycleOrgmodeTaskStatusContent(tasks[2], content)
  expect(new_content).toBe([
    "* TODO task description 1",
    "** description 2",
    "*** DONE task description 3",
    "",
  ].join("\n"))
  const new_tasks = parseOrgmodeTasks(new_content, settings, orgmodeParser)
  expect(new_tasks[2]).toStrictEqual(
    {
      status: 'DONE',
      statusType: 'DONE',
      description: 'task description 3',
      priority: null,
      closed: null,
      deadline: null,
      scheduled: null,
      taskLocation: {
        priority: null,
        status: [47, 51],
        closed: null,
        deadline: null,
        scheduled: null,
      },
    },
  )
})

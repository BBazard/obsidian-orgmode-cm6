import { expect, test } from 'vitest'
import { LRParser } from '@lezer/lr'

import { OrgmodeParser } from 'codemirror-lang-orgmode'

import { cycleOrgmodeTaskStatusContent, parseOrgmodeTasks } from 'org-tasks'
import { OrgmodePluginSettings } from 'settings'

const settings: OrgmodePluginSettings = {
  todoKeywords: ["TODO"],
  doneKeywords: ["DONE"],
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
      status: [2, 6]
    },
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
      status: [2, 6]
    },
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
      taskLocation: {
        priority: null,
        status: [2, 6]
      },
    },
    {
      status: 'TODO',
      statusType: 'TODO',
      description: 'task description 3',
      priority: null,
      taskLocation: {
        priority: null,
        status: [47, 51]
      },
    }
  ])
  const new_content = cycleOrgmodeTaskStatusContent(tasks[1], content)
  expect(new_content).toBe([
    "* TODO task description 1",
    "** description 2",
    "*** DONE task description 3",
    "",
  ].join("\n"))
  const new_tasks = parseOrgmodeTasks(new_content, settings, orgmodeParser)
  expect(new_tasks[1]).toStrictEqual(
    {
      status: 'DONE',
      statusType: 'DONE',
      description: 'task description 3',
      priority: null,
      taskLocation: {
        priority: null,
        status: [47, 51]
      },
    },
  )
})

import { expect, test } from 'vitest'
import { LRParser } from '@lezer/lr'

import { OrgmodeParser } from 'codemirror-lang-orgmode'

import { cycleOrgmodeTaskStatusContent, parseOrgmodeContent } from 'org-tasks'
import { OrgmodePluginSettings } from 'settings'

const settings: OrgmodePluginSettings = {
  todoKeywords: ["TODO"],
  doneKeywords: ["DONE"],
};
const words = [...settings.todoKeywords, ...settings.doneKeywords]
const orgmodeParser: LRParser = OrgmodeParser(words)

test('Parsing orgmode tasks', async () => {
  const content = "* TODO task description\n"
  const tasks = parseOrgmodeContent(content, settings, orgmodeParser)
  expect(tasks[0]).toStrictEqual({
    status: 'TODO',
    statusType: 'TODO',
    description: 'task description',
    priority: null,
    taskLocation: {
      priority: null,
      status: [2, 6]
    },
    children: []
  })
  const new_content = cycleOrgmodeTaskStatusContent(tasks[0], content)
  expect(new_content).toBe("* DONE task description\n")
  const new_tasks = parseOrgmodeContent(new_content, settings, orgmodeParser)
  expect(new_tasks[0]).toStrictEqual({
    status: 'DONE',
    statusType: 'DONE',
    description: 'task description',
    priority: null,
    taskLocation: {
      priority: null,
      status: [2, 6]
    },
    children: []
  })
})

test('heading without a keyword or with unknown keyword are not tasks', async () => {
  const content = [
    "* task description",
    "* AAA task description",
    "",
  ].join('\n')
  const tasks = parseOrgmodeContent(content, settings, orgmodeParser)
  expect(tasks).toStrictEqual([])
})

test('nested orgmode tasks', async () => {
  const content = [
    "* TODO task description",
    "** TODO task description",
    "*** TODO task description",
    "",
  ].join('\n')
  const tasks = parseOrgmodeContent(content, settings, orgmodeParser)
  expect(tasks[0]).toStrictEqual({
    status: 'TODO',
    statusType: 'TODO',
    description: 'task description',
    priority: null,
    taskLocation: {
      priority: null,
      status: [2, 6]
    },
    children: [{
      status: 'TODO',
      statusType: 'TODO',
      description: 'task description',
      priority: null,
      taskLocation: {
        priority: null,
        status: [27, 31]
      },
      children: [{
        status: 'TODO',
        statusType: 'TODO',
        description: 'task description',
        priority: null,
        taskLocation: {
          priority: null,
          status: [53, 57]
        },
        children: []
      }]
    }]
  })
  const new_content = cycleOrgmodeTaskStatusContent(tasks[0], content)
  expect(new_content).toBe([
    "* DONE task description",
    "** TODO task description",
    "*** TODO task description",
    "",
  ].join("\n"))
  const new_tasks = parseOrgmodeContent(new_content, settings, orgmodeParser)
  expect(new_tasks[0]).toStrictEqual({
    status: 'DONE',
    statusType: 'DONE',
    description: 'task description',
    priority: null,
    taskLocation: {
      priority: null,
      status: [2, 6]
    },
    children: [{
      status: 'TODO',
      statusType: 'TODO',
      description: 'task description',
      priority: null,
      taskLocation: {
        priority: null,
        status: [27, 31]
      },
      children: [{
        status: 'TODO',
        statusType: 'TODO',
        description: 'task description',
        priority: null,
        taskLocation: {
          priority: null,
          status: [53, 57]
        },
        children: []
      }]
    }]
  })
})

import { expect, test } from 'vitest'
import { cycleOrgmodeTaskStatusContent, parseOrgmodeContent } from 'org-tasks'
import { DEFAULT_SETTINGS } from 'settings'

global.todoKeywords = DEFAULT_SETTINGS.todoKeywords
global.doneKeywords = DEFAULT_SETTINGS.doneKeywords

test('stuff', async () => {
  const content = "* TODO task description\n"
  const tasks = parseOrgmodeContent(content, DEFAULT_SETTINGS)
  expect(tasks[0]).toStrictEqual({
    status: 'TODO',
    statusType: 'TODO',
    description: 'task description',
    priority: null,
    taskLocation: {
      priority: null,
      status: [2, 6]
    }
  })
  const new_content = cycleOrgmodeTaskStatusContent(tasks[0], content)
  expect(new_content).toBe("* DONE task description\n")
  const new_tasks = parseOrgmodeContent(new_content, DEFAULT_SETTINGS)
  expect(new_tasks[0]).toStrictEqual({
    status: 'DONE',
    statusType: 'DONE',
    description: 'task description',
    priority: null,
    taskLocation: {
      priority: null,
      status: [2, 6]
    }
  })
})

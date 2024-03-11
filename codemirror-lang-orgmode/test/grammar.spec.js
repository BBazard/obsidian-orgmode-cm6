import {OrgmodeLanguage} from "../dist/index.js"
import {fileTests} from "@lezer/generator/dist/test"
import { test } from 'vitest'

import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from 'url';
let caseDir = path.dirname(fileURLToPath(import.meta.url))
global.todoKeywords = ["TODO", "LATER", "WAITING", "DEFERRED", "SOMEDAY", "PROJECT"]
global.doneKeywords = ["DONE", "CANCELLED"]

for (let fileName of fs.readdirSync(caseDir)) {
  if (!/\.txt$/.test(fileName)) continue

  let name = /^[^\.]*/.exec(fileName)[0]
  const file = fs.readFileSync(path.join(caseDir, fileName), "utf8")
  for (let { name, run } of fileTests(file, fileName))
    test(name, () => {
      return run(OrgmodeLanguage.parser)
    })
}

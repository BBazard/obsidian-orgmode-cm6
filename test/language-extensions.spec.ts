import { expect, test } from 'vitest'
import { LRParser } from '@lezer/lr'
import { EditorState } from "@codemirror/state";
import { LanguageSupport } from "@codemirror/language"

import { OrgmodeLanguage, OrgmodeParser } from 'codemirror-lang-orgmode';

import { OrgmodePluginSettings } from 'settings'
import { OrgFoldCompute, makeHeadingsFoldable } from 'language-extensions'

const settings: OrgmodePluginSettings = {
  todoKeywords: ["TODO"],
  doneKeywords: ["DONE"],
};
const words = [...settings.todoKeywords, ...settings.doneKeywords]
const orgmodeParser: LRParser = OrgmodeParser(words)

const foldRangeFromContent = (content: string, from: number, to: number) => {
  const state = EditorState.create({
    doc: content,
    extensions: [
      makeHeadingsFoldable,
      new LanguageSupport(OrgmodeLanguage(orgmodeParser))
    ],
  })
  return OrgFoldCompute(state, from, to)
}

test("heading alone doesn't fold", async () => {
  let content = "* title"
  expect(foldRangeFromContent(content, 0, 6)).toStrictEqual(null)
  content = "* title\n"
  expect(foldRangeFromContent(content, 0, 6)).toStrictEqual(null)
})

test("heading and section fold", async () => {
  let content = [
    "* title",
    "section",
  ].join("\n")
  expect(foldRangeFromContent(content, 0, 6)).toStrictEqual({"from": 6, "to": 15})
  content = [
    "* title",
    " ",
  ].join("\n")
  expect(foldRangeFromContent(content, 0, 6)).toStrictEqual({"from": 6, "to": 9})
})

test("zeroth section and heading doesn't fold", async () => {
  let content = [
    "section",
    "* title",
  ].join("\n")
  expect(foldRangeFromContent(content, 0, 6)).toStrictEqual(null)
  content = [
    "section",
    "* title",
  ].join("\n")
  expect(foldRangeFromContent(content, 0, 6)).toStrictEqual(null)
})

test("nested headings fold", async () => {
  let content = [
    "* title",
    "** title",
    "*** title",
  ].join("\n")
  expect(foldRangeFromContent(content, 0, 6)).toStrictEqual({"from": 6, "to": 26})
  content = [
    "* title",
    "** title",
    "section",
  ].join("\n")
  expect(foldRangeFromContent(content, 0, 6)).toStrictEqual({"from": 6, "to": 24})
})
import { expect, test } from 'vitest'
import { LRParser } from '@lezer/lr'
import { EditorState } from "@codemirror/state";
import { LanguageSupport } from "@codemirror/language"

import { OrgmodeLanguage, OrgmodeParser, TOKEN } from 'codemirror-lang-orgmode';

import { OrgmodePluginSettings } from 'settings'
import { OrgFoldCompute, iterateOrgIds, makeHeadingsFoldable } from 'language-extensions'
import { extractLinkFromNode } from 'language-extensions';

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

test("property drawer fold", async () => {
  let content = [
    "* title",
    ":PROPERTIES:",
    ":CREATED:  [2020-10-06 Tue 18:12]",
    ":END:",
  ].join("\n")
  expect(foldRangeFromContent(content, 8, 19)).toStrictEqual({"from": 19, "to": 60})

  // no fold on second line
  expect(foldRangeFromContent(content, 21, 53)).toStrictEqual(null)

  // no fold on third line
  expect(foldRangeFromContent(content, 55, 59)).toStrictEqual(null)
})


test("link handling", async () => {
  expect(
    extractLinkFromNode(TOKEN.PlainLink, "https://example.com")
  ).toStrictEqual(
    ["https://example.com", "https://example.com", "external"]
  )
  expect(
    extractLinkFromNode(TOKEN.PlainLink, "file:///file.org")
  ).toStrictEqual(
    ["file:///file.org", "file:///file.org", "external"]
  )
  expect(
    extractLinkFromNode(TOKEN.PlainLink, "file:///file.png")
  ).toStrictEqual(
    ["file:///file.png", "file:///file.png", "external"]
  )
  expect(
    extractLinkFromNode(TOKEN.PlainLink, "id:custom-id")
  ).toStrictEqual(
    ["custom-id", "id:custom-id", "internal-id"]
  )

  expect(
    extractLinkFromNode(TOKEN.AngleLink, "<file:file.org>")
  ).toStrictEqual(
    ["file.org", "file:file.org", "internal-file"]
  )
  expect(
    extractLinkFromNode(TOKEN.AngleLink, "<file:///my file.org>")
  ).toStrictEqual(
    ["file:///my file.org", "file:///my file.org", "external"]
  )
  expect(
    extractLinkFromNode(TOKEN.AngleLink, "<https://example.com>")
  ).toStrictEqual(
    ["https://example.com", "https://example.com", "external"]
  )
  expect(
    extractLinkFromNode(TOKEN.AngleLink, "<file:my file.png>")
  ).toStrictEqual(
    ["my file.png", null, "internal-inline-image"]
  )

  expect(
    extractLinkFromNode(TOKEN.RegularLink, "[[https://example.com][desc]]")
  ).toStrictEqual(
    ["https://example.com", "desc", "external"]
  )
  expect(
    extractLinkFromNode(TOKEN.RegularLink, "[[https://example.com]]")
  ).toStrictEqual(
    ["https://example.com", "https://example.com", "external"]
  )
  expect(
    extractLinkFromNode(TOKEN.RegularLink, "[[file:///my file.png]]")
  ).toStrictEqual(
    ["file:///my file.png", "file:///my file.png", "external"]
  )
  expect(
    extractLinkFromNode(TOKEN.RegularLink, "[[my file.org]]")
  ).toStrictEqual(
    ["my file.org", "my file.org", "internal-file"]
  )
  expect(
    extractLinkFromNode(TOKEN.RegularLink, "[[my file.png]]")
  ).toStrictEqual(
    ["my file.png", null, "internal-inline-image"]
  )
  expect(
    extractLinkFromNode(TOKEN.RegularLink, "[[my file.png][desc]]")
  ).toStrictEqual(
    ["my file.png", "desc", "internal-file"]
  )
})

test("iterating org IDs", async () => {
  let content = [
    ":PROPERTIES:",
    ":ID: 3500235a-67f2-4730-b01c-913b7ba7972a",
    ":END:"
  ].join("\n")
  expect(
    Array.from(iterateOrgIds(orgmodeParser, content))
  ).toStrictEqual([
    { orgId: "3500235a-67f2-4730-b01c-913b7ba7972a", start: 0 },
  ])

  content = [
    "* heading",
    ":PROPERTIES:",
    ":ID: idname",
    ":END:"
  ].join("\n")
  expect(
    Array.from(iterateOrgIds(orgmodeParser, content))
  ).toStrictEqual([
    { orgId: "idname", start: 0 },
  ])

  content = [
    "* heading",
    "** subheading",
    ":PROPERTIES:",
    ":ID: idname",
    ":END:"
  ].join("\n")
  expect(
    Array.from(iterateOrgIds(orgmodeParser, content))
  ).toStrictEqual([
    { orgId: "idname", start: 10 },
  ])

  content = [
    ":PROPERTIES:",
    ":ID: idfile",
    ":END:",
    "* heading",
    ":PROPERTIES:",
    ":ID: idheading",
    ":END:",
    "** subheading",
    ":PROPERTIES:",
    ":ID: idsubheading",
    ":END:"
  ].join("\n")
  expect(
    Array.from(iterateOrgIds(orgmodeParser, content))
  ).toStrictEqual([
    { orgId: "idfile", start: 0 },
    { orgId: "idheading", start: 31 },
    { orgId: "idsubheading", start: 75 },
  ])
})
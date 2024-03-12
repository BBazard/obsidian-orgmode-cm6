import { OrgmodeLanguage } from "../dist/index.js"
import { testTree } from "@lezer/generator/dist/test"
import { test } from 'vitest'

global.todoKeywords = ["TODO", "LATER", "WAITING", "DEFERRED", "SOMEDAY", "PROJECT"]
global.doneKeywords = ["DONE", "CANCELLED"]

test("simple case", () => {
  const tree = OrgmodeLanguage.parser.parse([
    "* TODO item 1",
    "content",
    "* TODO item 2",
    "",
    "content",
    "",
    "* TODO item 3",
  ].join("\n"))
  const spec = [
    "Program(",
    "    Block(Heading(TodoKeyword, Title), Section),",
    "    Block(Heading(TodoKeyword, Title), Section),",
    "    Block(Heading(TodoKeyword, Title)),",
    ")",
  ].join("\n")
  testTree(tree, spec)
})

test("zeroth section not in a block", () => {
  const tree = OrgmodeLanguage.parser.parse([
    "some text",
    "* TODO item 1",
    "content",
  ].join("\n"))
  const spec = [
    "Program(",
    "    Section,",
    "    Block(Heading(TodoKeyword, Title),Section)",
    ")",
  ].join("\n")
  testTree(tree, spec)
})

test("zeroth PropertyDrawer possible", () => {
  const tree = OrgmodeLanguage.parser.parse([
    ":PROPERTIES:",
    ":CREATED:  [2020-10-06 Tue 18:12]",
    ":END:",
    "weofij",
  ].join("\n"))
  const spec = [
    "Program(PropertyDrawer, Section)",
  ].join("\n")
  testTree(tree, spec)
})

test("deadline and scheduled", () => {
  const tree = OrgmodeLanguage.parser.parse([
    "* TODO heading1",
    "DEADLINE: deadline",
    "SCHEDULED: scheduled",
    ":PROPERTIES:",
    "some properties",
    ":END:",
    "some content",
    "DEADLINE: part of content",
    "* TODO heading2",
  ].join("\n"))
  const spec = [
    "Program(",
    "    Block(Heading(TodoKeyword, Title), Planning, Planning, PropertyDrawer, Section),",
    "    Block(Heading(TodoKeyword, Title)),",
    ")",
  ].join("\n")
  testTree(tree, spec)
})

test("PropertyDrawer trailing characters", () => {
  const tree = OrgmodeLanguage.parser.parse([
    "* TODO title",
    ":PROPERTIES: ignored",
    ":CREATED:  [2020-10-06 Tue 18:12]",
    ":END: ignored",
    "",
    "modele 2018921",
  ].join("\n"))
  const spec = [
    "Program(",
    "    Block(Heading(TodoKeyword, Title), PropertyDrawer, Section),",
    ")",
  ].join("\n")
  testTree(tree, spec)
})

test("Heading", () => {
  const tree = OrgmodeLanguage.parser.parse([
    "* TODO item1",
    "# comment",
    "** TODO subitem :tag1:",
    "** subitem",
  ].join("\n"))
  const spec = [
    "Program(",
    "    Block(Heading(TodoKeyword, Title), Comment),",
    "    Block(Heading(TodoKeyword, Title, Tags)),",
    "    Block(Heading(Title)),",
    ")",
  ].join("\n")
  testTree(tree, spec)
})

test("Heading edge cases", () => {
  const tree = OrgmodeLanguage.parser.parse([
    "** [#a] [#a] subitem",
    "** TODO TODO subitem",
  ].join("\n"))
  const spec = [
    "Program(",
    "    Block(Heading(Priority, Title)),",
    "    Block(Heading(TodoKeyword, Title)),",
    ")",
  ].join("\n")
  testTree(tree, spec)
})

test("another edge cases", () => {
  const tree = OrgmodeLanguage.parser.parse([
    "* TODO stuff [#a] stuff :tag:",
    "* [#a] stuff TODO stuff :tag:",
  ].join("\n"))
  const spec = [
    "Program(",
    "    Block(Heading(TodoKeyword, Title, Tags)),",
    "    Block(Heading(Priority, Title, Tags)),",
    ")",
  ].join("\n")
  testTree(tree, spec)
})

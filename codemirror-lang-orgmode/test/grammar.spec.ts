import { LRParser } from '@lezer/lr';
import { testTree } from "@lezer/generator/dist/test"
import { test } from 'vitest'
import { printTree } from './print-lezer-tree';

import { OrgmodeParser } from 'codemirror-lang-orgmode'
import { OrgmodePluginSettings } from 'settings';

const settings: OrgmodePluginSettings = {
  todoKeywords: ["TODO"],
  doneKeywords: ["DONE"],
};
const words = [...settings.todoKeywords, ...settings.doneKeywords]
const parser: LRParser = OrgmodeParser(words)

test("simple case", () => {
  const content = [
    "* TODO item 1",
    "content",
    "* TODO item 2",
    "",
    "content",
    "",
    "* TODO item 3",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    Block(Heading(TodoKeyword, Title), Section),",
    "    Block(Heading(TodoKeyword, Title), Section),",
    "    Block(Heading(TodoKeyword, Title)),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("zeroth section not in a block", () => {
  const content = [
    "some text",
    "* TODO item 1",
    "content",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    ZerothSection,",
    "    Block(Heading(TodoKeyword, Title),Section)",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("zeroth PropertyDrawer possible", () => {
  const content = [
    ":PROPERTIES:",
    ":CREATED:  [2020-10-06 Tue 18:12]",
    ":END:",
    "weofij",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(ZerothSection(PropertyDrawer))",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("deadline and scheduled", () => {
  const content = [
    "* TODO heading1",
    "DEADLINE: deadline",
    "SCHEDULED: scheduled",
    ":PROPERTIES:",
    "some properties",
    ":END:",
    "some content",
    "DEADLINE: part of content",
    "* TODO heading2",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    Block(Heading(TodoKeyword, Title), Section(Planning, Planning, PropertyDrawer)),",
    "    Block(Heading(TodoKeyword, Title)),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("PropertyDrawer trailing characters", () => {
  const content = [
    "* TODO title",
    ":PROPERTIES: ignored",
    ":CREATED:  [2020-10-06 Tue 18:12]",
    ":END: ignored",
    "",
    "modele 2018921",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    Block(Heading(TodoKeyword, Title), Section(PropertyDrawer)),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("Heading", () => {
  const content = [
    "* TODO item1",
    "# comment",
    "** TODO subitem :tag1:",
    "** subitem",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    Block(Heading(TodoKeyword, Title), Section(CommentLine)),",
    "    Block(Heading(TodoKeyword, Title, Tags)),",
    "    Block(Heading(Title)),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("Heading edge cases", () => {
  const content = [
    "** [#a] [#a] subitem",
    "** TODO TODO subitem",
    "** TODOC",
    "* ",
    "not a heading",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    Block(Heading(Priority, Title)),",
    "    Block(Heading(TodoKeyword, Title)),",
    "    Block(Heading(Title)),",
    "    Block(Heading(Title), Section),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("another edge cases", () => {
  const content = [
    "* TODO stuff [#a] stuff :tag:",
    "* [#a] stuff TODO stuff :tag:",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    Block(Heading(TodoKeyword, Title, Tags)),",
    "    Block(Heading(Priority, Title, Tags)),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("leading star in first line of section", () => {
  const content = [
    "* heading",
    "*not a heading",
    "end of section",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    Block(Heading(Title), Section),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("leading star in zeroth section", () => {
  const content = [
    "abc",
    "*not a heading",
    "* heading",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    ZerothSection",
    "    Block(Heading(Title)),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("no heading in a comment", () => {
  const content = [
    "* heading",
    "start of section",
    "# not a heading",
    "end of section",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    Block(Heading(Title), Section(CommentLine)),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("no tags outside headings", () => {
  const content = [
    "* heading :tag:eowifj:owijef@:",
    "start of section :notag:",
    ":notag:",
    "end of section",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    Block(Heading(Title, Tags), Section),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("no priority outside headings", () => {
  const content = [
    "* [#A] heading",
    "start of section",
    "[#A]",
    " [#A]",
    "*[#A]",
    "end of section",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    Block(Heading(Priority, Title), Section),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("text markup", () => {
  const content = [
    "my *bold* word",
    "bold ** star ***",
    "some *bold encompassing",
    "two lines* here",
    "*terminating on the next line",
    "*",  // not a heading
    "*terminating before header",
    "* ",  // heading
    "**",
    "now *unfinished",
    "  ",  // blank line
    "*bold with a * inside*",
    "**bold***",
    "",
    "*star*inside*",
    "some *interruption",
    "# by a",
    "comment*",
    "",
    "xxx *a b* xxx",
    "and *unfinished before eof",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    ZerothSection(",
    "        TextBold,",  // *bold*
    "        TextBold,",  // ***
    "        TextBold),",  // *bold encompassing\ntwo lines*
    "    Block(Heading(Title), Section(",
    "        TextBold,",  // *bold with a * inside*
    "        TextBold,",  // **bold***
    "        TextBold,",  // *start*inside*
    "        CommentLine,",  // # by a\n
    "        TextBold,",  // *a b*
    "    )),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("infinite loop testing", () => {
  parser.parse("")
  parser.parse("*")
  parser.parse("* ")
  parser.parse("\n")
})
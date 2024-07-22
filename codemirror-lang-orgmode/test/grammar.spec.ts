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
    "    Heading(TodoKeyword, Title, Section),",
    "    Heading(TodoKeyword, Title, Section),",
    "    Heading(TodoKeyword, Title),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("nested heading", () => {
  const content = [
    "** item",
    "content",
    "* TODO item 2",
    "",
    "content",
    "",
    "*** [#A] item",
    "**** item",
    "** item",
    "* [#A] item",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    Heading(Title, Section),",
    "    Heading(TodoKeyword, Title, Section,",
    "        Heading(Priority, Title,",
    "            Heading(Title),",
    "        ),",
    "        Heading(Title),",
    "    ),",
    "    Heading(Priority, Title),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("zeroth section not in a heading", () => {
  const content = [
    "some text",
    "* TODO item 1",
    "content",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    ZerothSection,",
    "    Heading(TodoKeyword, Title, Section)",
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

test("planning", () => {
  const content = [
    "* TODO heading1",
    "DEADLINE: deadline ",
    "SCHEDULED: scheduled",
    "SCHEDULED: scheduled1 SCHEDULED: scheduled2",
    "SCHEDULED: <2020-10-29 Thu 10:0>SCHEDULED: <2020-10-29 Thu 10:00>",
    "SCHEDULED:",
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
    "    Heading(TodoKeyword, Title,",
    "        Section(",
    "            PlanningDeadline, PlanningValue",
    "            PlanningScheduled, PlanningValue",
    "            PlanningScheduled, PlanningValue",
    "            PlanningScheduled, PlanningValue",
    "            PlanningScheduled, PlanningValue",
    "            PlanningScheduled, PlanningValue",
    "            PropertyDrawer",
    "            )",
    "        ),",
    "    Heading(TodoKeyword, Title),",
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
    "    Heading(TodoKeyword, Title, Section(PropertyDrawer)),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("Heading", () => {
  const content = [
    "* TODO item1",
    "* TODO [#A] item1",
    "# comment",
    "** TODO subitem :tag1:",
    "** subitem",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    Heading(TodoKeyword, Title),",
    "    Heading(TodoKeyword, Priority, Title, Section(CommentLine),",
    "        Heading(TodoKeyword, Title, Tags),",
    "        Heading(Title),",
    "    ),",
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
    "    Heading(Priority, Title),",
    "    Heading(TodoKeyword, Title),",
    "    Heading(Title),",
    "    Heading(Title, Section),",
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
    "    Heading(TodoKeyword, Title, Tags),",
    "    Heading(Priority, Title, Tags),",
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
    "    Heading(Title, Section),",
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
    "    Heading(Title),",
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
    "    Heading(Title, Section(CommentLine)),",
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
    "    Heading(Title, Tags, Section),",
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
    "    Heading(Priority, Title, Section),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("block", () => {
  const content = [
    "#+BEGIN_COMMENT",
    "several lines",
    "with [[links]]",
    "and *markup* that",
    "are not tokenized",
    "#+END_COMMENT",
    "#+BEGIN_SRC",
    "mismatched block",
    "#+END_EXPORT",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    ZerothSection(",
    "        Block,",
    "        KeywordComment,",
    "        KeywordComment,",
    "    ),",
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
    "    Heading(Title, Section(",
    "        TextBold,",  // *bold with a * inside*
    "        TextBold,",  // **bold***
    "        TextBold,",  // *start*inside*
    "        CommentLine,",  // # by a\n
    "        TextBold),",  // *a b*
    "    ),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("text markup nested", () => {
  const content = [
    "a *bold sentence wih /italic/ inside*",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    ZerothSection(",
    "        TextBold(",  // *bold sentence wih /italic/ inside*
    "            TextItalic,",  // /italic/
    "        ),",
    "    ),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("text markup criss-cross, different from emacs to form a tree", () => {
  const content = "*one _two three* four_"
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    ZerothSection(",
    "        TextBold,",  // *one _two three*
    "    )",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})


test("title text markup", () => {
  const content = [
    "* normal title",
    "* normal *bold* :tag:",
    "* normal *bold* title :tag:",
    "* normal *bold*",
    "* normal *unfinished",
    "bold*",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    Heading(",
    "        Title),",
    "    Heading(",
    "        Title(TextBold), Tags),",
    "    Heading(",
    "        Title(TextBold), Tags),",
    "    Heading(",
    "        Title(TextBold)),",
    "    Heading(",
    "        Title, Section),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("links", () => {
  const content = [
    "text with [[regular link]] inside",
    "[[link][description]] ",
    "[[link with *markup* inside]]",
    "[[broken [ link]]]",
    "[[broken ] link]]]",
    "[[broken ] broken][link]]]",
    "[[broken [ broken][link]]]",
    "https://plainlink",
    "<https:angle link>>",
    "<https:angle link with a",
    "newline inside>>",
    "<https:broken angle link with a",
    "",
    "blank line inside>>",
    "id:custom-id",
    "<id:custom-id>",
    "[[id:custom-id]]",
    "[[id:custom-id][id link]]",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    ZerothSection(",
    "        RegularLink,",  // [[regular link]]
    "        RegularLink,",  // [[link][description]]
    "        RegularLink(",  // [[link with *markup* inside]]
    "            TextBold,",  // *markup*
    "        ),",
    "        PlainLink,",  // https://plainlink
    "        AngleLink,",  // <https:angle link>
    "        AngleLink,",  // <https:angle link with a\nnewline inside>
    "        PlainLink,",  // id:custom-id
    "        AngleLink,",  // <id:custom-id>
    "        RegularLink,",  // [[id:custom-id]]
    "        RegularLink,",  // [[id:custom-id][id link]]
    "    ),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("link/markup double nesting", () => {
  const content = [
    "section [[start link *start markup end link]] end markup* x",
    "",
    "section *start markup [[start link end markup* end link]] x",
    "",
    "section *start markup [[start link end markup* end link]] end markup* x",
    "",
    "section *start markup [[start link *markup* end link]] end markup* x",
    "",
    "section [[start link *start markup [[link]] end markup* end link]] x",
    "",
    "* header [[start link *start markup end link]] end markup* x",
    "",
    "* header *start markup [[start link end markup* end link]] x",
    "",
    "* header *start markup [[start link *markup* end link]] end markup* x",
    "",
    "* header [[start link *start markup [[link]] end markup* end link]] x",
    "",
    "section <https://start link *start markup end link> end markup* x",
    "",
    "section *start markup <https://start link end markup* end link> x",
    "",
    "section *start markup <https://start link *markup* end link> end markup* x",
    "",
    "section <https://start link *start markup <https://link> end markup* end link> x",
    "",
    "* header <https://start link *start markup end link> end markup* x",
    "",
    "* header *start markup <https://start link end markup* end link> x",
    "",
    "* header *start markup <https://start link *markup* end link> end markup* x",
    "",
    "* header <https://start link *start markup <https://link> end markup* end link> x",
    "",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    ZerothSection(",
    "        RegularLink,",  // [[start link *start markup end link]]
    "        RegularLink,",  // [[start link end markup* end link]]
    "        TextBold(",  // *start markup [[start link end markup* end link]] end markup*
    "            RegularLink,",  // [[start link end markup* end link]]
    "        ),",
    "        TextBold(",  // *start markup [[start link *markup* end link]] end markup*
    "            RegularLink,",  // [[start link *markup* end link]]
    "        ),",
    "        TextBold(",  // *start markup [[link]] end markup*
    "            RegularLink,",  // [[link]]
    "        ),",
    "    ),",
    "    Heading(",
    "        Title(",
    "            RegularLink,",  // [[start link *start markup end link]]
    "        ),",
    "        Section,",  // \n
    "    ),",
    "    Heading(",
    "        Title(",
    "            RegularLink,",  // [[start link end markup* end link]]
    "        ),",
    "        Section,",  // \n
    "    ),",
    "    Heading(",
    "        Title(",
    "            TextBold(",  // *start markup [[start link *markup* end link]] end markup*
    "                RegularLink,",  // [[start link *markup* end link]]
    "            ),",
    "        ),",
    "        Section,",  // \n
    "    ),",
    "    Heading(",
    "        Title(",
    "            TextBold(",  // *start markup [[link]] end markup*
    "                RegularLink,",  // [[link]]
    "            ),",
    "        ),",
    "        Section(",
    "            AngleLink,",  // <https://start link *start markup end link>
    "            AngleLink,",  // <https://start link end markup* end link>
    "            TextBold(",  // *start markup <https://start link *markup* end link> end markup*
    "                AngleLink,",  // <https://start link *markup* end link>
    "            ),",
    "            AngleLink,",  // <https://start link *start markup <https://link>
    "        ),",
    "    ),",
    "    Heading(",
    "        Title(",
    "            AngleLink,",  // <https://start link *start markup end link>
    "        ),",
    "        Section,",  // \n
    "    ),",
    "    Heading(",
    "        Title(",
    "            AngleLink,",  // <https://start link end markup* end link>
    "        ),",
    "        Section,",  // \n
    "    ),",
    "    Heading(",
    "        Title(",
    "            TextBold(",  // *start markup <https://start link *markup* end link> end markup*
    "                AngleLink,",  // <https://start link *markup* end link>
    "            ),",
    "        ),",
    "        Section,",  // \n
    "    ),",
    "    Heading(",
    "        Title(",
    "            AngleLink,",  // <https://start link *start markup <https://link>
    "        )",
    "    )",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("pathplain", () => {
  const content = [
    "id:)",
    "id:(",
    "id:normal",
    "id:with(paren)",
    "id:unfinished(paren",
    "id:early)finish",
    "id:twin(paren)(paren)",
    "id:several(paren)in(a)row",
    "id:nested(paren(x))",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    ZerothSection(",
    "        PlainLink,",  // id:normal
    "        PlainLink,",  // id:with(paren)
    "        PlainLink,",  // id:unfinished
    "        PlainLink,",  // id:early
    "        PlainLink,",  // id:twin(paren)(paren)
    "        PlainLink,",  // id:several(paren)in(a)row
    "        PlainLink,",  // id:nested(paren(x))
    "    ),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("inline pathplain", () => {
  const content = [
    "xxx:id:yyy",
    "(id:hoo)",
    "*id:boldlink*",
    "/https://italic_url/",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    ZerothSection(",
    "        PlainLink,",  // id:yyy
    "        PlainLink,",  // id:hoo
    "        TextBold(",
    "            PlainLink,",  // id:boldlink
    "        ),",
    "        TextItalic(",
    "            PlainLink,",  // https://italic_url
    "        ),",
    "    ),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("title with links", () => {
  const content = [
    "* heading with [[link]] inside",
    "* [[link]]",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    Heading(",
    "        Title(",
    "            RegularLink,",  // [[link]]
    "        ),",
    "    ),",
    "    Heading(",
    "        Title(",
    "            RegularLink,",  // [[link]]
    "        ),",
    "    ),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("inline markup", () => {
  const content = [
    "(*bold1*){*bold2*}\"*bold3*\"'*bold4*'-*bold5*-",
    "*bold6*, *bold7*? *bold8*!",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    ZerothSection(",
    "        TextBold,",  // *bold1*
    "        TextBold,",  // *bold2*
    "        TextBold,",  // *bold3*
    "        TextBold,",  // *bold4*
    "        TextBold,",  // *bold5*
    "        TextBold,",  // *bold6*
    "        TextBold,",  // *bold7*
    "        TextBold,",  // *bold8*
    "    ),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("inline links", () => {
  const content = [
    "(id:custom-id)",
    "x id:custom-id x",
    "x[[file]]x",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    ZerothSection(",
    "        PlainLink,",  // id:custom-id
    "        PlainLink,",  // id:custom-id
    "        RegularLink,",  // file
    "    ),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("markup inside links", () => {
  const content = [
    "[[x *bold* x]]",
    "<https://url *with* spaces>",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    ZerothSection(",
    "        RegularLink(",  // [[x *bold* x]]
    "            TextBold,",  // *bold*
    "        ),",
    "        AngleLink(",  // <https://url *with* spaces>
    "            TextBold,",  // *with*
    "        ),",
    "    ),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("link inside markup", () => {
  const content = [
    "*[[link]]*",
    "*<https://url>*",
    "*x[[link]]x*",
    "*x<https://url>x*",
    "*[[x]]*y*",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    ZerothSection(",
    "        TextBold(",
    "            RegularLink,",  // [[link]]
    "        ),",
    "        TextBold(",
    "            AngleLink,",  // <https://url>
    "        ),",
    "        TextBold(",
    "            RegularLink,",  // [[link]]
    "        ),",
    "        TextBold(",
    "            AngleLink,",  // <https://url>
    "        ),",
    "        TextBold(",  // *[[x]]*y*
    "            RegularLink,",  // [[x]]
    "        ),",
    "    ),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("emacs weird case", () => {
  const content = [
    "*b*[[l]]*",
    "*[[l]]*b*",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    ZerothSection(",
    "        TextBold,",  // *b*
    "        RegularLink,",  // [[l]]
    "        TextBold(",  // *[[l]]*b*
    "            RegularLink,",  // [[l]]
    "        ),",
    "    ),",
    ")",
  ].join("\n")
  console.log(printTree(tree, content))
  parser.configure({strict: true}).parse(content)
  testTree(tree, spec)
})

test("links with surrounding spaces are links", () => {
  const content = [
    "[[ link ]]",
    "[[link ]]",
    "[[ link]]",
  ].join("\n")
  const tree = parser.parse(content)
  const spec = [
    "Program(",
    "    ZerothSection(",
    "        RegularLink,",  // [[ link ]]
    "        RegularLink,",  // [[link ]]
    "        RegularLink,",  // [[ link]]
    "    ),",
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

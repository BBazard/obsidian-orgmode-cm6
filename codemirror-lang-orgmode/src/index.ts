import { LRLanguage } from "@codemirror/language"
import { styleTags, tags } from "@lezer/highlight"
import { BuildOptions, buildParser } from '@lezer/generator';
import { LRParser } from "@lezer/lr";
import {
  title_tokenizer, todokeyword_tokenizer, plainLink_tokenizer,
  isStartOfRegularLink_lookaround, isStartOfAngleLink_lookaround,
  sectionWord_tokenizer, titleWord_tokenizer,
  sectionWordBold_tokenizer, sectionWordItalic_tokenizer, sectionWordUnderline_tokenizer,
  sectionWordVerbatim_tokenizer, sectionWordCode_tokenizer, sectionWordStrikeThrough_tokenizer,
  context_tracker } from "./external-tokens"
import * as ExtToken from "./external-tokens"
import { grammarFile } from "./generated_grammar";

export const orgLinkParameters = [
  // "shell",
  // "news",
  "mailto",
  "https",
  "http",
  // "ftp",
  // "help",
  "file",
  // "elisp",
  "id",
]

const configurableExternalTokenizer = (words: string[]) => {
  return (name: string, terms: { [name: string]: number }) => {
    if (name == 'title_tokenizer') {
      return title_tokenizer(words)
    }
    if (name == 'todokeyword_tokenizer') {
      return todokeyword_tokenizer(words)
    }
    if (name == 'isStartOfRegularLink_lookaround') {
      return isStartOfRegularLink_lookaround(orgLinkParameters)
    }
    if (name == 'isStartOfAngleLink_lookaround') {
      return isStartOfAngleLink_lookaround(orgLinkParameters)
    }
    if (name == 'plainLink_tokenizer') {
      return plainLink_tokenizer(orgLinkParameters)
    }
    if (name == 'sectionWord_tokenizer') {
      return sectionWord_tokenizer(orgLinkParameters)
    }
    if (name == 'titleWord_tokenizer') {
      return titleWord_tokenizer(orgLinkParameters)
    }
    if (name == 'sectionWordBold_tokenizer') {
      return sectionWordBold_tokenizer(orgLinkParameters)
    }
    if (name == 'sectionWordItalic_tokenizer') {
      return sectionWordItalic_tokenizer(orgLinkParameters)
    }
    if (name == 'sectionWordUnderline_tokenizer') {
      return sectionWordUnderline_tokenizer(orgLinkParameters)
    }
    if (name == 'sectionWordVerbatim_tokenizer') {
      return sectionWordVerbatim_tokenizer(orgLinkParameters)
    }
    if (name == 'sectionWordCode_tokenizer') {
      return sectionWordCode_tokenizer(orgLinkParameters)
    }
    if (name == 'sectionWordStrikeThrough_tokenizer') {
      return sectionWordStrikeThrough_tokenizer(orgLinkParameters)
    }
    return ExtToken[name as keyof typeof ExtToken]
  }
}

export const OrgmodeParser = (words: string[]) => {
  const options: BuildOptions = {
    externalTokenizer: configurableExternalTokenizer(words),
    contextTracker: context_tracker,
  }
  return buildParser(grammarFile.toString(), options)
}

export const OrgmodeLanguage = (parser: LRParser) => {
  return LRLanguage.define({
    parser: parser.configure({
      props: [
        styleTags({
          "Heading": tags.heading,
          "Planning": tags.annotation,
          "PropertyDrawer": tags.meta,
          "ZerothSection": tags.content,
          "Section": tags.content,
          "CommentLine": tags.lineComment,
          "KeywordComment": tags.lineComment,
          "TodoKeyword": tags.keyword,
          "Title": tags.contentSeparator,
          "Priority": tags.unit,
          "Tags": tags.tagName,
          "TextBold": tags.strong,
          "TextItalic": tags.emphasis,
          "TextUnderline": tags.modifier,
          "TextVerbatim": tags.literal,
          "TextCode": tags.monospace,
          "TextStrikeThrough": tags.strikethrough,
          "PlainLink": tags.link,
          "RegularLink": tags.link,
          "AngleLink": tags.link,
        })
      ]
    }),
    languageData: {
      commentTokens: { line: "#" }
    }
  })
}
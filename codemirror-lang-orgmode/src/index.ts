import { LRLanguage } from "@codemirror/language"
import { styleTags, tags } from "@lezer/highlight"
import { BuildOptions, buildParser } from '@lezer/generator';
import { LRParser } from "@lezer/lr";
import {
  propertydrawer_tokenizer,
  title_tokenizer,
  todokeyword_tokenizer,
  sectionline_tokenizer,
  endofline_tokenizer,
  sectionlineexcludingpropertydrawer_tokenizer,
  sectionlineexcludingpropertydrawerandplanning_tokenizer,
  planning_line_tokenizer,
} from "./external-tokens"
import { grammarFile } from "./generated_grammar";

const configurableExternalTokenizer = (words: string[]) => {
  return (name: string, terms: { [name: string]: number }) => {
    if (name == 'propertydrawer_tokenizer') {
      return propertydrawer_tokenizer
    }
    if (name == 'title_tokenizer') {
      return title_tokenizer(words)
    }
    if (name == 'todokeyword_tokenizer') {
      return todokeyword_tokenizer(words)
    }
    if (name == 'sectionline_tokenizer') {
      return sectionline_tokenizer
    }
    if (name == 'endofline_tokenizer') {
      return endofline_tokenizer
    }
    if (name == 'sectionlineexcludingpropertydrawerandplanning_tokenizer') {
      return sectionlineexcludingpropertydrawerandplanning_tokenizer
    }
    if (name == 'sectionlineexcludingpropertydrawer_tokenizer') {
      return sectionlineexcludingpropertydrawer_tokenizer
    }
    if (name == 'planning_line_tokenizer') {
      return planning_line_tokenizer
    }
    throw new Error("Undefined external tokenizer " + name)
  }
}

export const OrgmodeParser = (words: string[]) => {
  const options: BuildOptions = {
    externalTokenizer: configurableExternalTokenizer(words)
  }
  return buildParser(grammarFile.toString(), options)
}

export const OrgmodeLanguage = (parser: LRParser) => {
  return LRLanguage.define({
    parser: parser.configure({
      props: [
        styleTags({
          "Block": tags.atom,
          "Heading": tags.heading,
          "Planning": tags.annotation,
          "PropertyDrawer": tags.meta,
          "ZerothSection": tags.content,
          "Section": tags.content,
          "CommentLine": tags.lineComment,
          "TodoKeyword": tags.keyword,
          "Title": tags.contentSeparator,
          "Priority": tags.unit,
          "Tags": tags.tagName,
        })
      ]
    }),
    languageData: {
      commentTokens: { line: "#" }
    }
  })
}
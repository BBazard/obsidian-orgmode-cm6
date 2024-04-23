import { LRLanguage } from "@codemirror/language"
import { styleTags, tags } from "@lezer/highlight"
import { BuildOptions, buildParser } from '@lezer/generator';
import { LRParser } from "@lezer/lr";
import {
  propertydrawer_tokenizer,
  title_tokenizer,
  todokeyword_tokenizer,
  section_tokenizer,
  endofline_tokenizer,
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
    if (name == 'section_tokenizer') {
      return section_tokenizer
    }
    if (name == 'endofline_tokenizer') {
      return endofline_tokenizer
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
          "Section": tags.content,
          "Comment": tags.lineComment,
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
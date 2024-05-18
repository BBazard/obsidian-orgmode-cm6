import { LRLanguage } from "@codemirror/language"
import { styleTags, tags } from "@lezer/highlight"
import { BuildOptions, buildParser } from '@lezer/generator';
import { LRParser } from "@lezer/lr";
import {
  propertydrawer_tokenizer,
  title_tokenizer,
  todokeyword_tokenizer,
  endofline_tokenizer,
  notStartOfPropertyDrawer_lookaround,
  notStartOfPlanning_lookaround,
  notStartOfHeading_lookaround,
  notStartOfComment_lookaround,
  sectionWord_tokenizer,
  sectionSpace_tokenizer,
  sectionEnd_tokenizer,
  textBold_tokenizer,
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
    if (name == 'endofline_tokenizer') {
      return endofline_tokenizer
    }
    if (name == 'notStartOfPlanning_lookaround') {
      return notStartOfPlanning_lookaround
    }
    if (name == 'notStartOfPropertyDrawer_lookaround') {
      return notStartOfPropertyDrawer_lookaround
    }
    if (name == 'notStartOfHeading_lookaround') {
      return notStartOfHeading_lookaround
    }
    if (name == 'notStartOfComment_lookaround') {
      return notStartOfComment_lookaround
    }
    if (name == 'sectionWord_tokenizer') {
      return sectionWord_tokenizer
    }
    if (name == 'sectionSpace_tokenizer') {
      return sectionSpace_tokenizer
    }
    if (name == 'sectionEnd_tokenizer') {
      return sectionEnd_tokenizer
    }
    if (name == 'textBold_tokenizer') {
      return textBold_tokenizer
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
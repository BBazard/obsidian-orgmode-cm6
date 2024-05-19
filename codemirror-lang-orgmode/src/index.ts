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
  sectionWordBold_tokenizer,
  sectionWordItalic_tokenizer,
  sectionWordUnderline_tokenizer,
  sectionWordVerbatim_tokenizer,
  sectionWordCode_tokenizer,
  sectionWordStrikeThrough_tokenizer,
  isStartOfTextBold_lookaround,
  isStartOfTextItalic_lookaround,
  isStartOfTextUnderline_lookaround,
  isStartOfTextVerbatim_lookaround,
  isStartOfTextCode_lookaround,
  isStartOfTextStrikeThrough_lookaround,
  titleWord_tokenizer,
  tags_tokenizer,
  isStartOfTitleTextBold_lookaround,
  isStartOfTitleTextItalic_lookaround,
  isStartOfTitleTextUnderline_lookaround,
  isStartOfTitleTextVerbatim_lookaround,
  isStartOfTitleTextCode_lookaround,
  isStartOfTitleTextStrikeThrough_lookaround,
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
    if (name == 'sectionWordBold_tokenizer') {
      return sectionWordBold_tokenizer
    }
    if (name == 'sectionWordItalic_tokenizer') {
      return sectionWordItalic_tokenizer
    }
    if (name == 'sectionWordUnderline_tokenizer') {
      return sectionWordUnderline_tokenizer
    }
    if (name == 'sectionWordVerbatim_tokenizer') {
      return sectionWordVerbatim_tokenizer
    }
    if (name == 'sectionWordCode_tokenizer') {
      return sectionWordCode_tokenizer
    }
    if (name == 'sectionWordStrikeThrough_tokenizer') {
      return sectionWordStrikeThrough_tokenizer
    }
    if (name == 'isStartOfTextBold_lookaround') {
      return isStartOfTextBold_lookaround
    }
    if (name == 'isStartOfTextItalic_lookaround') {
      return isStartOfTextItalic_lookaround
    }
    if (name == 'isStartOfTextUnderline_lookaround') {
      return isStartOfTextUnderline_lookaround
    }
    if (name == 'isStartOfTextVerbatim_lookaround') {
      return isStartOfTextVerbatim_lookaround
    }
    if (name == 'isStartOfTextCode_lookaround') {
      return isStartOfTextCode_lookaround
    }
    if (name == 'isStartOfTextStrikeThrough_lookaround') {
      return isStartOfTextStrikeThrough_lookaround
    }
    if (name == 'titleWord_tokenizer') {
      return titleWord_tokenizer
    }
    if (name == 'tags_tokenizer') {
      return tags_tokenizer
    }
    if (name == 'isStartOfTitleTextBold_lookaround') {
      return isStartOfTitleTextBold_lookaround
    }
    if (name == 'isStartOfTitleTextItalic_lookaround') {
      return isStartOfTitleTextItalic_lookaround
    }
    if (name == 'isStartOfTitleTextUnderline_lookaround') {
      return isStartOfTitleTextUnderline_lookaround
    }
    if (name == 'isStartOfTitleTextVerbatim_lookaround') {
      return isStartOfTitleTextVerbatim_lookaround
    }
    if (name == 'isStartOfTitleTextCode_lookaround') {
      return isStartOfTitleTextCode_lookaround
    }
    if (name == 'isStartOfTitleTextStrikeThrough_lookaround') {
      return isStartOfTitleTextStrikeThrough_lookaround
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
          "TextBold": tags.strong,
          "TextItalic": tags.emphasis,
          "TextUnderline": tags.modifier,
          "TextVerbatim": tags.literal,
          "TextCode": tags.monospace,
          "TextStrikeThrough": tags.strikethrough,
        })
      ]
    }),
    languageData: {
      commentTokens: { line: "#" }
    }
  })
}
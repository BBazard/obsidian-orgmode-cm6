import { LanguageSupport, LRLanguage, syntaxHighlighting, HighlightStyle } from "@codemirror/language"
import { BuildOptions, buildParser } from '@lezer/generator';
import { LRParser } from "@lezer/lr";
import { parseMixed, SyntaxNodeRef, Input } from "@lezer/common"
import { tags } from "@lezer/highlight";
import {
  title_tokenizer, todokeyword_tokenizer, plainLink_tokenizer,
  isStartOfRegularLink_lookaround, isStartOfAngleLink_lookaround,
  isStartOfTextMarkup_lookaround,
  object_tokenizer,
  context_tracker } from "./external-tokens"
import * as ExtToken from "./external-tokens"
import { grammarFile } from "./generated_grammar";
import { TOKEN } from 'codemirror-lang-orgmode';
import { getInnerParser } from "./inner-parsers"

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
    if (name == 'isStartOfTextMarkup_lookaround') {
      return isStartOfTextMarkup_lookaround(orgLinkParameters)
    }
    if (name == 'object_tokenizer') {
      return object_tokenizer(orgLinkParameters)
    }

    return ExtToken[name as keyof typeof ExtToken]
  }
}


export const OrgmodeParser = (words: string[]) => {
  const options: BuildOptions = {
    externalTokenizer: configurableExternalTokenizer(words),
    contextTracker: context_tracker,
  };
  return buildParser(grammarFile.toString(), options).configure({
    wrap: parseMixed((node: SyntaxNodeRef, input: Input) => {
      if (node.type.id === TOKEN.BlockContentSrc) {
        const header = node.node.prevSibling
        let headerText = input.read(header.from, header.to)
        headerText = headerText.toLowerCase().replace(/^(\#\+begin_src)\s+/,"");
        headerText = headerText.replace(/\n/, "")
        const langStr = headerText.replace(/\s+.*/, "")
        return getInnerParser(langStr)
      }
      return null
    }),
  });
};


const srcBlocksHighlightStyle = HighlightStyle.define([
  // try to match obsidian classes
  { tag: tags.angleBracket, class: "cm-bracket" },
  { tag: tags.arithmeticOperator, class: "cm-operator" },
  { tag: tags.atom, class: "cm-atom" },
  { tag: tags.attributeName, class: "cm-attribute" },
  { tag: tags.attributeValue, class: "cm-attribute" },
  { tag: tags.bitwiseOperator, class: "cm-operator" },
  { tag: tags.blockComment, class: "cm-comment" },
  { tag: tags.brace, class: "cm-bracket" },
  { tag: tags.bracket, class: "cm-bracket" },
  { tag: tags.comment, class: "cm-comment" },
  { tag: tags.controlKeyword, class: "cm-keyword" },
  { tag: tags.definitionKeyword, class: "cm-def" },
  { tag: tags.docComment, class: "cm-comment" },
  { tag: tags.keyword, class: "cm-keyword" },
  { tag: tags.lineComment, class: "cm-comment" },
  { tag: tags.link, class: "cm-link" },
  { tag: tags.moduleKeyword, class: "cm-keyword" },
  { tag: tags.number, class: "cm-number" },
  { tag: tags.operator, class: "cm-operator" },
  { tag: tags.operatorKeyword, class: "cm-operator" },
  { tag: tags.propertyName, class: "cm-property" },
  { tag: tags.squareBracket, class: "cm-bracket" },
  { tag: tags.string, class: "cm-string" },
  { tag: tags.tagName, class: "cm-tag" },
  { tag: tags.variableName, class: "cm-variable" },
]);

export const OrgmodeLanguage = (parser: LRParser) => {
  return new LanguageSupport(
    LRLanguage.define({
      parser: parser,
      languageData: {
        commentTokens: { line: "#" },
      },
    }),
    syntaxHighlighting(srcBlocksHighlightStyle),
  );
};

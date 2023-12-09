import { parser } from "./orgmode.grammar"
import { LRLanguage, LanguageSupport } from "@codemirror/language"
import { styleTags, tags } from "@lezer/highlight"

export const OrgmodeLanguage = LRLanguage.define({
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

export function Orgmode() {
  return new LanguageSupport(OrgmodeLanguage)
}

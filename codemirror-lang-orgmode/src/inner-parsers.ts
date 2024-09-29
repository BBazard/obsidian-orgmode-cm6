import { NestedParse } from "@lezer/common"

import { parser as parserCpp } from "@lezer/cpp"
import { parser as parserCss } from "@lezer/css"
import { parser as parserHtml } from "@lezer/html"
import { parser as parserJava } from "@lezer/java"
import { parser as parserJavascript } from "@lezer/javascript"
import { parser as parserJson } from "@lezer/json"
import { parser as parserMarkdown } from "@lezer/markdown"
import { parser as parserPhp } from "@lezer/php"
import { parser as parserPython } from "@lezer/python"
import { parser as parserRust } from "@lezer/rust"
import { parser as parserSass } from "@lezer/sass"
import { parser as parserXml } from "@lezer/xml"

export function getInnerParser(langStr: string): NestedParse | null {
  switch (langStr) {
    case "c":
    case "c++":
    case "cpp":
      return { parser: parserCpp };
    case "css":
      return { parser: parserCss };
    case "html":
      return { parser: parserHtml };
    case "java":
      return { parser: parserJava };
    case "javascript":
      return { parser: parserJavascript };
    case "json":
      return { parser: parserJson };
    case "markdown":
      // no highlighting from obsidian
      return { parser: parserMarkdown };
    case "php":
      return { parser: parserPhp };
    case "python":
      return { parser: parserPython };
    case "rust":
      return { parser: parserRust };
    case "sass":
      return { parser: parserSass };
    case "xml":
      return { parser: parserXml };
    default:
      return null;
  }
}

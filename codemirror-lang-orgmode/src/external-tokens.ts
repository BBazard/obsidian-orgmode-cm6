import { ExternalTokenizer, InputStream, Stack, ContextTracker } from '@lezer/lr';
import {
  stars, TodoKeyword, Priority, Title, endofline,
  startOfComment,
  startOfKeywordComment,
  notStartOfPropertyDrawer,
  notStartOfHeading, notStartOfComment,
  isStartOfTextBold,
  isStartOfTextItalic,
  isStartOfTextUnderline,
  isStartOfTextVerbatim,
  isStartOfTextCode,
  isStartOfTextStrikeThrough,
  isEndOfTextBold,
  isEndOfTextItalic,
  isEndOfTextUnderline,
  isEndOfTextVerbatim,
  isEndOfTextCode,
  isEndOfTextStrikeThrough,
  Tags,
  shouldIndentHeading,
  indentHeading,
  shouldDedentHeading,
  dedentHeading,
  PlainLink,
  isStartOfRegularLink,
  isStartOfAngleLink,
  exitRegularLink,
  exitAngleLink,
  PlanningDeadline,
  PlanningScheduled,
  PlanningClosed,
  PlanningValue,
  isStartOfPlanningLine,
  objectToken,
  notStartOfABlock,
  BlockContentCenter,
  BlockContentQuote,
  BlockContentSpecial,
  BlockContentComment,
  BlockContentExample,
  BlockContentExport,
  BlockContentSrc,
  BlockContentVerse,
  BlockContentDynamic,
  BlockFooter,
  BlockHeader,
  propertyDrawerHeader,
  PropertyDrawerContent,
  propertyDrawerFooter,
} from './parser.terms';

const NEW_LINE = '\n'.charCodeAt(0);
const STAR = '*'.charCodeAt(0);
const COLON = ':'.charCodeAt(0);
const HASH = '#'.charCodeAt(0);
const TAB = '\t'.charCodeAt(0);
const SPACE = ' '.charCodeAt(0);
const EOF = -1;
const SOF = -1;
const ENABLE_LOGGING = false  // kill performance when enabled

function log(msg: string) {
  if (ENABLE_LOGGING) {
    console.log(msg)
  }
}

function stringifyCodeLogString(charCode: number) {
  let char = String.fromCharCode(charCode)
  if (charCode == NEW_LINE) {
    char = String.raw`\n`
  } else if (charCode == TAB) {
    char = String.raw`\t`
  } else if (charCode == SPACE) {
    char = '<SPACE>'
  } else if (charCode == EOF || charCode == SOF) {
    char = '<EOF/SOF>'
  }
  return char
}

function inputStreamBeginString(input: InputStream): string {
  return `at ${input.pos}:"${stringifyCodeLogString(input.peek(0))}"`
}

function inputStreamEndString(input: InputStream, stack: Stack): string {
  if (stack.pos === input.pos) {
    return `at ]${input.pos-1}:${stack.pos}[ between "${stringifyCodeLogString(input.peek(-1))}" and "${stringifyCodeLogString(input.peek(0))}"`
  }
  return `at ${input.pos-1}:"${stringifyCodeLogString(input.peek(-1))}"`
}

function inputStreamAccept(input: InputStream, stack: Stack): string {
  if (stack.pos === input.pos) {
    return `]${input.pos-1}:${stack.pos}[ between "${stringifyCodeLogString(input.peek(-1))}" and "${stringifyCodeLogString(input.peek(0))}"`
  }
  return `[${stack.pos}-${input.pos-1}] until "${stringifyCodeLogString(input.peek(-1))}"`
}

function isWhiteSpace(charCode: number) {
  return charCode === SPACE || charCode === TAB
}

function isEndOfLine(charCode: number) {
  return charCode === NEW_LINE || charCode === SOF || charCode === EOF
}

function isAlphaNum(charCode: number): boolean {
  if (charCode >= '0'.charCodeAt(0) && charCode <= '9'.charCodeAt(0)) {
    return true
  }
  if (charCode >= 'A'.charCodeAt(0) && charCode <= 'Z'.charCodeAt(0)) {
    return true
  }
  if (charCode >= 'a'.charCodeAt(0) && charCode <= 'z'.charCodeAt(0)) {
    return true
  }
  return false
}

function checkPriority(s: string) {
  const matched = s.match(/^[ \t]*\[#[a-zA-Z0-9]\][ \t]*$/)
  if (matched) {
    log(`matched ${s} for Priority`)
  }
  return matched
}

function checkTodoKeyword(s: string, input: InputStream, words: string[]) {
  let matched = false
  words.forEach(word => {
    if (s === word) {
      matched = true
    }
  })
  return matched
}

function checkPreviousWord(input: InputStream, words: string[], anti_peek_distance = -1) {
  let previous = input.peek(anti_peek_distance)
  let matched = null
  if (!isEndOfLine(previous)) {
    while (isWhiteSpace(previous)) {
      anti_peek_distance -= 1
      previous = input.peek(anti_peek_distance)
    }
    let p_s = ''
    while (!isWhiteSpace(previous) && !isEndOfLine(previous)) {
      p_s = String.fromCharCode(previous) + p_s
      log(`previous word ${p_s}`)
      if (checkPriority(p_s)) {
        log(`previous word matched priority`)
        matched = Priority
      }
      if (checkTodoKeyword(p_s, input, words)) {
        log(`previous word matched todokeyword`)
        matched = TodoKeyword
      }
      anti_peek_distance -= 1
      previous = input.peek(anti_peek_distance)
    }
  }
  return { 'matched': matched, 'anti_peek_distance': anti_peek_distance }
}

function checkMarkupPRE(codeUnit: number) {
  return (isEndOfLine(codeUnit) || isWhiteSpace(codeUnit) ||
    String.fromCharCode(codeUnit) === '-' ||
    String.fromCharCode(codeUnit) === '(' ||
    String.fromCharCode(codeUnit) === '{' ||
    String.fromCharCode(codeUnit) === "'" ||
    String.fromCharCode(codeUnit) === '"'
  )
}

function checkMarkupPOST(codeUnit: number) {
  return (isEndOfLine(codeUnit) || isWhiteSpace(codeUnit) ||
    String.fromCharCode(codeUnit) === '-' ||
    String.fromCharCode(codeUnit) === '.' ||
    String.fromCharCode(codeUnit) === ',' ||
    String.fromCharCode(codeUnit) === ';' ||
    String.fromCharCode(codeUnit) === ':' ||
    String.fromCharCode(codeUnit) === '!' ||
    String.fromCharCode(codeUnit) === '?' ||
    String.fromCharCode(codeUnit) === ')' ||
    String.fromCharCode(codeUnit) === '}' ||
    String.fromCharCode(codeUnit) === '[' ||
    String.fromCharCode(codeUnit) === '"' ||
    String.fromCharCode(codeUnit) === "'" ||
    String.fromCharCode(codeUnit) === '\\'
  )
}

function checkTags(input: InputStream, advanceInput: boolean) {
  log(`start checkTags ${inputStreamBeginString(input)}`)
  let c = input.peek(0)
  if (c !== COLON) {
    return false
  }
  let peek_distance = 0
  while (true) {
    peek_distance += 1
    c = input.peek(peek_distance)
    log(`peeking a: ${stringifyCodeLogString(c)}`)
    if (isEndOfLine(c)) {
      log(`case 1`)
      // example ":eiofje\n" unfinished tag
      return false
    }
    if (!String.fromCharCode(c).match(/[a-zA-Z0-9_@#%:]/)) {
      log(`case 2`)
      // example ":tag1 " tags cannot contain space
      return false
    }
    if (c == COLON) {
      log(`case 3`)
      let extra_peek_distance = 1
      c = input.peek(peek_distance + extra_peek_distance)
      log(`peeking c: ${stringifyCodeLogString(c)}`)
      if (isEndOfLine(c)) {
        // example ":tag1:\n"
        if (advanceInput) {
          input.advance(peek_distance + extra_peek_distance)
        }
        return true
      } else if (isWhiteSpace(c)) {
        while (isWhiteSpace(c)) {
          extra_peek_distance += 1
          c = input.peek(peek_distance + extra_peek_distance)
          log(`peeking d: ${stringifyCodeLogString(c)}`)
        }
        if (isEndOfLine(c)) {
          // example ":tag1: \n"
          if (advanceInput) {
            input.advance(peek_distance + extra_peek_distance)
          }
          return true
        } else {
          // example ":tag1:a\n" extra chars after tags
          return false
        }
      } else if (String.fromCharCode(c).match(/[a-zA-Z0-9_@#%:]/)) {
        // do nothing just wait for another loop
      } else {
        // example: ":tag1:中" char not part of tags
        return false
      }
    }
  }
}

const getBlockContentTerm = (s: string): number => {
  s = s.toLowerCase()
  if (s === ":") {
    return BlockContentDynamic
  } else if (s === "_center") {
    return BlockContentCenter
  } else if (s === "_quote") {
    return BlockContentQuote
  } else if (s === "_comment") {
    return BlockContentComment
  } else if (s === "_example") {
    return BlockContentExample
  } else if (s === "_export") {
    return BlockContentExport
  } else if (s === "_src") {
    return BlockContentSrc
  } else if (s === "_verse") {
    return BlockContentVerse
  } else if (s.startsWith("_") && s.length > 1) {
    return BlockContentSpecial
  }
  return null
}

function checkBlockStart(input: InputStream, stack: Stack): [number, string] {
  log(`start checkBlockStart ${inputStreamBeginString(input)}`)
  let previous = input.peek(-1)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE checkBlockStart, previous not sof or newline ${inputStreamAccept(input, stack)}`)
    return [0, null]
  }
  let peek_distance = 0
  let c = input.peek(peek_distance)
  let blockPrefix = String.fromCharCode(c)
  for (let i = 0; i < "#+BEGIN".length-1; ++i) {
    peek_distance += 1
    c = input.peek(peek_distance)
    blockPrefix += String.fromCharCode(c)
  }
  if (blockPrefix.toUpperCase() !== "#+BEGIN") {
    log(`XX REFUSE checkBlockStart, line not starting with #+BEGIN ${inputStreamEndString(input, stack)}`)
    return [0, null]
  }
  peek_distance += 1
  c = input.peek(peek_distance)
  let blockSuffix = String.fromCharCode(c)
  while (!isEndOfLine(c) && !isWhiteSpace(c)) {
    peek_distance += 1
    c = input.peek(peek_distance)
    if (!isEndOfLine(c) && !isWhiteSpace(c)) {
      blockSuffix += String.fromCharCode(c)
    }
  }
  const term = getBlockContentTerm(blockSuffix)
  if (term) {
    input.peek(peek_distance)
    while (!isEndOfLine(c)) {
      peek_distance += 1
      c = input.peek(peek_distance)
    }
    if (c === NEW_LINE) {
      peek_distance += 1
    }
    return [peek_distance, blockSuffix]
  }
  log(`XX REFUSE checkBlockStart, reached endofline or 7 chars ${inputStreamEndString(input, stack)}`)
  return [0, null]
}

function checkBlockEnd(input: InputStream, stack: Stack, blockSuffix: string, start_peek_distance: number = 0): number {
  log(`start checkBlockEnd ${inputStreamBeginString(input)} + ${start_peek_distance}`)
  let peek_distance = start_peek_distance
  let previous = input.peek(peek_distance - 1)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE checkBlockEnd, previous not sof or newline ${inputStreamAccept(input, stack)}`)
    return null
  }
  let c = input.peek(peek_distance)
  let blockPrefix = String.fromCharCode(c)
  for (let i = 0; i < "#+END".length-1; ++i) {
    peek_distance += 1
    c = input.peek(peek_distance)
    blockPrefix += String.fromCharCode(c)
  }
  if (blockPrefix.toUpperCase() !== "#+END") {
    log(`XX REFUSE checkBlockEnd, line not starting with #+END_ ${inputStreamEndString(input, stack)}`)
    return null
  }
  peek_distance += 1
  c = input.peek(peek_distance)
  let blockSuffixCandidate = String.fromCharCode(c)
  while (!isEndOfLine(c) && blockSuffixCandidate.length <= blockSuffix.length) {
    peek_distance += 1
    c = input.peek(peek_distance)
    blockSuffixCandidate += String.fromCharCode(c)
    if (blockSuffixCandidate.toLowerCase() === blockSuffix.toLowerCase()) {
      while (!isEndOfLine(c)) {
        peek_distance += 1
        c = input.peek(peek_distance)
      }
      if (c === NEW_LINE) {
        peek_distance += 1
      }
      return peek_distance
    }
  }
  log(`XX REFUSE checkBlockEnd, reaching endofline or char 7 ${inputStreamEndString(input, stack)}`)
  return null
}

function checkMatchingBlockFooter(input: InputStream, stack: Stack, blockSuffix: string, peek_distance: number = 0): boolean {
  if (!blockSuffix) {
    log(`XX REFUSE checkMatchingBlockFooter, checkBlockStart failed ${inputStreamEndString(input, stack)}`)
    return false
  }
  let c = input.peek(peek_distance)
  if (c === EOF) {
    log(`XX REFUSE checkMatchingBlockFooter, reached EOF ${inputStreamEndString(input, stack)}`)
    return false
  }
  while (true) {
    const peek_distance_block_end = checkBlockEnd(input, stack, blockSuffix, peek_distance)
    if (peek_distance_block_end) {
      return true
    }
    while (!isEndOfLine(c)) {
      peek_distance += 1
      c = input.peek(peek_distance)
    }
    if (c === EOF) {
      log(`XX REFUSE checkMatchingBlockFooter, reached EOF ${inputStreamEndString(input, stack)}`)
      return false
    }
    peek_distance += 1
    c = input.peek(peek_distance)
  }
}

function checkBlock(input: InputStream, stack: Stack): boolean {
  let [peek_distance, blockSuffix] = checkBlockStart(input, stack)
  if (!blockSuffix) {
    log(`XX REFUSE checkBlock, checkBlockStart failed ${inputStreamEndString(input, stack)}`)
    return false
  }
  if (checkMatchingBlockFooter(input, stack, blockSuffix, peek_distance)) {
    log(`== ACCEPT checkBlock ${inputStreamAccept(input, stack)}`)
    return true
  }
  log(`XX REFUSE checkBlock, no matching block footer ${inputStreamEndString(input, stack)}`)
  return false
}

export const block_tokenizer = new ExternalTokenizer((input, stack) => {
  log(`-- START block_tokenizer ${inputStreamBeginString(input)}`)
  const context: OrgContext = stack.context
  let previous = input.peek(-1)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE block_tokenizer, not start of a line ${inputStreamEndString(input, stack)}`)
    return
  }
  if (!context.parentObjects.includes(ParentObject.Block)) {
    let [peek_distance, blockSuffix] = checkBlockStart(input, stack)
    if (blockSuffix) {
      context.currentBlockContext = blockSuffix
      const term = getBlockContentTerm(blockSuffix)
      if (checkMatchingBlockFooter(input, stack, blockSuffix, peek_distance)) {
        log(`== ACCEPT BlockHeader term=${term} ${inputStreamAccept(input, stack)}`)
        input.acceptToken(BlockHeader, peek_distance)
        return
      }
    }
    log(`== ACCEPT notStartOfABlock ${inputStreamAccept(input, stack)}`)
    input.acceptToken(notStartOfABlock, -(input.pos-stack.pos))
    return
  }
  if (context.parentObjects.includes(ParentObject.Block)) {
    const peek_distance_block_end = checkBlockEnd(input, stack, context.currentBlockContext)
    if (peek_distance_block_end) {
      input.advance(peek_distance_block_end)
      log(`== ACCEPT BlockFooter ${inputStreamAccept(input, stack)}`)
      input.acceptToken(BlockFooter)
      return
    }
  }
  log(`XX REFUSE block_tokenizer, still inside content ${inputStreamEndString(input, stack)}`)
  return
})

export const blockContent_tokenizer = new ExternalTokenizer((input, stack) => {
  log(`start blockContent_tokenizer ${inputStreamBeginString(input)}`)
  const context: OrgContext = stack.context
  let previous = input.peek(-1)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE blockContent_tokenizer, previous not sof or newline ${inputStreamAccept(input, stack)}`)
    return
  }
  let c = input.peek(0)
  while (c !== EOF) {
    if (checkBlockEnd(input, stack, context.currentBlockContext)) {
      const term = getBlockContentTerm(context.currentBlockContext)
      log(`== ACCEPT blockContent_tokenizer term=${term} ${inputStreamAccept(input, stack)}`)
      input.acceptToken(term)
      return
    }
    while (!isEndOfLine(c)) {
      c = input.advance()
    }
    c = input.advance()
  }
  log(`XX REFUSE blockContent_tokenizer, reached EOF ${inputStreamAccept(input, stack)}`)
  return
})

function checkComment(input: InputStream, stack: Stack) {
  let previous = input.peek(-1)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE checkComment, not at the start of a line ${inputStreamEndString(input, stack)}`)
    return
  }
  let first = input.peek(0)
  if (first !== HASH) {
    log(`XX REFUSE checkComment, not starting with # ${inputStreamEndString(input, stack)}`)
    return
  }
  let second = input.peek(1)
  if (isEndOfLine(second) || second === SPACE) {
    return true
  }
  log(`XX REFUSE checkComment, second char is not space nor endofline ${inputStreamEndString(input, stack)}`)
  return
}

export const startOfComment_lookaround = new ExternalTokenizer((input, stack) => {
  log(`-- START startOfComment_lookaround ${inputStreamBeginString(input)}`)
  if (checkComment(input, stack)) {
    log(`== ACCEPT startOfComment_lookaround ${inputStreamAccept(input, stack)}`)
    input.acceptToken(startOfComment)
    return
  }
  log(`XX REFUSE startOfComment_lookaround ${inputStreamEndString(input, stack)}`)
  return
})

function checkKeywordComment(input: InputStream, stack: Stack) {
  log(`-- START checkKeywordComment ${inputStreamBeginString(input)}`)
  let previous = input.peek(-1)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE checkKeywordComment, not at the start of a line ${inputStreamEndString(input, stack)}`)
    return
  }
  let first = input.peek(0)
  if (first !== HASH) {
    log(`XX REFUSE checkKeywordComment, not starting with # ${inputStreamEndString(input, stack)}`)
    return
  }
  let second = input.peek(1)
  if (second !== "+".charCodeAt(0)) {
    log(`XX REFUSE checkKeywordComment, not starting with #+ ${inputStreamEndString(input, stack)}`)
    return
  }
  let peek_distance = 2
  let c = input.peek(peek_distance)
  while (true) {
    if (isEndOfLine(c) || c === SPACE) {
      log(`XX REFUSE checkKeywordComment, keyword stops without : ${inputStreamEndString(input, stack)}`)
      return
    } else if (c === COLON) {
      return true
    }
    peek_distance += 1
    c = input.peek(peek_distance)
  }
}

export const startOfKeywordComment_lookaround = new ExternalTokenizer((input, stack) => {
  log(`-- START startOfKeywordComment_lookaround ${inputStreamBeginString(input)}`)
  if (checkKeywordComment(input, stack)) {
    log(`== ACCEPT startOfKeywordComment_lookaround ${inputStreamAccept(input, stack)}`)
    input.acceptToken(startOfKeywordComment)
    return
  }
  log(`XX REFUSE startOfKeywordComment_lookaround ${inputStreamEndString(input, stack)}`)
  return
})

export const title_tokenizer = (words: string[]) => { return new ExternalTokenizer((input: InputStream, stack: Stack) => {
  // match everything until tags or NEWLINE or EOF
  log(`-- START Title ${inputStreamBeginString(input)}`)
  // TRYING to previous match priority or todokeyword
  let priority_already_matched = false
  let todo_keyword_already_matched = false
  const previous_checker = checkPreviousWord(input, words)
  if (previous_checker['matched'] == Priority) {
    priority_already_matched = true
    const previous_checker2 = checkPreviousWord(input, words, previous_checker["anti_peek_distance"])
    if (previous_checker2['matched'] == TodoKeyword) {
      todo_keyword_already_matched = true
    }
  } else if (previous_checker['matched'] == TodoKeyword) {
    todo_keyword_already_matched = true
  }
  let c = input.peek(0)
  let s = String.fromCharCode(c)
  log(`first ${stringifyCodeLogString(c)}`)
  if (isEndOfLine(c)) {
    log(`== ACCEPT Title empty ${inputStreamAccept(input, stack)}`)
    input.acceptToken(Title)
    return
  }
  while (!isEndOfLine(c)) {
    while (c != COLON && !isEndOfLine(c)) {
      c = input.advance()
      s += String.fromCharCode(c)
      log(`${stringifyCodeLogString(c)}`)
      if (!priority_already_matched && checkPriority(s)) {
        log(`XX REFUSE Title, is priority ${inputStreamEndString(input, stack)}`)
        return
      }
      if (!todo_keyword_already_matched && checkTodoKeyword(s, input, words)) {
        if (isWhiteSpace(input.peek(1))) {
          log(`XX REFUSE Title, is TodoKeyword ${inputStreamEndString(input, stack)}`)
          return
        }
      }
    }
    if (isEndOfLine(c)) {
      input.acceptToken(Title)
      log(`== ACCEPT Title 1 ${inputStreamAccept(input, stack)}`)
      return
    }
    if (c == COLON) {
      if (checkTags(input, false)) {
        input.acceptToken(Title)
        log(`== ACCEPT Title before Tags ${inputStreamAccept(input, stack)}`)
        return
      }
      c = input.advance()
      s += String.fromCharCode(c)
      log(`${stringifyCodeLogString(c)}`)
    }
  }
  input.acceptToken(Title)
  log(`== ACCEPT Title 4 ${inputStreamAccept(input, stack)}`)
  return
})
}

export const todokeyword_tokenizer = (words: string[]) => { return new ExternalTokenizer((input, stack) => {
  log(`-- START TodoKeyword ${inputStreamBeginString(input)}`)
  const max_length = Math.max(...(words.map(el => el.length)));
  let c = input.peek(0)
  let i = 0
  let s = String.fromCharCode(c)
  log(`first ${stringifyCodeLogString(c)}`)
  while (i < max_length && c != EOF) {
    if (checkTodoKeyword(s, input, words)) {
      const next = input.peek(1)
      if (isEndOfLine(next) || isWhiteSpace(next)) {
        input.advance()
        log(`== ACCEPT TodoKeyword ${inputStreamAccept(input, stack)}`)
        input.acceptToken(TodoKeyword)
        return
      }
    }
    i += 1
    c = input.advance()
    log(`${stringifyCodeLogString(c)}`)
    s += String.fromCharCode(c)
  }
  log(`XX REFUSE TodoKeyword ${inputStreamEndString(input, stack)}`)
  return
})
}

export const priority_tokenizer = new ExternalTokenizer((input, stack) => {
  // Priority { $[ \t]* "[" "#" $[a-zA-Z0-9] "]" $[ \t]* }
  log(`-- START Priority ${inputStreamBeginString(input)}`)
  let c = input.peek(0)
  log(stringifyCodeLogString(c))
  while (isWhiteSpace(c)) {
    c = input.advance()
    log(stringifyCodeLogString(c))
  }
  const OPENING_BRACKET = '['.charCodeAt(0);
  const CLOSING_BRACKET = ']'.charCodeAt(0);
  if (c !== OPENING_BRACKET) {
    log(`XX REFUSE Priority, expecting [ ${inputStreamEndString(input, stack)}`)
    return
  }
  c = input.advance()
  log(stringifyCodeLogString(c))
  if (c !== HASH) {
    log(`XX REFUSE Priority, expecting # ${inputStreamEndString(input, stack)}`)
    return
  }
  c = input.advance()
  log(stringifyCodeLogString(c))
  if (!isAlphaNum(c)) {
    log(`XX REFUSE Priority, expecting alphanum char ${inputStreamEndString(input, stack)}`)
    return
  }
  c = input.advance()
  log(stringifyCodeLogString(c))
  if (c !== CLOSING_BRACKET) {
    log(`XX REFUSE Priority, expecting ] ${inputStreamEndString(input, stack)}`)
    return
  }
  c = input.advance()
  log(stringifyCodeLogString(c))
  while (isWhiteSpace(c)) {
    c = input.advance()
    log(stringifyCodeLogString(c))
  }
  log(`== ACCEPT Priority ${inputStreamAccept(input, stack)}`)
  input.acceptToken(Priority)
  return
})

export const endofline_tokenizer = new ExternalTokenizer((input, stack) => {
  log(`-- START endofline ${inputStreamBeginString(input)}`)
  let previous = input.peek(-1)
  if (isEndOfLine(previous)) {
    log(`XX REFUSE endofline, previous already endofline ${inputStreamEndString(input, stack)}`)
    return
  }
  let c = input.peek(0)
  log(stringifyCodeLogString(c))
  while (true) {
    if (checkTags(input, false)) {
      log(`XX REFUSE endofline, found Tags ${inputStreamEndString(input, stack)}`)
      return
    } else if (c === EOF) {
      log(`== ACCEPT endofline EOF ${inputStreamAccept(input, stack)}`)
      input.acceptToken(endofline)
      return
    } else if (c === NEW_LINE) { // NEW_LINE
      input.advance()
      log(`== ACCEPT endofline NEWLINE ${inputStreamAccept(input, stack)}`)
      input.acceptToken(endofline)
      return
    } else if (!isWhiteSpace(c)) {
      log(`XX REFUSE endofline, not whitespace ${inputStreamEndString(input, stack)}`)
      return
    }
    c = input.advance()
    log(stringifyCodeLogString(c))
  }
});

function checkPropertyDrawer(input: InputStream, stack: Stack, peek_distance: number = 0) {
  log(`-- START checkPropertyDrawer ${inputStreamBeginString(input)}`)
  const previous = input.peek(-1)
  log(`previous ${stringifyCodeLogString(previous)}`)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE checkPropertyDrawer, previous not endofline ${inputStreamEndString(input, stack)}`)
    return
  }
  let c = input.peek(peek_distance)
  log(stringifyCodeLogString(c))
  const matchedPropertiesStart = matchWords(input, [":PROPERTIES:"])
  if (!matchedPropertiesStart) {
    log(`XX REFUSE checkPropertyDrawer, not starting with :PROPERTIES: ${inputStreamEndString(input, stack)}`)
    return
  }
  peek_distance += matchedPropertiesStart.length
  c = input.peek(peek_distance)
  while (c !== NEW_LINE) {
    peek_distance += 1
    c = input.peek(peek_distance)
    log(stringifyCodeLogString(c))
  }
  peek_distance += 1
  c = input.peek(peek_distance)
  log(stringifyCodeLogString(c))
  while (c !== EOF) {
    while (!isEndOfLine(c)) {
      peek_distance += 1
      c = input.peek(peek_distance)
      log(stringifyCodeLogString(c))
    }
    peek_distance += 1
    c = input.peek(peek_distance)
    const matchedPropertiesEnd = matchWords(input, [":END:"], peek_distance)
    if (matchedPropertiesEnd) {
      peek_distance += matchedPropertiesEnd.length
      c = input.peek(peek_distance)
      while (!isEndOfLine(c)) {
        peek_distance += matchedPropertiesEnd.length
        c = input.peek(peek_distance)
      }
      peek_distance += 1
      log(`checkPropertyDrawer true ${peek_distance}`)
      return peek_distance
    }
  }
  log(`XX REFUSE checkPropertyDrawer, reached eof ${inputStreamEndString(input, stack)}`)
  return
}

export const propertyDrawer_tokenizer = new ExternalTokenizer((input, stack) => {
  log(`-- START propertyDrawer_tokenizer ${inputStreamBeginString(input)}`)
  const context: OrgContext = stack.context
  const previous = input.peek(-1)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE PropertyDrawer_tokenizer, not start of a line ${inputStreamEndString(input, stack)}`)
    return
  }
  if (!context.parentObjects.includes(ParentObject.PropertyDrawer)) {
    if (!checkPropertyDrawer(input, stack)) {
      log(`== ACCEPT notStartOfPropertyDrawer ${inputStreamAccept(input, stack)}`)
      input.acceptToken(notStartOfPropertyDrawer)//, -(input.pos-stack.pos))
      return
    }
    let peek_distance = 0
    let c = input.peek(peek_distance)
    while (!isEndOfLine(c)) {
      peek_distance += 1
      c = input.peek(peek_distance)
    }
    peek_distance += 1
    input.advance(peek_distance)
    log(`== ACCEPT propertyDrawerHeader ${inputStreamAccept(input, stack)}`)
    input.acceptToken(propertyDrawerHeader)
    return
  }
  if (context.parentObjects.includes(ParentObject.PropertyDrawer)) {
    let matchedPropertiesEnd = matchWords(input, [":END:"], 0)
    if (matchedPropertiesEnd) {
      let peek_distance = 0
      peek_distance += matchedPropertiesEnd.length
      let c = input.peek(peek_distance)
      while (!isEndOfLine(c)) {
        peek_distance += 1
        c = input.peek(peek_distance)
      }
      if (c === NEW_LINE) {
        peek_distance += 1
      }
      log(`== ACCEPT propertyDrawerFooter by default ${inputStreamAccept(input, stack)}`)
      input.acceptToken(propertyDrawerFooter, peek_distance)
      return
    }
    matchedPropertiesEnd = matchWords(input, [":END:"], 0)
    if (matchedPropertiesEnd) {
      input.advance(matchedPropertiesEnd.length)
      log(`== ACCEPT propertyDrawerFooter ${inputStreamAccept(input, stack)}`)
      input.acceptToken(propertyDrawerFooter)
      return
    }
  }
  log(`XX REFUSE propertyDrawer_tokenizer, still inside content ${inputStreamEndString(input, stack)}`)
  return
})

export const propertyDrawerContent_tokenizer = new ExternalTokenizer((input, stack) => {
  log(`-- START propertyDrawerContent_tokenizer ${inputStreamBeginString(input)}`)
  const context: OrgContext = stack.context
  const previous = input.peek(-1)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE propertyDrawerContent_tokenizer, not start of a line ${inputStreamEndString(input, stack)}`)
    return
  }
  if (!context.parentObjects.includes(ParentObject.PropertyDrawer)) {
    log(`XX REFUSE propertyDrawerContent_tokenizer, not inside PropertyDrawer ${inputStreamEndString(input, stack)}`)
    return
  }
  let peek_distance = 0
  let c = input.peek(peek_distance)
  while (!matchWords(input, [":END:"], peek_distance) && c != EOF) {
    while (!isEndOfLine(c)) {
      peek_distance++
      c = input.peek(peek_distance)
    }
    while (isEndOfLine(c) && c != EOF) {
      peek_distance++
      c = input.peek(peek_distance)
    }
  }
  const matchedPropertiesEnd = matchWords(input, [":END:"], peek_distance)
  if (matchedPropertiesEnd) {
    log(`== ACCEPT PropertyDrawerContent by default ${inputStreamAccept(input, stack)}`)
    input.acceptToken(PropertyDrawerContent, peek_distance)
    return
  }
  log(`XX REFUSE propertyDrawerContent_tokenizer, didn't find footer ${inputStreamEndString(input, stack)}`)
  return
})

export const notStartOfComment_lookaround = new ExternalTokenizer((input, stack) => {
  log(`-- START notStartOfComment_lookaround ${inputStreamBeginString(input)}`)
  if (checkComment(input, stack)) {
    log(`XX REFUSE notStartOfComment_lookaround, start of comment ${inputStreamEndString(input, stack)}`)
    return
  }
  if (checkKeywordComment(input, stack)) {
    log(`XX REFUSE notStartOfComment_lookaround, start of keyword comment ${inputStreamEndString(input, stack)}`)
    return
  }
  log(`== ACCEPT notStartOfComment_lookaround ${inputStreamAccept(input, stack)}`)
  input.acceptToken(notStartOfComment)
  return
})

function checkValidEndOfTextMarkup(input: InputStream, stack: Stack, marker: number, peek_distance: number = 0) {
  const MARKER = marker
  const previous = input.peek(peek_distance - 1)
  const current = input.peek(peek_distance)
  if (isWhiteSpace(previous) || isEndOfLine(previous)) {
    log(`previous is whitespace ${stringifyCodeLogString(previous)}`)
    return false
  }
  log(`current ${stringifyCodeLogString(current)}`)
  if (current !== MARKER) {
    log(`not MARKER ${inputStreamEndString(input, stack)}`)
    return false
  }
  const next = input.peek(peek_distance + 1)
  log(`next ${stringifyCodeLogString(next)}`)
  if (!checkMarkupPOST(next)) {
    log(`no POST ${inputStreamEndString(input, stack)}`)
    return false
  }
  return true
}

export const isStartOfTextMarkup_lookaround = (orgLinkParameters: string[]) => { return new ExternalTokenizer((input, stack) => {
  const context: OrgContext = stack.context
  log(`-- START isStartOfTextMarkup_lookaround ${inputStreamBeginString(input)}`)
  const termsByMarker = new Map([
    [STAR, isStartOfTextBold],
    ['/'.charCodeAt(0), isStartOfTextItalic],
    ['_'.charCodeAt(0), isStartOfTextUnderline],
    ['='.charCodeAt(0), isStartOfTextVerbatim],
    ['~'.charCodeAt(0), isStartOfTextCode],
    ['+'.charCodeAt(0), isStartOfTextStrikeThrough],
  ])
  const term = isStartOfTextMarkup(input, stack, termsByMarker, false, orgLinkParameters)
  if (!term) {
    log(`XX REFUSE isStartOfTextMarkup_lookaround ${inputStreamEndString(input, stack)}`)
    return
  }
  if (
    term === isStartOfTextBold && !context.parentObjects.includes(ParentObject.TextBold) ||
    term === isStartOfTextItalic && !context.parentObjects.includes(ParentObject.TextItalic) ||
    term === isStartOfTextUnderline && !context.parentObjects.includes(ParentObject.TextUnderline) ||
    term === isStartOfTextVerbatim && !context.parentObjects.includes(ParentObject.TextVerbatim) ||
    term === isStartOfTextCode && !context.parentObjects.includes(ParentObject.TextCode) ||
    term === isStartOfTextStrikeThrough && !context.parentObjects.includes(ParentObject.TextStrikeThrough)
  ) {
    log(`== ACCEPT isStartOfTextMarkup_lookaround term=${term} ${inputStreamAccept(input, stack)}`)
    input.acceptToken(term, -(input.pos-stack.pos))
    return
  }
  log(`XX REFUSE isStartOfTextMarkup_lookaround term=${term} already inside this markupu ${inputStreamEndString(input, stack)}`)
  return
})
}

export const isEndOfTextMarkup_tokenizer = new ExternalTokenizer((input, stack) => {
  log(`-- START isEndOfTextMarkup_tokenizer ${inputStreamBeginString(input)}`)
  const termsByMarker = new Map([
    [STAR, isEndOfTextBold],
    ['/'.charCodeAt(0), isEndOfTextItalic],
    ['_'.charCodeAt(0), isEndOfTextUnderline],
    ['='.charCodeAt(0), isEndOfTextVerbatim],
    ['~'.charCodeAt(0), isEndOfTextCode],
    ['+'.charCodeAt(0), isEndOfTextStrikeThrough],
  ])
  const MARKER = input.peek(0)
  if (!termsByMarker.has(MARKER)) {
    log(`XX REFUSE isEndOfTextMarkup, MARKER=${MARKER} unknown ${inputStreamEndString(input, stack)}`)
    return
  }
  if (checkValidEndOfTextMarkup(input, stack, MARKER)) {
    input.advance()
    log(`== ACCEPT isEndOfTextMarkup ${inputStreamAccept(input, stack)}`)
    input.acceptToken(termsByMarker.get(MARKER))
    return
  }
  log(`XX REFUSE isEndOfTextMarkup ${inputStreamEndString(input, stack)}`)
  return
})

function checkValidStartOfTextMarkup(input: InputStream, stack: Stack, termsByMarker: Map<number, number>) {
  const previous = input.peek(-1)
  log(`previous ${stringifyCodeLogString(previous)}`)
  if (!checkMarkupPRE(previous)) {
    log(`XX REFUSE checkValidStartOfTextMarkup, not preceded by PRE ${inputStreamEndString(input, stack)}`)
    return
  }
  let peek_distance = 0
  let c = input.peek(peek_distance)
  log(stringifyCodeLogString(c))
  if (!termsByMarker.has(c)) {
    log(`XX REFUSE checkValidStartOfTextMarkup, not starting with a textmarkup marker ${inputStreamEndString(input, stack)}`)
    return
  }
  const MARKER = c
  if (checkStartOfHeading(input)) {
    log(`XX REFUSE checkValidStartOfTextMarkup, start of heading ${inputStreamEndString(input, stack)}`)
    return
  }
  peek_distance += 1
  c = input.peek(peek_distance)
  if (isWhiteSpace(c)) {
    log(`XX REFUSE checkValidStartOfTextMarkup, ${stringifyCodeLogString(MARKER)} followed by whitespace ${inputStreamEndString(input, stack)}`)
    return
  } else if (isEndOfLine(c)) {
    log(`XX REFUSE checkValidStartOfTextMarkup, ${stringifyCodeLogString(MARKER)} followed by endofline ${inputStreamEndString(input, stack)}`)
    return
  } else if (c === MARKER && checkValidEndOfTextMarkup(input, stack, MARKER, peek_distance)) {
    log(`== REFUSE checkValidStartOfTextMarkup double marker ${inputStreamEndString(input, stack)}`)
    return
  }
  return true
}

function isStartOfTextMarkup(input: InputStream, stack: Stack, termsByMarker: Map<number, number>, noEndOfLine: boolean, orgLinkParameters: string[]) {
  const context: OrgContext = stack.context
  if (!checkValidStartOfTextMarkup(input, stack, termsByMarker)) {
    log(`XX REFUSE isStartOfTextMarkup, not valid start ${inputStreamEndString(input, stack)}`)
    return
  }
  let peek_distance = 0
  const MARKER = input.peek(peek_distance)
  const term = termsByMarker.get(MARKER)
  peek_distance += 1
  let c = input.peek(peek_distance)
  while (true) {
    if (context.parentObjects.includes(ParentObject.RegularLink) && matchWords(input, ["]]"], peek_distance)) {
      log(`== REFUSE isStartOfTextMarkup unfinished markup before end of link ]] ${inputStreamEndString(input, stack)}`)
      return
    } else if (!context.parentObjects.includes(ParentObject.RegularLink) && checkRegularLink(input, stack, orgLinkParameters, peek_distance)) {
      log(`skipping regularLink inside markup`)
      const end_of_link_peek_distance = checkRegularLink(input, stack, orgLinkParameters, peek_distance)
      peek_distance = end_of_link_peek_distance-1
      c = input.peek(peek_distance)
    } else if (context.parentObjects.includes(ParentObject.AngleLink) && matchWords(input, [">"], peek_distance)) {
      log(`== REFUSE isStartOfTextMarkup unfinished markup before end of link > ${inputStreamEndString(input, stack)}`)
      return
    } else if (!context.parentObjects.includes(ParentObject.AngleLink) && checkAngleLink(input, stack, orgLinkParameters, peek_distance)) {
      log(`skipping angleLink inside markup ${inputStreamEndString(input, stack)} + ${peek_distance}`)
      const end_of_link_peek_distance = checkAngleLink(input, stack, orgLinkParameters, peek_distance)
      peek_distance = end_of_link_peek_distance-1
      c = input.peek(peek_distance)
    } else if (c === EOF) {
      log(`== REFUSE isStartOfTextMarkup unfinished EOF ${inputStreamEndString(input, stack)}`)
      return
    } else if (c === MARKER) {
      while (input.peek(peek_distance + 1) === MARKER) {
        peek_distance += 1
        c = input.peek(peek_distance)
        log(stringifyCodeLogString(c))
      }
      if (checkValidEndOfTextMarkup(input, stack, MARKER, peek_distance)) {
        peek_distance += 1
        c = input.peek(peek_distance)
        log(`== ACCEPT isStartOfTextMarkup ${inputStreamAccept(input, stack)}`)
        return term
      }
    // Check end of markup started earlier
    } else if (context.parentObjects.includes(ParentObject.TextBold) && checkValidEndOfTextMarkup(input, stack, STAR, peek_distance)) {
        log(`XX REFUSE isStartOfTextMarkup, reached end of current TextBold ${inputStreamEndString(input, stack)}`)
        return
    } else if (context.parentObjects.includes(ParentObject.TextItalic) && checkValidEndOfTextMarkup(input, stack, '/'.charCodeAt(0), peek_distance)) {
      log(`XX REFUSE isStartOfTextMarkup, reached end of current TextItalic ${inputStreamEndString(input, stack)}`)
      return
    } else if (context.parentObjects.includes(ParentObject.TextUnderline) && checkValidEndOfTextMarkup(input, stack, '_'.charCodeAt(0), peek_distance)) {
      log(`XX REFUSE isStartOfTextMarkup, reached end of current TextUnderline ${inputStreamEndString(input, stack)}`)
      return
    } else if (context.parentObjects.includes(ParentObject.TextVerbatim) && checkValidEndOfTextMarkup(input, stack, '='.charCodeAt(0), peek_distance)) {
      log(`XX REFUSE isStartOfTextMarkup, reached end of current TextVerbatim ${inputStreamEndString(input, stack)}`)
      return
    } else if (context.parentObjects.includes(ParentObject.TextCode) && checkValidEndOfTextMarkup(input, stack, '~'.charCodeAt(0), peek_distance)) {
      log(`XX REFUSE isStartOfTextMarkup, reached end of current TextCode ${inputStreamEndString(input, stack)}`)
      return
    } else if (context.parentObjects.includes(ParentObject.TextStrikeThrough) && checkValidEndOfTextMarkup(input, stack, '+'.charCodeAt(0), peek_distance)) {
      log(`XX REFUSE isStartOfTextMarkup, reached end of current TextStrikeThrough ${inputStreamEndString(input, stack)}`)
      return
    } else if (c === NEW_LINE) {
      if (noEndOfLine) {
        log(`XX REFUSE isStartOfTextMarkup reached endofline ${inputStreamEndString(input, stack)}`)
        return
      }
      if (isWhiteSpace(input.peek(peek_distance + 1)) || isEndOfLine(input.peek(peek_distance + 1))) {
        let extra_peek_distance = 1
        while (isWhiteSpace(input.peek(peek_distance + extra_peek_distance))) {
          extra_peek_distance += 1
        }
        if (isEndOfLine(input.peek(peek_distance + extra_peek_distance))) {
          log(`XX REFUSE isStartOfTextMarkup unfinished blank line ${inputStreamEndString(input, stack)}`)
          return
        }
      } else if (input.peek(peek_distance + 1) == STAR) {
        let extra_peek_distance = 1
        c = input.peek(peek_distance + extra_peek_distance)
        while (c === STAR) {
          extra_peek_distance += 1
          c = input.peek(peek_distance + extra_peek_distance)
        }
        if (isWhiteSpace(c)) {
          log(`XX REFUSE isStartOfTextMarkup, start of heading ${inputStreamEndString(input, stack)}`)
          return
        }
      } else if (input.peek(peek_distance + 1) == HASH) {
          log(`XX REFUSE isStartOfTextMarkup, start of comment ${inputStreamEndString(input, stack)}`)
          return
      } else { }  // regular newline
    }
    peek_distance += 1
    c = input.peek(peek_distance)
    log(stringifyCodeLogString(c))
  }
}

export const tags_tokenizer = new ExternalTokenizer((input, stack) => {
  log(`-- START Tags ${inputStreamBeginString(input)}`)
  if (checkTags(input, true)) {
    log(`== ACCEPT Tags ${inputStreamAccept(input, stack)}`)
    input.acceptToken(Tags)
    return
  }
  log(`XX REFUSE Tags ${inputStreamEndString(input, stack)}`)
  return
})

export const stars_tokenizer = new ExternalTokenizer((input, stack) => {
  log(`-- START stars ${inputStreamBeginString(input)}`)
  let previous = input.peek(-1)
  log(`previous ${stringifyCodeLogString(previous)}`)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE stars, previous not endofline ${inputStreamEndString(input, stack)}`)
    return
  }
  let c = input.peek(0)
  log(stringifyCodeLogString(c))
  if (c !== STAR) {
    log(`XX REFUSE stars, first char not * ${inputStreamEndString(input, stack)}`)
    return
  }
  let headingLevel = 0
  while (input.peek(0) === STAR) {
    headingLevel += 1
    c = input.advance()
    log(stringifyCodeLogString(c))
  }
  if (!isWhiteSpace(c)) {
    log(`XX REFUSE stars, no whitespaces at the end ${inputStreamEndString(input, stack)}`)
    return
  }
  while (isWhiteSpace(input.peek(0))) {
    c = input.advance()
    log(stringifyCodeLogString(c))
  }
  log(`== ACCEPT stars ${inputStreamAccept(input, stack)}`)

  input.acceptToken(stars)
  return
})

function checkStartOfHeading(input: InputStream) {
  const previous = input.peek(-1)
  log(`previous ${stringifyCodeLogString(previous)}`)
  if (!isEndOfLine(previous)) {
    return
  }
  let c = input.peek(0)
  log(stringifyCodeLogString(c))
  let headingLevel = null
  if (c === STAR) {
    // only start of heading if it matches the stars token { "*"+ $[ \t]+ }
    headingLevel = 1
    let peek_c = input.peek(headingLevel)
    while (peek_c == STAR) {
      headingLevel += 1
      peek_c = input.peek(headingLevel)
    }
    if (isWhiteSpace(peek_c)) {
      return headingLevel
    }
  }
  return null
}

export const startOfHeading_lookaround = new ExternalTokenizer((input, stack) => {
  const context: OrgContext = stack.context
  log(`-- START startOfHeading_lookaround ${inputStreamBeginString(input)}`)
  if (input.peek(0) === EOF) {
    if (Array.isArray(context.headingLevelStack) && context.headingLevelStack.length > 0) {
      log(`== ACCEPT shouldDedentHeading before EOF ${inputStreamAccept(input, stack)}`)
      input.acceptToken(shouldDedentHeading)
      return
    }
    log(`XX REFUSE startOfHeading_lookaround, EOF ${inputStreamEndString(input, stack)}`)
    return
  }
  if (!isEndOfLine(input.peek(-1))) {
    log(`XX REFUSE startOfHeading_lookaround, previous not endofline ${inputStreamEndString(input, stack)}`)
    return
  }
  let nextHeadingLevel = checkStartOfHeading(input)
  if (!nextHeadingLevel) {
    log(`== ACCEPT notStartOfHeading ${inputStreamAccept(input, stack)}`)
    input.acceptToken(notStartOfHeading)
    return
  }
  if (context.headingLevelStack.length === 0) {
    log(`== ACCEPT shouldIndentHeading top level ${inputStreamAccept(input, stack)}`)
    input.acceptToken(shouldIndentHeading)
    return
  }
  const currentHeadingLevel = context.headingLevelStack[context.headingLevelStack.length-1]
  if (nextHeadingLevel > currentHeadingLevel) {
    log(`== ACCEPT shouldIndentHeading ${inputStreamAccept(input, stack)}`)
    input.acceptToken(shouldIndentHeading)
    return
  } else {
    log(`== ACCEPT shouldDedentHeading before next heading ${inputStreamAccept(input, stack)}`)
    input.acceptToken(shouldDedentHeading)
    return
  }
})

export const indentHeading_lookaround = new ExternalTokenizer((input, stack) => {
  const context: OrgContext = stack.context
  log(`-- START indentHeading_lookaround ${inputStreamBeginString(input)}`)
  let nextHeadingLevel = checkStartOfHeading(input)
  if (!nextHeadingLevel) {
    log(`XX REFUSE indentHeading_lookaround ${inputStreamEndString(input, stack)}`)
    return
  }
  context.levelHeadingToPush = nextHeadingLevel
  log(`== ACCEPT indentHeading_lookaround ${inputStreamAccept(input, stack)}`)
  input.acceptToken(indentHeading)
  return
})


export const dedentHeading_lookaround = new ExternalTokenizer((input: InputStream, stack: Stack) => {
  log(`-- START dedentHeading_lookaround ${inputStreamBeginString(input)}`)
  log(`== ACCEPT dedentHeading_lookaround ${inputStreamAccept(input, stack)}`)
  input.acceptToken(dedentHeading)
  return
})

function checkPlainLink(input: InputStream, stack: Stack, orgLinkParameters: string[], lookaround: boolean) {
  const L_PAREN = '('.charCodeAt(0)
  const R_PAREN = ')'.charCodeAt(0)
  function checkPlainLinkPRE(codeUnit: number) {
    return (isEndOfLine(codeUnit) || isWhiteSpace(codeUnit) ||
      String.fromCharCode(codeUnit) === '-' ||
      String.fromCharCode(codeUnit) === '(' ||
      String.fromCharCode(codeUnit) === '{' ||
      String.fromCharCode(codeUnit) === "'" ||
      String.fromCharCode(codeUnit) === '"' ||
      String.fromCharCode(codeUnit) === ':'
    )
  }
  const isForbiddenChar = (codeUnit: number) => {
    return (isEndOfLine(codeUnit) || isWhiteSpace(codeUnit) ||
      String.fromCharCode(codeUnit) === '[' ||
      String.fromCharCode(codeUnit) === ']' ||
      String.fromCharCode(codeUnit) === '<' ||
      String.fromCharCode(codeUnit) === '>'
    )
  }
  const linkMarkupMarkers = ['*', '/', '_', '=', '~', '+']
  const previous = input.peek(-1)
  if (
    !checkPlainLinkPRE(previous) &&
    !isEndOfLine(previous) &&
    !isWhiteSpace(previous) &&
    !linkMarkupMarkers.includes(String.fromCharCode(previous))
  ) {
    log(`XX REFUSE checkPlainLink, previous not PRE, eof, whitespace, markup marker ${inputStreamEndString(input, stack)}`)
    return
  }
  let peek_distance = 0
  let c = input.peek(peek_distance)
  if (c === EOF) {
    log(`XX REFUSE checkPlainLink, only EOF left ${inputStreamEndString(input, stack)}`)
    return
  }
  log(stringifyCodeLogString(c))
  if (isWhiteSpace(c) || isEndOfLine(c)) {
    log(`XX REFUSE checkPlainLink, whitespace ${inputStreamEndString(input, stack)}`)
    return
  }
  let s = String.fromCharCode(c)
  while (!isForbiddenChar(c)) {
    peek_distance += 1
    c = input.peek(peek_distance)
    s += String.fromCharCode(c)
    log(stringifyCodeLogString(c))
    if (c === R_PAREN) {
      break
    } else if (c === L_PAREN) {
      let depth = 1
      let beforeParen_peek_distance = peek_distance
      while (depth > 0) {
        peek_distance += 1
        c = input.peek(peek_distance)
        s += String.fromCharCode(c)
        log(stringifyCodeLogString(c))
        if (isForbiddenChar(c)) {
          peek_distance = beforeParen_peek_distance
          break
        } else if (c === L_PAREN) {
          depth += 1
          if (depth > 2) {
            log(`XX REFUSE checkPlainLink, too many '(' ${inputStreamEndString(input, stack)}`)
            return
          }
        } else if (c === R_PAREN) {
          depth -= 1
          if (depth < 0) {
            log(`XX REFUSE checkPlainLink, too many ')' ${inputStreamEndString(input, stack)}`)
            return
          }
        }
      }
    }
  }
  const POSTcandidate = input.peek(peek_distance - 1)
  if (
     linkMarkupMarkers.includes(String.fromCharCode(POSTcandidate)) ||
    (checkMarkupPOST(POSTcandidate) && POSTcandidate !== R_PAREN)
  ) {
    peek_distance -= 1
    s = s.slice(0, s.length-1)
  }
  s = s.slice(0, s.length-1)
  const [linkType, ...pathPlainSplit] = s.split(":")
  const pathPlain = pathPlainSplit.join(":")
  if (!orgLinkParameters.includes(linkType)) {
    log(`XX REFUSE checkPlainLink, not correct linkType ${inputStreamEndString(input, stack)}`)
    return
  }
  if (pathPlain.length <= 1) {
    log(`XX REFUSE checkPlainLink, one char ${inputStreamEndString(input, stack)}`)
    return
  }
  if (!lookaround) {
    input.advance(peek_distance)
  }
  return true
}

export const plainLink_tokenizer = (orgLinkParameters: string[]) => { return new ExternalTokenizer((input, stack) => {
  const context: OrgContext = stack.context
  log(`-- START plainLink_tokenizer ${inputStreamBeginString(input)}`)
  const isInsideLink = context.parentObjects.includes(ParentObject.RegularLink) || context.parentObjects.includes(ParentObject.AngleLink)
  if (isInsideLink) {
    log(`XX REFUSE plainLink_tokenizer, already inside link ${inputStreamEndString(input, stack)}`)
    return
  }
  if (checkPlainLink(input, stack, orgLinkParameters, false)) {
    log(`== ACCEPT plainLink ${inputStreamAccept(input, stack)}`)
    input.acceptToken(PlainLink)
    return
  }
  log(`XX REFUSE plainLink_tokenizer ${inputStreamEndString(input, stack)}`)
  return
  })
}

const checkInnerRegularLink = (innerBracketText: string): boolean => {
  const split = innerBracketText.split("][")
  if (split.length > 2) {
    // [[x][x][x]]
    return false
  }
  if (split.length === 1) {
    const pathreg = innerBracketText
    if (/\[/.test(pathreg) || /\]/.test(pathreg)) {
      // [[x]x]] or [[x[x]]
      return false
    }
    return true
  }
  const [pathreg, description] = split
  if (/\[/.test(pathreg) || /\]/.test(pathreg)) {
    // [[x]x][desc]] or [[x[x][desc]]
    return false
  }
  return true
}

function checkRegularLink(input: InputStream, stack: Stack, orgLinkParameters: string[], peek_distance: number = 0): number {
  const L_SQUARE_BRACKET = '['.charCodeAt(0)
  const R_SQUARE_BRACKET = ']'.charCodeAt(0)
  if (input.peek(peek_distance) !== L_SQUARE_BRACKET || input.peek(peek_distance + 1) !== L_SQUARE_BRACKET) {
    log(`XX REFUSE checkRegularLink ${inputStreamEndString(input, stack)}`)
    return
  }
  peek_distance += 1
  peek_distance += 1
  let c = input.peek(peek_distance)
  let s = ""
  while (true) {
    while (c !== R_SQUARE_BRACKET && !isEndOfLine(c)) {
      s += String.fromCharCode(c)
      peek_distance += 1
      c = input.peek(peek_distance)
    }
    if (isEndOfLine(c)) {
      log(`XX REFUSE checkRegularLink, EOL ${inputStreamEndString(input, stack)}`)
      return
    } else if (input.peek(peek_distance) === R_SQUARE_BRACKET && input.peek(peek_distance + 1) === R_SQUARE_BRACKET) {
      if (checkInnerRegularLink(s)) {
        peek_distance += 1
        peek_distance += 1
        return peek_distance
      }
      log(`XX REFUSE checkRegularLink ${inputStreamEndString(input, stack)}`)
      return
    }
    s += String.fromCharCode(c)
    peek_distance += 1
    c = input.peek(peek_distance)
  }
}

export const isStartOfRegularLink_lookaround = (orgLinkParameters: string[]) => { return new ExternalTokenizer((input, stack) => {
  const context: OrgContext = stack.context
  log(`-- START isStartOfRegularLink_lookaround ${inputStreamBeginString(input)}`)
  const isInsideLink = context.parentObjects.includes(ParentObject.RegularLink) || context.parentObjects.includes(ParentObject.AngleLink)
  if (isInsideLink) {
    log(`XX REFUSE isStartOfRegularLink_lookaround, already inside link ${inputStreamEndString(input, stack)}`)
    return
  }
  if (checkRegularLink(input, stack, orgLinkParameters)) {
    log(`== ACCEPT isStartOfRegularLink_lookaround, EOL ${inputStreamAccept(input, stack)}`)
    input.acceptToken(isStartOfRegularLink)
    return
  }
  log(`XX REFUSE isStartOfRegularLink_lookaround ${inputStreamEndString(input, stack)}`)
  return
  })
}

function checkAngleLink(input: InputStream, stack: Stack, orgLinkParameters: string[], peek_distance: number = 0) {
  const L_ANGLE_BRACKET = '<'.charCodeAt(0)
  const R_ANGLE_BRACKET = '>'.charCodeAt(0)
  let c = input.peek(peek_distance)
  if (c !== L_ANGLE_BRACKET) {
    return
  }
  let linkTypeMatched = false
  let linkTypeCandidate = ""
  const maxLength = orgLinkParameters.reduce((acc,v)=>Math.max(acc, v.length), 0)
  while (true) {
    peek_distance += 1
    c = input.peek(peek_distance)
    while (
      c !== COLON &&
      !isEndOfLine(c) &&
      c !== R_ANGLE_BRACKET
    ) {
      if (!linkTypeMatched && linkTypeCandidate.length < maxLength) {
        linkTypeCandidate += String.fromCharCode(c)
      }
    peek_distance += 1
    c = input.peek(peek_distance)
    }
    if (c === COLON) {
      if (!linkTypeMatched && orgLinkParameters.includes(linkTypeCandidate)) {
        linkTypeMatched = true
      }
    } else if (c === EOF) {
      return
    } else if (c === NEW_LINE) {
      let extra_peek_distance = 1
      while (isWhiteSpace(input.peek(peek_distance + extra_peek_distance))) {
        extra_peek_distance += 1
      }
      if (isEndOfLine(input.peek(peek_distance + extra_peek_distance))) {
        log(`XX REFUSE checkAngleLink unfinished blank line ${inputStreamEndString(input, stack)}`)
        return
      }
    } else if (c === R_ANGLE_BRACKET) {
      if (linkTypeMatched) {
        peek_distance += 1
        return peek_distance
      }
      return
    }
  }
}

export const isStartOfAngleLink_lookaround = (orgLinkParameters: string[]) => { return new ExternalTokenizer((input, stack) => {
    const context: OrgContext = stack.context
  log(`-- START isStartOfAngleLink ${inputStreamBeginString(input)}`)
    const isInsideLink = context.parentObjects.includes(ParentObject.RegularLink) || context.parentObjects.includes(ParentObject.AngleLink)
    if (isInsideLink) {
      log(`XX REFUSE isStartOfAngleLink, already inside link ${inputStreamEndString(input, stack)}`)
      return
    }
    if (checkAngleLink(input, stack, orgLinkParameters)) {
      log(`== ACCEPT isStartOfAngleLink ${inputStreamAccept(input, stack)}`)
      input.acceptToken(isStartOfAngleLink)
      return
    }
    log(`XX REFUSE isStartOfAngleLink ${inputStreamEndString(input, stack)}`)
    return
  })
}

export const exitRegularLink_tokenizer = new ExternalTokenizer((input: InputStream, stack: Stack) => {
  const context: OrgContext = stack.context
  log(`-- START exitRegularLink_tokenizer ${inputStreamBeginString(input)}`)
  const isInsideLink = context.parentObjects.includes(ParentObject.RegularLink) || context.parentObjects.includes(ParentObject.AngleLink)
  if (isInsideLink && matchWords(input, ["]]"])) {
    input.advance()
    input.advance()
    log(`== ACCEPT exitRegularLink_tokenizer ${inputStreamAccept(input, stack)}`)
    input.acceptToken(exitRegularLink)
    return
  }
  log(`XX REFUSE exitRegularLink_tokenizer ${inputStreamEndString(input, stack)}`)
  return
})

export const exitAngleLink_tokenizer = new ExternalTokenizer((input: InputStream, stack: Stack) => {
  const context: OrgContext = stack.context
  log(`-- START exitAngleLink_tokenizer ${inputStreamBeginString(input)}`)
  const isInsideLink = context.parentObjects.includes(ParentObject.RegularLink) || context.parentObjects.includes(ParentObject.AngleLink)
  if (isInsideLink && matchWords(input, [">"])) {
    input.advance()
    log(`== ACCEPT exitAngleLink_tokenizer ${inputStreamAccept(input, stack)}`)
    input.acceptToken(exitAngleLink)
    return
  }
  log(`XX REFUSE exitAngleLink_tokenizer ${inputStreamEndString(input, stack)}`)
  return
})

function matchWords(input: InputStream, words: string[], peek_distance: number = 0): string {
  const maxLength = Math.max(...words.map(x=>x.length))
  let c = null
  let s = ""
  while (s.length <= maxLength) {
    c = input.peek(peek_distance)
    s += String.fromCharCode(c)
    for (let word of words) {
      if (s === word) {
        return word
      }
    }
    peek_distance += 1
  }
  return
}

export const isStartOfPlanningLine_lookaround = new ExternalTokenizer((input, stack) => {
  log(`-- START isStartOfPlanningLine_lookaround ${inputStreamBeginString(input)}`)
  const previous = input.peek(-1)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE isStartOfPlanningLine_lookaround, not start of line ${inputStreamEndString(input, stack)}`)
    return
  }
  let peek_distance = 0
  let c = input.peek(peek_distance)
  while (c === SPACE && !isEndOfLine(c)) {
    peek_distance += 1
    c = input.peek(peek_distance)
  }
  if (isEndOfLine(c)) {
    log(`XX REFUSE isStartOfPlanningLine_lookaround, reached eol ${inputStreamEndString(input, stack)}`)
    return
  }
  const expectedPlanningWords = ["SCHEDULED:", "DEADLINE:", "CLOSED:"]
  let hasMatched = false
  while (c !== SPACE && !isEndOfLine(c)) {
    const matchedWord = matchWords(input, expectedPlanningWords, peek_distance)
    if (matchedWord && (input.peek(peek_distance-1) === SPACE || isEndOfLine(input.peek(peek_distance-1)))) {
      hasMatched = true
      peek_distance += matchedWord.length
      c = input.peek(peek_distance)
      break
    }
    peek_distance += 1
    c = input.peek(peek_distance)
  }
  if (hasMatched) {
    log(`== ACCEPT isStartOfPlanningLine_lookaround ${inputStreamAccept(input, stack)}`)
    input.acceptToken(isStartOfPlanningLine)
    return
  }
  log(`XX REFUSE isStartOfPlanningLine_lookaround ${inputStreamEndString(input, stack)}`)
  return
})

export const planningKeyword_tokenizer = new ExternalTokenizer((input, stack) => {
  log(`-- START planningKeyword_tokenizer ${inputStreamBeginString(input)}`)
  let peek_distance = 0
  let c = input.peek(peek_distance)
  while (c === SPACE && !isEndOfLine(c)) {
    peek_distance += 1
    c = input.peek(peek_distance)
  }
  if (isEndOfLine(c)) {
    log(`XX REFUSE planningKeyword_tokenizer, reached eol ${inputStreamEndString(input, stack)}`)
    return
  }
  const expectedPlanningWords = ["SCHEDULED:", "DEADLINE:", "CLOSED:"]
  let hasMatched = false
  let matchedWord = null
  while (c !== SPACE && !isEndOfLine(c)) {
    matchedWord = matchWords(input, expectedPlanningWords, peek_distance)
    if (matchedWord && (input.peek(peek_distance-1) === SPACE || isEndOfLine(input.peek(peek_distance-1)))) {
      hasMatched = true
      peek_distance += matchedWord.length
      c = input.peek(peek_distance)
      break
    }
    peek_distance += 1
    c = input.peek(peek_distance)
  }
  if (!hasMatched) {
    log(`XX REFUSE planningKeyword_tokenizer, found word that was not a planning part ${inputStreamEndString(input, stack)}`)
    return
  }
  while (c === SPACE && !isEndOfLine(c)) {
    peek_distance += 1
    c = input.peek(peek_distance)
  }
  input.advance(peek_distance)
  if (matchedWord === "DEADLINE:") {
    log(`== ACCEPT planningKeyword_tokenizer, deadline ${inputStreamAccept(input, stack)}`)
    input.acceptToken(PlanningDeadline)
  } else if (matchedWord === "SCHEDULED:") {
    log(`== ACCEPT planningKeyword_tokenizer, scheduled ${inputStreamAccept(input, stack)}`)
    input.acceptToken(PlanningScheduled)
  } else if (matchedWord === "CLOSED:") {
    log(`== ACCEPT planningKeyword_tokenizer, closed ${inputStreamAccept(input, stack)}`)
    input.acceptToken(PlanningClosed)
  }
  log(`XX REFUSE planningKeyword_tokenizer ${inputStreamEndString(input, stack)}`)
  return
})

export const planningValue_tokenizer = new ExternalTokenizer((input, stack) => {
  log(`-- START planningValue_tokenizer ${inputStreamBeginString(input)}`)
  let peek_distance = 0
  let c = input.peek(peek_distance)
  const expectedPlanningWords = ["SCHEDULED:", "DEADLINE:", "CLOSED:"]
  while (!isEndOfLine(c)) {
    const matchedNextWord = matchWords(input, expectedPlanningWords, peek_distance)
    if (matchedNextWord && (input.peek(peek_distance-1) === SPACE || isEndOfLine(input.peek(peek_distance-1)))) {
      break
    }
    peek_distance += 1
    c = input.peek(peek_distance)
  }
  input.advance(peek_distance)
  if (isEndOfLine(c)) {
    input.advance()
  }
  log(`== ACCEPT PlanningValue ${inputStreamAccept(input, stack)}`)
  input.acceptToken(PlanningValue)
  return
})

export const object_tokenizer = (orgLinkParameters: string[]) => {
  return new ExternalTokenizer((input, stack) => {
    const context: OrgContext = stack.context
    const innerMostParent = context.parentObjects[context.parentObjects.length-1]
    let MARKER = null
    if (innerMostParent === ParentObject.TextBold) {
      MARKER = STAR
    } else if (innerMostParent === ParentObject.TextItalic) {
      MARKER = '/'.charCodeAt(0)
    } else if (innerMostParent === ParentObject.TextUnderline) {
      MARKER = '_'.charCodeAt(0)
    } else if (innerMostParent === ParentObject.TextVerbatim) {
      MARKER = '='.charCodeAt(0)
    } else if (innerMostParent === ParentObject.TextCode) {
      MARKER = '~'.charCodeAt(0)
    } else if (innerMostParent === ParentObject.TextStrikeThrough) {
      MARKER = '+'.charCodeAt(0)
    }
    const termsByMarker = new Map([
      [STAR, isStartOfTextBold],
      ['/'.charCodeAt(0), isStartOfTextItalic],
      ['_'.charCodeAt(0), isStartOfTextUnderline],
      ['='.charCodeAt(0), isStartOfTextVerbatim],
      ['~'.charCodeAt(0), isStartOfTextCode],
      ['+'.charCodeAt(0), isStartOfTextStrikeThrough],
    ])
    log(`-- START object_tokenizer innermostParent=${innerMostParent} ${inputStreamBeginString(input)}`)
    let c = input.peek(0)
    log(stringifyCodeLogString(c))
    while (true) {
      ///// no 0-length match at eof to prevent infinite loop /////
      if (input.pos === stack.pos && c === EOF) {
        log(`XX REFUSE object_tokenizer, reached EOF ${inputStreamAccept(input, stack)}`)
        return
      ///// end of Title /////
      } else if (
        context.parentObjects.includes(ParentObject.Title) && isEndOfLine(c)
      ) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before endofline in title ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      } else if (
        context.parentObjects.includes(ParentObject.Title) && checkTags(input, false)
      ) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before Tags in title ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      // avoid 0-length tokens (except for Title)
      } else if (input.pos === stack.pos) {
        // keep going since we don't want 0-length token
      } else if (c === EOF) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before eof ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      ///// start of heading /////
      } else if (checkStartOfHeading(input)) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before Heading ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      ///// start of PropertyDrawer /////
      } else if (checkPropertyDrawer(input, stack)) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before PropertyDrawer ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      ///// start of block /////
      } else if (checkBlock(input, stack)) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before Block ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      ///// start of comment /////
      } else if (checkComment(input, stack)) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before comment ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      ///// start of keywordComment /////
      } else if (checkKeywordComment(input, stack)) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before keywordComment ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      ///// start of link /////
      } else if (
        !context.parentObjects.includes(ParentObject.RegularLink) &&
        !context.parentObjects.includes(ParentObject.AngleLink) &&
        (
          checkRegularLink(input, stack, orgLinkParameters) ||
          checkAngleLink(input, stack, orgLinkParameters) ||
          checkPlainLink(input, stack, orgLinkParameters, true)
        )
      ) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before start of link ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      ///// end of links /////
      } else if (context.parentObjects.includes(ParentObject.RegularLink) && matchWords(input, ["]]"])) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before end of RegularLink ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      } else if (context.parentObjects.includes(ParentObject.AngleLink) && matchWords(input, [">"])) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before end of AngleLink ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      ///// end of markup /////
      } else if (
        MARKER && c === MARKER &&
        checkValidEndOfTextMarkup(input, stack, MARKER)
      ) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before end of markup ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      ///// start of markup inside title /////
      } else if (
        c === STAR &&
        !context.parentObjects.includes(ParentObject.TextBold) &&
        context.parentObjects.includes(ParentObject.Title) &&
        isStartOfTextMarkup(input, stack, termsByMarker, true, orgLinkParameters)
      ) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before TextBold ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      } else if (
        c ==='/'.charCodeAt(0) &&
        !context.parentObjects.includes(ParentObject.TextItalic) &&
        context.parentObjects.includes(ParentObject.Title) &&
        isStartOfTextMarkup(input, stack, termsByMarker, true, orgLinkParameters)
      ) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before TextItalic ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      } else if (
        c ==='_'.charCodeAt(0) &&
        !context.parentObjects.includes(ParentObject.TextUnderline) &&
        context.parentObjects.includes(ParentObject.Title) &&
        isStartOfTextMarkup(input, stack, termsByMarker, true, orgLinkParameters)
      ) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before TextUnderline ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      } else if (
        c ==='='.charCodeAt(0) &&
        !context.parentObjects.includes(ParentObject.TextVerbatim) &&
        context.parentObjects.includes(ParentObject.Title) &&
        isStartOfTextMarkup(input, stack, termsByMarker, true, orgLinkParameters)
      ) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before TextVerbatim ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      } else if (
        c ==='~'.charCodeAt(0) &&
        !context.parentObjects.includes(ParentObject.TextCode) &&
        context.parentObjects.includes(ParentObject.Title) &&
        isStartOfTextMarkup(input, stack, termsByMarker, true, orgLinkParameters)
      ) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before TextCode ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      } else if (
        c ==='+'.charCodeAt(0) &&
        !context.parentObjects.includes(ParentObject.TextStrikeThrough) &&
        context.parentObjects.includes(ParentObject.Title) &&
        isStartOfTextMarkup(input, stack, termsByMarker, true, orgLinkParameters)
      ) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before TextStrikeThrough ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      ///// start of markup /////
      } else if (
        c === STAR &&
        !context.parentObjects.includes(ParentObject.TextBold) &&
        !context.parentObjects.includes(ParentObject.Title) &&
        isStartOfTextMarkup(input, stack, termsByMarker, false, orgLinkParameters)
      ) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before TextBold ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      } else if (
        c ==='/'.charCodeAt(0) &&
        !context.parentObjects.includes(ParentObject.TextItalic) &&
        !context.parentObjects.includes(ParentObject.Title) &&
        isStartOfTextMarkup(input, stack, termsByMarker, false, orgLinkParameters)
      ) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before TextItalic ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      } else if (
        c ==='_'.charCodeAt(0) &&
        !context.parentObjects.includes(ParentObject.TextUnderline) &&
        !context.parentObjects.includes(ParentObject.Title) &&
        isStartOfTextMarkup(input, stack, termsByMarker, false, orgLinkParameters)
      ) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before TextUnderline ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      } else if (
        c ==='='.charCodeAt(0) &&
        !context.parentObjects.includes(ParentObject.TextVerbatim) &&
        !context.parentObjects.includes(ParentObject.Title) &&
        isStartOfTextMarkup(input, stack, termsByMarker, false, orgLinkParameters)
      ) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before TextVerbatim ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      } else if (
        c ==='~'.charCodeAt(0) &&
        !context.parentObjects.includes(ParentObject.TextCode) &&
        !context.parentObjects.includes(ParentObject.Title) &&
        isStartOfTextMarkup(input, stack, termsByMarker, false, orgLinkParameters)
      ) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before TextCode ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      } else if (
        c ==='+'.charCodeAt(0) &&
        !context.parentObjects.includes(ParentObject.TextStrikeThrough) &&
        !context.parentObjects.includes(ParentObject.Title) &&
        isStartOfTextMarkup(input, stack, termsByMarker, false, orgLinkParameters)
      ) {
        log(`== ACCEPT object_tokenizer innermostParent=${innerMostParent} before TextStrikeThrough ${inputStreamAccept(input, stack)}`)
        input.acceptToken(objectToken)
        return
      }
      ///// keep advancing /////
      c = input.advance()
      log(stringifyCodeLogString(c))
    }
  })
}

enum ParentObject {
  Title,
  TextBold,
  TextItalic,
  TextUnderline,
  TextVerbatim,
  TextCode,
  TextStrikeThrough,
  RegularLink,
  AngleLink,
  Block,
  PropertyDrawer,
}

class OrgContext {
  headingLevelStack: number[]
  hash: number
  levelHeadingToPush: number
  parentObjects: ParentObject[]
  currentBlockContext: string
  constructor(
    headingLevelStack: number[],
    levelHeadingToPush: number,
    parentObjects: ParentObject[],
    currentBlockContext: string,
  ) {
    this.headingLevelStack = headingLevelStack
    this.levelHeadingToPush = levelHeadingToPush
    this.parentObjects = parentObjects
    this.currentBlockContext = currentBlockContext,
    this.hash = this.hashCompute()
  }
  hashCompute() {
    let hash = 0
    let bitmask = 0
    for (let headingLevel of this.headingLevelStack) {
      hash += headingLevel << (bitmask=bitmask+10)
    }
    hash += this.levelHeadingToPush << (bitmask=bitmask+10)
    for (let parent of this.parentObjects) {
      hash += (parent+1) << (bitmask=bitmask+10)
    }
    if (this.currentBlockContext) {
      for (let char of this.currentBlockContext) {
        hash += char.charCodeAt(0) << (bitmask=bitmask+1)
      }
    }
    return hash
  }
}

export const context_tracker = new ContextTracker({
  start: new OrgContext([], null, [], null),
  shift(context: OrgContext, term: number, stack: Stack, input: InputStream) {
    let headingLevelStack = [...context.headingLevelStack]
    let levelHeadingToPush = context.levelHeadingToPush
    let parentObjects = [...context.parentObjects]
    let currentBlockContext = context.currentBlockContext
    if (term === indentHeading) {
      const toPush = levelHeadingToPush
      levelHeadingToPush = null
      headingLevelStack.push(toPush)
    }
    if (term === dedentHeading) {
      const toPop = headingLevelStack[headingLevelStack.length-1]
      headingLevelStack.pop()
    }
    if (term === isStartOfTextBold) {
      parentObjects.push(ParentObject.TextBold)
    }
    if (term === isStartOfTextItalic) {
      parentObjects.push(ParentObject.TextItalic)
    }
    if (term === isStartOfTextUnderline) {
      parentObjects.push(ParentObject.TextUnderline)
    }
    if (term === isStartOfTextVerbatim) {
      parentObjects.push(ParentObject.TextVerbatim)
    }
    if (term === isStartOfTextCode) {
      parentObjects.push(ParentObject.TextCode)
    }
    if (term === isStartOfTextStrikeThrough) {
      parentObjects.push(ParentObject.TextStrikeThrough)
    }
    if (
      term === isEndOfTextBold ||
      term === isEndOfTextItalic ||
      term === isEndOfTextUnderline ||
      term === isEndOfTextVerbatim ||
      term === isEndOfTextCode ||
      term === isEndOfTextStrikeThrough
    ) {
      parentObjects.pop()
    }
    if (term === isStartOfRegularLink) {
      parentObjects.push(ParentObject.RegularLink)
    }
    if (term === exitRegularLink) {
      parentObjects.pop()
    }
    if (term === isStartOfAngleLink) {
      parentObjects.push(ParentObject.AngleLink)
    }
    if (term === exitAngleLink) {
      parentObjects.pop()
    }
    if (term === stars) {
      parentObjects.push(ParentObject.Title)
    }
    if (term === endofline) {
      parentObjects.pop()
    }
    if (term === BlockHeader) {
      parentObjects.push(ParentObject.Block)
    }
    if (term === BlockFooter) {
      parentObjects.pop()
      currentBlockContext = null
    }
    if (term === propertyDrawerHeader) {
      parentObjects.push(ParentObject.PropertyDrawer)
    }
    if (term === propertyDrawerFooter) {
      parentObjects.pop()
    }
    return new OrgContext(headingLevelStack, levelHeadingToPush, parentObjects, currentBlockContext)
  },
  hash: context => context.hash
})

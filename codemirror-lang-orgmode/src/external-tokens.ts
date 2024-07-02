import { ExternalTokenizer, InputStream, Stack, ContextTracker } from '@lezer/lr';
import {
  stars, TodoKeyword, Priority, Title, endofline,
  PropertyDrawer,
  notStartOfPlanning, notStartOfPropertyDrawer,
  notStartOfHeading, notStartOfComment,
  sectionword,
  sectionSpace,
  sectionEnd,
  sectionwordBold,
  sectionwordItalic,
  sectionwordUnderline,
  sectionwordVerbatim,
  sectionwordCode,
  sectionwordStrikeThrough,
  isStartOfTextBold,
  isStartOfTextItalic,
  isStartOfTextUnderline,
  isStartOfTextVerbatim,
  isStartOfTextCode,
  isStartOfTextStrikeThrough,
  titleWord,
  Tags,
  isStartOfTitleTextBold,
  isStartOfTitleTextItalic,
  isStartOfTitleTextUnderline,
  isStartOfTitleTextVerbatim,
  isStartOfTitleTextCode,
  isStartOfTitleTextStrikeThrough,
  shouldIndentHeading,
  indentHeading,
  shouldDedentHeading,
  dedentHeading,
  PlainLink,
  isRegularLink,
  isAngleLink,
  sectionWordAngleLink,
  sectionWordRegularLink,
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

function stringifyCodesLogString(charCodes: number[]) {
  return charCodes.map(x=>stringifyCodeLogString(x)).join("")
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
  let peek_distance = 1
  c = input.peek(peek_distance)
  log(`peeking a: ${stringifyCodeLogString(c)}`)
  while (true) {
    peek_distance += 1
    c = input.peek(peek_distance)
    log(`peeking b: ${stringifyCodeLogString(c)}`)
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
    log(`XX REFUSE endofline, previous not endofline ${inputStreamEndString(input, stack)}`)
    return
  }
  let c = input.peek(0)
  log(stringifyCodeLogString(c))
  while (!isEndOfLine(c)) {
    c = input.advance()
    log(stringifyCodeLogString(c))
  }
  if (c === EOF) {
    log(`== ACCEPT endofline EOF ${inputStreamAccept(input, stack)}`)
    input.acceptToken(endofline)
  } else { // NEW_LINE
    input.advance()
    log(`== ACCEPT endofline NEWLINE ${inputStreamAccept(input, stack)}`)
    input.acceptToken(endofline)
  }
});

export const notStartOfPlanning_lookaround = new ExternalTokenizer((input, stack) => {
  log(`-- START notStartOfPlanning ${inputStreamBeginString(input)}`)
  // sectionLineStart { ( ("*"+ ![ \t*]) | ![#*] ) }
  const previous = input.peek(-1)
  log(`previous ${stringifyCodeLogString(previous)}`)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE notStartOfPlanning, previous not endofline ${inputStreamEndString(input, stack)}`)
    return
  }
  let c = input.peek(0)
  let planning_word = String.fromCharCode(c)
  log(stringifyCodeLogString(c))
  if (c === EOF) {
      log(`XX REFUSE notStartOfPlanning, only EOF left ${inputStreamEndString(input, stack)}`)
      return
  } else if (c === COLON) {
    planning_word = ''
  } else if (c === HASH) {
    log(`XX REFUSE notStartOfPlanning, start of comment ${inputStreamEndString(input, stack)}`)
    return
  } else if (c === STAR) {
    // only start of heading if it matches the stars token { "*"+ $[ \t]+ }
    let peek_distance = 1
    let peek_c = input.peek(peek_distance)
    while (peek_c == STAR) {
      peek_distance += 1
      peek_c = input.peek(peek_distance)
    }
    if (isWhiteSpace(peek_c)) {
      log(`XX REFUSE notStartOfPlanning, start of heading ${inputStreamEndString(input, stack)}`)
      return // start of HEADING
    }
  }
  if (c === HASH) {
    log(`XX REFUSE notStartOfPlanning, start of comment ${inputStreamEndString(input, stack)}`)
    return
  }
  let primary_peek_distance = 0
  while (!isEndOfLine(c)) {
    primary_peek_distance += 1
    c = input.peek(primary_peek_distance)
    log(stringifyCodeLogString(c))
    if (c === COLON) {
      if (
        planning_word.toUpperCase() === 'DEADLINE' ||
        planning_word.toUpperCase() === 'SCHEDULED' ||
        planning_word.toUpperCase() === 'CLOSED') {
        log(`XX REFUSE notStartOfPlanning, start of Planning ${inputStreamEndString(input, stack)}`)
        return
      }
    }
    planning_word += String.fromCharCode(c)
    log(`word [${planning_word}]`)
  }
  if (c === EOF) {
    log(`== ACCEPT notStartOfPlanning before eof ${inputStreamAccept(input, stack)}`)
    input.acceptToken(notStartOfPlanning)
    return
  } else if (c === NEW_LINE && input.peek(primary_peek_distance + 1) === EOF) {
    primary_peek_distance += 1
    input.acceptToken(notStartOfPlanning)
    log(`== ACCEPT last notStartOfPlanning before EOF with a trailing newline ${inputStreamAccept(input, stack)}`)
    return
  } else if (c === NEW_LINE) {
    primary_peek_distance += 1
    log(`== ACCEPT notStartOfPlanning before newline ${inputStreamAccept(input, stack)}`)
    input.acceptToken(notStartOfPlanning)
    return
  }
  log(`== ACCEPT notStartOfPlanning by default ${inputStreamAccept(input, stack)}`)
  input.acceptToken(notStartOfPlanning)
  return
})

export const notStartOfPropertyDrawer_lookaround = new ExternalTokenizer((input, stack) => {
  log(`-- START notStartOfPropertyDrawer ${inputStreamBeginString(input)}`)
  // sectionLineStart { ( ("*"+ ![ \t*]) | ![#*] ) }
  const previous = input.peek(-1)
  log(`previous ${stringifyCodeLogString(previous)}`)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE notStartOfPropertyDrawer, previous not endofline ${inputStreamEndString(input, stack)}`)
    return
  }
  let c = input.peek(0)
  let planning_word = String.fromCharCode(c)
  let could_be_property_drawer = false
  log(stringifyCodeLogString(c))
  if (c === EOF) {
      log(`XX REFUSE notStartOfPropertyDrawer, only EOF left ${inputStreamEndString(input, stack)}`)
      return
  } else if (c === COLON) {
    could_be_property_drawer = true
    planning_word = ''
  } else if (c === HASH) {
    log(`XX REFUSE notStartOfPropertyDrawer, start of comment ${inputStreamEndString(input, stack)}`)
    return
  } else if (c === STAR) {
    // only start of heading if it matches the stars token { "*"+ $[ \t]+ }
    let peek_distance = 1
    let peek_c = input.peek(peek_distance)
    while (peek_c == STAR) {
      peek_distance += 1
      peek_c = input.peek(peek_distance)
    }
    if (isWhiteSpace(peek_c)) {
      log(`XX REFUSE notStartOfPropertyDrawer, start of heading ${inputStreamEndString(input, stack)}`)
      return // start of HEADING
    }
  }
  if (c === HASH) {
    log(`XX REFUSE notStartOfPropertyDrawer, start of comment ${inputStreamEndString(input, stack)}`)
    return
  }
  let primary_peek_distance = 0
  while (!isEndOfLine(c)) {
    primary_peek_distance += 1
    c = input.peek(primary_peek_distance)
    log(stringifyCodeLogString(c))
    if (c === COLON) {
      if (could_be_property_drawer && planning_word.toUpperCase() === 'PROPERTIES') {
        log(`XX REFUSE notStartOfPropertyDrawer, start of PropertyDrawer ${inputStreamEndString(input, stack)}`)
        return
      }
    }
    planning_word += String.fromCharCode(c)
    log(`word [${planning_word}]`)
  }
  if (c === EOF) {
    log(`== ACCEPT notStartOfPropertyDrawer before eof ${inputStreamAccept(input, stack)}`)
    input.acceptToken(notStartOfPropertyDrawer)
    return
  } else if (c === NEW_LINE && input.peek(primary_peek_distance + 1) === EOF) {
    primary_peek_distance += 1
    input.acceptToken(notStartOfPropertyDrawer)
    log(`== ACCEPT last notStartOfPropertyDrawer before EOF with a trailing newline ${inputStreamAccept(input, stack)}`)
    return
  } else if (c === NEW_LINE) {
    primary_peek_distance += 1
    log(`== ACCEPT notStartOfPropertyDrawer before newline ${inputStreamAccept(input, stack)}`)
    input.acceptToken(notStartOfPropertyDrawer)
    return
  }
  log(`== ACCEPT notStartOfPropertyDrawer by default ${inputStreamAccept(input, stack)}`)
  input.acceptToken(notStartOfPropertyDrawer)
  return
})

export const propertydrawer_tokenizer = new ExternalTokenizer((input, stack) => {
  // PropertyDrawer { ":PROPERTIES:" ![:]+ ":END:" } // with newline before and after
  log(`-- START PropertyDrawer ${inputStreamBeginString(input)}`)
  const previous = input.peek(-1)
  log(`previous ${stringifyCodeLogString(previous)}`)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE PropertyDrawer, previous not endofline ${inputStreamEndString(input, stack)}`)
    return
  }
  let c = input.peek(0)
  log(stringifyCodeLogString(c))
  if (c !== COLON) {
    log(`XX REFUSE PropertyDrawer, first not colon ${inputStreamEndString(input, stack)}`)
    return
  }
  c = input.advance()
  let first_line = true
  let properties_word = String.fromCharCode(c)
  let properties_found_on_first_line = false
  let try_matching_end = false
  let end_word = ''
  while (c !== EOF) {
    while (!isEndOfLine(c)) {
      c = input.advance()
      log(stringifyCodeLogString(c))
      if (first_line) {
        log('first_line')
        if (c === COLON) {
          log('C === COLON')
          if (properties_word.toUpperCase() === 'PROPERTIES') {
            log(':PROPERTIES: found')
            properties_found_on_first_line = true
          }
        } else {
          properties_word += String.fromCharCode(c)
          log(`properties word ${properties_word}`)
        }
      }
      if (try_matching_end) {
        log('try_matching_end')
        if (c === COLON) {
          log('C === COLON')
          if (end_word.toUpperCase() === 'END') {
            log(':END: found')
            c = input.advance()
            log(stringifyCodeLogString(c))
            while (!isEndOfLine(c)) {
              c = input.advance()
              log(stringifyCodeLogString(c))
            }
            input.advance()
            log(`== ACCEPT PropertyDrawer ${inputStreamAccept(input, stack)}`)
            input.acceptToken(PropertyDrawer)
            return
          } else {
            log(`false positive end word: ${end_word}`)
            try_matching_end = false
          }
        }
        end_word += String.fromCharCode(c)
        log(`end word ${end_word}`)
      }
    }
    first_line = false
    if (!properties_found_on_first_line) {
      log(`XX REFUSE PropertyDrawer, no :PROPERTIES: on first line ${inputStreamEndString(input, stack)}`)
      return
    }
    log(`next start? ${stringifyCodeLogString(input.peek(1))}`)
    if (input.peek(1) === COLON) {
      try_matching_end = true
      end_word = ''
      log('start matching end')
    }
    c = input.advance()
  }
  log(`== ACCEPT PropertyDrawer EOF reached without :END: ${inputStreamAccept(input, stack)}`)
  return
});

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

export const notStartOfHeading_lookaround = new ExternalTokenizer((input, stack) => {
  log(`-- START notStartOfHeading_lookaround ${inputStreamBeginString(input)}`)
  if (!isEndOfLine(input.peek(-1))) {
    log(`XX REFUSE notStartOfHeading_lookaround, previous not endofline ${inputStreamEndString(input, stack)}`)
    return
  }
  if (input.peek(0) === EOF) {
    log(`XX REFUSE notStartOfHeading_lookaround, EOF ${inputStreamEndString(input, stack)}`)
    return
  }
  if (!checkStartOfHeading(input)) {
    log(`== ACCEPT notStartOfHeading_lookaround ${inputStreamAccept(input, stack)}`)
    input.acceptToken(notStartOfHeading)
    return
  }
  log(`XX REFUSE notStartOfHeading_lookaround`)
  return
})

export const notStartOfComment_lookaround = new ExternalTokenizer((input, stack) => {
  log(`-- START notStartOfComment_lookaround ${inputStreamBeginString(input)}`)
  const previous = input.peek(-1)
  log(`previous ${stringifyCodeLogString(previous)}`)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE notStartOfComment_lookaround, previous not endofline ${inputStreamEndString(input, stack)}`)
    return
  }
  let c = input.peek(0)
  log(stringifyCodeLogString(c))
  if (c === HASH) {
    log(`XX REFUSE notStartOfComment_lookaround, start of comment ${inputStreamEndString(input, stack)}`)
    return
  }
  log(`== ACCEPT notStartOfComment_lookaround ${inputStreamAccept(input, stack)}`)
  input.acceptToken(notStartOfComment)
  return
});

export const sectionWord_tokenizer = new ExternalTokenizer((input, stack) => {
  log(`-- START sectionWord ${inputStreamBeginString(input)}`)
  let c = input.peek(0)
  if (c === EOF) {
    log(`XX REFUSE sectionWord, only EOF left ${inputStreamEndString(input, stack)}`)
    return
  }
  log(stringifyCodeLogString(c))
  if (isWhiteSpace(c) || isEndOfLine(c)) {
    log(`XX REFUSE sectionWord, whitespace ${inputStreamEndString(input, stack)}`)
    return
  }
  while (!isWhiteSpace(c) && !isEndOfLine(c)) {
    c = input.advance()
    log(stringifyCodeLogString(c))
  }
  log(`== ACCEPT sectionWord ${inputStreamAccept(input, stack)}`)
  input.acceptToken(sectionword)
  return
});

export const sectionSpace_tokenizer = new ExternalTokenizer((input, stack) => {
  log(`-- START sectionSpace ${inputStreamBeginString(input)}`)
  let c = input.peek(0)
  if (c === EOF) {
    log(`XX REFUSE sectionSpace, only EOF left ${inputStreamEndString(input, stack)}`)
    return
  }
  if (!isWhiteSpace(c)) {
    log(`XX REFUSE sectionSpace, not whitespace ${inputStreamEndString(input, stack)}`)
    return
  }
  log(stringifyCodeLogString(c))
  while (isWhiteSpace(c)) {
    c = input.advance()
    log(stringifyCodeLogString(c))
  }
  log(`== ACCEPT sectionSpace ${inputStreamAccept(input, stack)}`)
  input.acceptToken(sectionSpace)
  return
});

export const sectionEnd_tokenizer = new ExternalTokenizer((input, stack) => {
  log(`-- START sectionEnd ${inputStreamBeginString(input)}`)
  let c = input.peek(0)
  if (isEndOfLine(c)) {
    input.advance()
    log(`== ACCEPT sectionEnd ${inputStreamAccept(input, stack)}`)
    input.acceptToken(sectionEnd)
    return
  }
  log(`XX REFUSE sectionSpace, ${inputStreamEndString(input, stack)}`)
  return
});

function sectionWordMarkup(input: InputStream, stack: Stack, marker: number, term: number) {
  const MARKER = marker
  log(`-- START sectionWordMarkup ${stringifyCodeLogString(marker)} ${inputStreamBeginString(input)}`)
  let c = input.peek(0)
  log(stringifyCodeLogString(c))
  if (isWhiteSpace(c)) {
    log(`XX REFUSE sectionWordMarkup ${stringifyCodeLogString(marker)}, whitespace or endofline ${inputStreamEndString(input, stack)}`)
    return
  }
  while (true) {
    while (!isWhiteSpace(c) && !isEndOfLine(c) && c !== MARKER) {
      c = input.advance()
      log(stringifyCodeLogString(c))
    }
    if (c === EOF) {
      log(`== ACCEPT sectionWordMarkup ${stringifyCodeLogString(marker)} before eof ${inputStreamAccept(input, stack)}`)
      input.acceptToken(term)
      return
    } else if (c === NEW_LINE) {
      c = input.advance()
      log(stringifyCodeLogString(c))
    } else if (isWhiteSpace(c)) {
      log(`== ACCEPT sectionWordMarkup ${stringifyCodeLogString(marker)} before whitespace ${inputStreamAccept(input, stack)}`)
      input.acceptToken(term)
      return
    } else if (c === MARKER) {
      if (checkEndOfTextMarkup(input, stack, MARKER)) {
        log(`== ACCEPT sectionWordMarkup ${stringifyCodeLogString(marker)} at stuff ${inputStreamAccept(input, stack)}`)
        input.acceptToken(term)
        return
      }
      c = input.advance()
      log(stringifyCodeLogString(c))
    } else {
      log(`XX REFUSE sectionWordMarkup ${stringifyCodeLogString(marker)}, unreachable code path ${inputStreamEndString(input, stack)}`)
      return
    }
  }
}

export const sectionWordBold_tokenizer = new ExternalTokenizer((input, stack) => {
  sectionWordMarkup(input, stack, STAR, sectionwordBold)
})

export const sectionWordItalic_tokenizer = new ExternalTokenizer((input, stack) => {
  sectionWordMarkup(input, stack, '/'.charCodeAt(0), sectionwordItalic)
})

export const sectionWordUnderline_tokenizer = new ExternalTokenizer((input, stack) => {
  sectionWordMarkup(input, stack, '_'.charCodeAt(0), sectionwordUnderline)
})

export const sectionWordVerbatim_tokenizer = new ExternalTokenizer((input, stack) => {
  sectionWordMarkup(input, stack, '='.charCodeAt(0), sectionwordVerbatim)
})

export const sectionWordCode_tokenizer = new ExternalTokenizer((input, stack) => {
  sectionWordMarkup(input, stack, '~'.charCodeAt(0), sectionwordCode)
})

export const sectionWordStrikeThrough_tokenizer = new ExternalTokenizer((input, stack) => {
  sectionWordMarkup(input, stack, '+'.charCodeAt(0), sectionwordStrikeThrough)
})

function checkEndOfTextMarkup(input: InputStream, stack: Stack, marker: number) {
  const MARKER = marker
  const previous = input.peek(-1)
  const current = input.peek(0)
  if (isWhiteSpace(previous) || isEndOfLine(previous)) {
    log(`previous is whitespace ${stringifyCodeLogString(previous)}`)
    return false
  }
  log(`current ${stringifyCodeLogString(current)}`)
  if (current !== MARKER) {
    log(`not MARKER ${inputStreamEndString(input, stack)}`)
    return false
  }
  const next = input.peek(1)
  log(`next ${stringifyCodeLogString(next)}`)
  if (!checkMarkupPOST(next)) {
    log(`no POST ${inputStreamEndString(input, stack)}`)
    return false
  }
  return true
}

export const isStartOfTextMarkup_lookaround = new ExternalTokenizer((input, stack) => {
  const termsByMarker = new Map([
    [STAR, isStartOfTextBold],
    ['/'.charCodeAt(0), isStartOfTextItalic],
    ['_'.charCodeAt(0), isStartOfTextUnderline],
    ['='.charCodeAt(0), isStartOfTextVerbatim],
    ['~'.charCodeAt(0), isStartOfTextCode],
    ['+'.charCodeAt(0), isStartOfTextStrikeThrough],
  ])
  isStartOfTextMarkup(input, stack, termsByMarker, false)
})

export const isStartOfTitleTextMarkup_lookaround = new ExternalTokenizer((input, stack) => {
  const termsByMarker = new Map([
    [STAR, isStartOfTitleTextBold],
    ['/'.charCodeAt(0), isStartOfTitleTextItalic],
    ['_'.charCodeAt(0), isStartOfTitleTextUnderline],
    ['='.charCodeAt(0), isStartOfTitleTextVerbatim],
    ['~'.charCodeAt(0), isStartOfTitleTextCode],
    ['+'.charCodeAt(0), isStartOfTitleTextStrikeThrough],
  ])
  isStartOfTextMarkup(input, stack, termsByMarker, true)
})

function isStartOfTextMarkup(input: InputStream, stack: Stack, termsByMarker: Map<number, number>, noEndOfLine: boolean) {
  const initialPos = input.pos
  log(`-- START isStartOfTextMarkup ${inputStreamBeginString(input)}`)
  const previous = input.peek(-1)
  log(`previous ${stringifyCodeLogString(previous)}`)
  if (!checkMarkupPRE(previous)) {
    log(`XX REFUSE isStartOfTextMarkup, not preceded by PRE ${inputStreamEndString(input, stack)}`)
    return
  }
  let c = input.peek(0)
  log(stringifyCodeLogString(c))
  if (!termsByMarker.has(c)) {
    log(`XX REFUSE isStartOfTextMarkup, not starting with a textmarkup marker ${inputStreamEndString(input, stack)}`)
    return
  }
  const MARKER = c
  const term = termsByMarker.get(MARKER)
  if (isEndOfLine(previous) && c === STAR) {
    let peek_distance = 1
    c = input.peek(peek_distance)
    while (c === STAR) {
      peek_distance += 1
      c = input.peek(peek_distance)
    }
    if (isWhiteSpace(c)) {
      log(`XX REFUSE isStartOfTextMarkup, start of heading ${inputStreamEndString(input, stack)}`)
      return
    }
  }
  c = input.advance()
  log(stringifyCodeLogString(c))
  if (isWhiteSpace(c)) {
    log(`XX REFUSE isStartOfTextMarkup, ${stringifyCodeLogString(MARKER)} followed by whitespace ${inputStreamEndString(input, stack)}`)
    return
  } else if (isEndOfLine(c)) {
    log(`XX REFUSE isStartOfTextMarkup, ${stringifyCodeLogString(MARKER)} followed by endofline ${inputStreamEndString(input, stack)}`)
    return
  } else if (c === MARKER && checkEndOfTextMarkup(input, stack, MARKER)) {
      log(`== REFUSE isStartOfTextMarkup double marker ${inputStreamEndString(input, stack)}`)
      return
  }
  while (true) {
    while (c !== MARKER && !isEndOfLine(c)) {
      c = input.advance()
      log(stringifyCodeLogString(c))
    }
    if (c === EOF) {
      log(`== REFUSE isStartOfTextMarkup unfinished EOF ${inputStreamEndString(input, stack)}`)
      return
    } else if (c === MARKER) {
      while (input.peek(1) === MARKER) {
        c = input.advance()
        log(stringifyCodeLogString(c))
      }
      if (checkEndOfTextMarkup(input, stack, MARKER)) {
        input.advance()
        log(`== ACCEPT isStartOfTextMarkup ${inputStreamAccept(input, stack)}`)
        input.acceptToken(term, -(input.pos-initialPos))
        return
      }
    } else {  // NEWLINE
      if (noEndOfLine) {
        log(`XX REFUSE isStartOfTextMarkup reached endofline ${inputStreamEndString(input, stack)}`)
        return
      }
      if (isWhiteSpace(input.peek(1)) || isEndOfLine(input.peek(1))) {
        let peek_distance = 1
        while (isWhiteSpace(input.peek(peek_distance))) {
          peek_distance += 1
        }
        if (isEndOfLine(input.peek(peek_distance))) {
          log(`XX REFUSE isStartOfTextMarkup unfinished blank line ${inputStreamEndString(input, stack)}`)
          return
        }
      } else if (input.peek(1) == STAR) {
        let peek_distance = 1
        c = input.peek(peek_distance)
        while (c === STAR) {
          peek_distance += 1
          c = input.peek(peek_distance)
        }
        if (isWhiteSpace(c)) {
          log(`XX REFUSE isStartOfTextMarkup, start of heading ${inputStreamEndString(input, stack)}`)
          return
        }
      } else if (input.peek(1) == HASH) {
          log(`XX REFUSE isStartOfTextMarkup, start of comment ${inputStreamEndString(input, stack)}`)
          return
      } else { }  // regular newline
    }
    c = input.advance()
    log(stringifyCodeLogString(c))
  }
}

export const titleWord_tokenizer = new ExternalTokenizer((input, stack) => {
  log(`-- START titleWord ${inputStreamBeginString(input)}`)
  let c = input.peek(0)
  if (c === EOF) {
    log(`XX REFUSE titleWord, only EOF left ${inputStreamEndString(input, stack)}`)
    return
  }
  log(stringifyCodeLogString(c))
  if (isWhiteSpace(c) || isEndOfLine(c)) {
    log(`XX REFUSE titleWord, whitespace ${inputStreamEndString(input, stack)}`)
    return
  }
  if (c === COLON && checkTags(input, false)) {
    log(`XX REFUSE titleWord, Tags ${inputStreamEndString(input, stack)}`)
    return
  }
  while (!isWhiteSpace(c) && !isEndOfLine(c)) {
    c = input.advance()
    log(stringifyCodeLogString(c))
  }
  log(`== ACCEPT titleWord ${inputStreamAccept(input, stack)}`)
  input.acceptToken(titleWord)
  return
});

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
  const context: OrgContext = stack.context
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

export const shouldIndentHeading_lookaround = new ExternalTokenizer((input, stack) => {
  const context: OrgContext = stack.context
  log(`-- START shouldIndentHeading ${inputStreamBeginString(input)}`)
  let nextHeadingLevel = checkStartOfHeading(input)
  if (!nextHeadingLevel) {
    log(`XX REFUSE shouldIndentHeading, not heading ${inputStreamEndString(input, stack)}`)
    return
  }
  if (context.headingLevelStack.length === 0) {
    log(`== ACCEPT shouldIndentHeading A ${inputStreamAccept(input, stack)}`)
    input.acceptToken(shouldIndentHeading)
    return
  }
  const currentHeadingLevel = context.headingLevelStack[context.headingLevelStack.length-1]
  if (nextHeadingLevel > currentHeadingLevel) {
    log(`== ACCEPT shouldIndentHeading B ${inputStreamAccept(input, stack)}`)
    input.acceptToken(shouldIndentHeading)
    return
  }
  log(`XX REFUSE shouldIndentHeading ${inputStreamEndString(input, stack)}`)
  return
})
export const indentHeading_lookaround = new ExternalTokenizer((input, stack) => {
  const context: OrgContext = stack.context
  let nextHeadingLevel = checkStartOfHeading(input)
  if (!nextHeadingLevel) {
    return
  }
  context.levelHeadingToPush = nextHeadingLevel
  input.acceptToken(indentHeading)
  return
})

export const shouldDedentHeading_lookaround = new ExternalTokenizer((input, stack) => {
  const context: OrgContext = stack.context
  log(`-- START shouldDedentHeading ${inputStreamBeginString(input)}`)
  if (input.peek(0) === EOF) {
    log(`== ACCEPT shouldDedentHeading F ${inputStreamAccept(input, stack)}`)
    input.acceptToken(shouldDedentHeading)
    return
  }
  let nextHeadingLevel = checkStartOfHeading(input)
  if (!nextHeadingLevel) {
    log(`XX REFUSE shouldDedentHeading G ${inputStreamEndString(input, stack)}`)
    return
  }
  if (context.headingLevelStack.length == 0) {
    log(`XX REFUSE shouldDedentHeading A ${inputStreamEndString(input, stack)}`)
    return
  }
  const currentHeadingLevel = context.headingLevelStack[context.headingLevelStack.length-1]
  if (nextHeadingLevel <= currentHeadingLevel) {
    log(`== ACCEPT shouldDedentHeading Z ${inputStreamAccept(input, stack)}`)
    input.acceptToken(shouldDedentHeading)
    return
  }
  log(`XX REFUSE shouldDedentHeading B ${inputStreamEndString(input, stack)}`)
  return
})

export const dedentHeading_lookaround = new ExternalTokenizer((input: InputStream, stack: Stack) => {
  input.acceptToken(dedentHeading)
  return
})

export const plainLink_tokenizer = (orgLinkParameters: string[]) => { return new ExternalTokenizer((input, stack) => {
    const pathPlainRegex = /(?:[^ \t\n\[\]<>()]|\((?:[^ \t\n\[\]<>()]|\([^ \t\n\[\]<>()]*\))*\))+(?:[^[:punct:] \t\n]|\/|\((?:[^ \t\n\[\]<>()]|\([^ \t\n\[\]<>()]*\))*\))/
    log(`-- START plainLink ${inputStreamBeginString(input)}`)
    let c = input.peek(0)
    if (c === EOF) {
      log(`XX REFUSE plainLink, only EOF left ${inputStreamEndString(input, stack)}`)
      return
    }
    log(stringifyCodeLogString(c))
    if (isWhiteSpace(c) || isEndOfLine(c)) {
      log(`XX REFUSE plainLink, whitespace ${inputStreamEndString(input, stack)}`)
      return
    }
    let s = String.fromCharCode(c)
    while (!isWhiteSpace(c) && !isEndOfLine(c)) {
      c = input.advance()
      s += String.fromCharCode(c)
      log(stringifyCodeLogString(c))
    }
    s = s.slice(0, s.length-1)
    const [linkType, ...pathPlainSplit] = s.split(":")
    const pathPlain = pathPlainSplit.join(":")
    if (!orgLinkParameters.includes(linkType)) {
      log(`XX REFUSE plainLink, not correct linkType ${inputStreamEndString(input, stack)}`)
      return
    }
    if (!pathPlainRegex.test(pathPlain) && linkType != 'id') {
      log(`XX REFUSE plainLink, not correct pathPlain ${inputStreamEndString(input, stack)}`)
      return
    }
    log(`== ACCEPT plainLink ${inputStreamAccept(input, stack)}`)
    input.acceptToken(PlainLink)
    return
  })
}

const checkRegularLink = (innerBracketText: string): boolean => {
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

export const regularLink_lookaround = (orgLinkParameters: string[]) => { return new ExternalTokenizer((input, stack) => {
  log(`-- START regularLink_lookaround ${inputStreamBeginString(input)}`)
  const initialPos = input.pos
  const L_SQUARE_BRACKET = '['.charCodeAt(0)
  const R_SQUARE_BRACKET = ']'.charCodeAt(0)
  if (input.peek(0) !== L_SQUARE_BRACKET || input.peek(1) !== L_SQUARE_BRACKET) {
    log(`XX REFUSE regularLink_lookaround ${inputStreamEndString(input, stack)}`)
    return
  }
  input.advance()
  let c = input.advance()
  let s = ""
  while (true) {
    while (c !== R_SQUARE_BRACKET && !isEndOfLine(c)) {
      s += String.fromCharCode(c)
      c = input.advance()
    }
    if (isEndOfLine(c)) {
      log(`XX REFUSE regularLink_lookaround, EOL ${inputStreamEndString(input, stack)}`)
      return
    } else if (input.peek(0) === R_SQUARE_BRACKET && input.peek(1) === R_SQUARE_BRACKET) {
      if (checkRegularLink(s)) {
        input.advance()
        input.advance()
        input.acceptToken(isRegularLink, -(input.pos-initialPos))
        log(`== ACCEPT regularLink_lookaround, EOL ${inputStreamAccept(input, stack)}`)
        return
      }
      log(`XX REFUSE regularLink_lookaround ${inputStreamEndString(input, stack)}`)
      return
    }
    s += String.fromCharCode(c)
    c = input.advance()
  }
  })
}

export const angleLink_lookaround = (orgLinkParameters: string[]) => { return new ExternalTokenizer((input, stack) => {
    const initialPos = input.pos
    const L_ANGLE_BRACKET = '<'.charCodeAt(0)
    const R_ANGLE_BRACKET = '>'.charCodeAt(0)
    let c = input.peek(0)
    if (c !== L_ANGLE_BRACKET) {
      return
    }
    let linkTypeMatched = false
    let linkTypeCandidate = ""
    const maxLength = orgLinkParameters.reduce((acc,v)=>Math.max(acc, v.length), 0)
    while (true) {
      c = input.advance()
      while (c !== COLON && !isEndOfLine(c) && c !== R_ANGLE_BRACKET) {
        if (!linkTypeMatched && linkTypeCandidate.length < maxLength) {
          linkTypeCandidate += String.fromCharCode(c)
        }
        c = input.advance()
      }
      if (c === COLON) {
        if (!linkTypeMatched && orgLinkParameters.includes(linkTypeCandidate)) {
          linkTypeMatched = true
        }
      } else if (c === EOF) {
        return
      } else if (c === NEW_LINE) {
        let peek_distance = 1
        while (isWhiteSpace(input.peek(peek_distance))) {
          peek_distance += 1
        }
        if (isEndOfLine(input.peek(peek_distance))) {
          log(`XX REFUSE isAngleLink unfinished blank line ${inputStreamEndString(input, stack)}`)
          return
        }
      } else if (c === R_ANGLE_BRACKET) {
        if (linkTypeMatched) {
          input.advance()
          input.acceptToken(isAngleLink, -(input.pos-initialPos))
          return
        }
        return
      }
    }
  })
}

function sectionWordLink(input: InputStream, stack: Stack, end: number[], term: number) {
  const endFirstChar = end[0]
  log(`-- START sectionWordLink ${stringifyCodesLogString(end)} ${inputStreamBeginString(input)}`)
  let c = input.peek(0)
  log(stringifyCodeLogString(c))
  if (isWhiteSpace(c)) {
    log(`XX REFUSE sectionWordLink ${stringifyCodesLogString(end)}, whitespace or endofline ${inputStreamEndString(input, stack)}`)
    return
  }
  while (true) {
    while (!isWhiteSpace(c) && !isEndOfLine(c) && c !== endFirstChar) {
      c = input.advance()
      log(stringifyCodeLogString(c))
    }
    if (c === EOF) {
      log(`== ACCEPT sectionWordLink ${stringifyCodesLogString(end)} before eof ${inputStreamAccept(input, stack)}`)
      input.acceptToken(term)
      return
    } else if (c === NEW_LINE) {
      c = input.advance()
      log(stringifyCodeLogString(c))
    } else if (isWhiteSpace(c)) {
      log(`== ACCEPT sectionWordLink ${stringifyCodesLogString(end)} before whitespace ${inputStreamAccept(input, stack)}`)
      input.acceptToken(term)
      return
    } else if (c === endFirstChar) {
      let peek_distance = 1
      while (end.length > peek_distance) {
        if (input.peek(peek_distance) !== end[peek_distance]) {
          break
        }
        peek_distance += 1
      }
      if (peek_distance === end.length) {
        log(`== ACCEPT sectionWordLink ${stringifyCodesLogString(end)} ${inputStreamAccept(input, stack)}`)
        input.acceptToken(term)
        return
      } else {
        c = input.advance()
        log(stringifyCodeLogString(c))
      }
    } else {
      log(`XX REFUSE sectionWordLink ${stringifyCodesLogString(end)}, unreachable code path ${inputStreamEndString(input, stack)}`)
      return
    }
  }
}

export const sectionWordRegularLink_tokenizer = new ExternalTokenizer((input, stack) => {
  sectionWordLink(input, stack, [']'.charCodeAt(0), ']'.charCodeAt(0)], sectionWordRegularLink)
})

export const sectionWordAngleLink_tokenizer = new ExternalTokenizer((input, stack) => {
  sectionWordLink(input, stack, ['>'.charCodeAt(0)], sectionWordAngleLink)
})


class OrgContext {
  headingLevelStack: number[]
  hash: number
  levelHeadingToPush: number
  constructor(headingLevelStack: number[], levelHeadingToPush: number) {
    this.headingLevelStack = headingLevelStack
    this.levelHeadingToPush = levelHeadingToPush
    this.hash = this.hashCompute()
  }
  hashCompute() {
    let hash = 0
    let bitmask = 0
    for (let headingLevel of this.headingLevelStack) {
      hash += headingLevel << (bitmask=bitmask+10)
    }
    hash += this.levelHeadingToPush << (bitmask=bitmask+10)
    return hash
  }
}

export const context_tracker = new ContextTracker({
  start: new OrgContext([], null),
  shift(context: OrgContext, term: number, stack: Stack, input: InputStream) {
    let headingLevelStack = [...context.headingLevelStack]
    let levelHeadingToPush = context.levelHeadingToPush
    if (term === indentHeading) {
      const toPush = levelHeadingToPush
      levelHeadingToPush = null
      headingLevelStack.push(toPush)
    }
    if (term === dedentHeading) {
      const toPop = headingLevelStack[headingLevelStack.length-1]
      headingLevelStack.pop()
    }
    return new OrgContext(headingLevelStack, levelHeadingToPush)
  },
  hash: context => context.hash
})

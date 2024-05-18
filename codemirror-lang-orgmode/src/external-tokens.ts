import { ExternalTokenizer, InputStream, Stack } from '@lezer/lr';
import {
  TodoKeyword, Priority, Title, endofline,
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
  isEndOfTextBold,
  isEndOfTextItalic,
  isEndOfTextUnderline,
  isEndOfTextVerbatim,
  isEndOfTextCode,
  isEndOfTextStrikeThrough,
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

function inputStreamEndString(input: InputStream): string {
  return `at ${input.pos-1}:"${stringifyCodeLogString(input.peek(-1))}"`
}

function isWhiteSpace(charCode: number) {
  return charCode === SPACE || charCode === TAB
}

function isEndOfLine(charCode: number) {
  return charCode === NEW_LINE || charCode === SOF || charCode === EOF
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
  let is_matching_tags = false
  if (isEndOfLine(c)) {
    log(`== ACCEPT Title empty ${inputStreamEndString(input)}`)
    input.acceptToken(Title)
    return
  }
  while (!isEndOfLine(c)) {
    while (c != COLON && !isEndOfLine(c)) {
      c = input.advance()
      s += String.fromCharCode(c)
      log(`${stringifyCodeLogString(c)}`)
      if (!priority_already_matched && checkPriority(s)) {
        log(`XX REFUSE Title, is priority ${inputStreamEndString(input)}`)
        return
      }
      if (!todo_keyword_already_matched && checkTodoKeyword(s, input, words)) {
        if (isWhiteSpace(input.peek(1))) {
          log(`XX REFUSE Title, is TodoKeyword ${inputStreamEndString(input)}`)
          return
        }
      }
    }
    if (isEndOfLine(c)) {
      input.acceptToken(Title)
      log(`== ACCEPT Title 1 ${inputStreamEndString(input)}`)
      return
    }
    if (c == COLON) {
      log(`title_tokenizer ${input.pos}: first colon`)
      is_matching_tags = true
      let peek_distance = 1
      c = input.peek(peek_distance)
      log(`peeking a: ${stringifyCodeLogString(c)}`)
      while (is_matching_tags) {
        peek_distance += 1
        c = input.peek(peek_distance)
        log(`peeking b: ${stringifyCodeLogString(c)}`)
        if (isEndOfLine(c)) {
          log(`case 1`)
          // example ":eiofje\n" unfinished tag
          is_matching_tags = false
          break;
        }
        if (!String.fromCharCode(c).match(/[a-zA-Z0-9_@#%:]/)) {
          log(`case 2`)
          // example ":tag1 " tags cannot contain space
          is_matching_tags = false
          break
        }
        if (c == COLON) {
          log(`case 3`)
          log(`title_tokenizer ${input.pos}: second colon`)
          let extra_peek_distance = 1
          c = input.peek(peek_distance + extra_peek_distance)
          log(`peeking c: ${stringifyCodeLogString(c)}`)
          if (isEndOfLine(c)) {
            // example ":tag1:\n"
            input.acceptToken(Title)  // accept token before the tags
            log(`== ACCEPT title 2 ${inputStreamEndString(input)}`)
            return
          } else if (isWhiteSpace(c)) {
            while (isWhiteSpace(c)) {
              extra_peek_distance += 1
              c = input.peek(peek_distance + extra_peek_distance)
              log(`peeking d: ${stringifyCodeLogString(c)}`)
            }
            if (isEndOfLine(c)) {
              // example ":tag1: \n"
              input.acceptToken(Title)  // accept token before the tags
              log(`== ACCEPT Title 3 ${inputStreamEndString(input)}`)
              return
            } else {
              // example ":tag1:a\n" extra chars after tags
              is_matching_tags = false
              break
            }
          } else if (String.fromCharCode(c).match(/[a-zA-Z0-9_@#%:]/)) {
            // do nothing just wait for another loop
          } else {
            // example: ":tag1:中" char not part of tags
            is_matching_tags = false
            break
          }
        }
        log(`title_tokenizer ${input.pos}: was not a tag`)
      }  // end is_matching_tags
      c = input.advance()
      s += String.fromCharCode(c)
      log(`${stringifyCodeLogString(c)}`)
      if (!priority_already_matched && checkPriority(s)) {
        log(`XX REFUSE Title, is Priority ${inputStreamEndString(input)}`)
        return
      }
      if (!todo_keyword_already_matched && checkTodoKeyword(s, input, words)) {
        if (isWhiteSpace(input.peek(1))) {
          log(`XX REFUSE Title, is TodoKeyword ${inputStreamEndString(input)}`)
          return
        }
      }
    }
  }
  input.acceptToken(Title)
  log(`== ACCEPT Title 4 ${inputStreamEndString(input)}`)
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
        log(`== ACCEPT TodoKeyword ${inputStreamEndString(input)}`)
        input.acceptToken(TodoKeyword)
        return
      }
    }
    i += 1
    c = input.advance()
    log(`${stringifyCodeLogString(c)}`)
    s += String.fromCharCode(c)
  }
  log(`XX REFUSE TodoKeyword ${inputStreamEndString(input)}`)
  return
})
}

export const endofline_tokenizer = new ExternalTokenizer((input, stack) => {
  log(`-- START endofline ${inputStreamBeginString(input)}`)
  let previous = input.peek(-1)
  if (isEndOfLine(previous)) {
    log(`XX REFUSE endofline, previous not endofline ${inputStreamEndString(input)}`)
    return
  }
  let c = input.peek(0)
  log(stringifyCodeLogString(c))
  while (!isEndOfLine(c)) {
    c = input.advance()
    log(stringifyCodeLogString(c))
  }
  if (c === EOF) {
    log(`== ACCEPT endofline EOF ${inputStreamEndString(input)}`)
    input.acceptToken(endofline)
  } else { // NEW_LINE
    input.advance()
    log(`== ACCEPT endofline NEWLINE ${inputStreamEndString(input)}`)
    input.acceptToken(endofline)
  }
});

export const notStartOfPlanning_lookaround = new ExternalTokenizer((input, stack) => {
  log(`-- START notStartOfPlanning ${inputStreamBeginString(input)}`)
  // sectionLineStart { ( ("*"+ ![ \t*]) | ![#*] ) }
  const previous = input.peek(-1)
  log(`previous ${stringifyCodeLogString(previous)}`)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE notStartOfPlanning, previous not endofline ${inputStreamEndString(input)}`)
    return
  }
  let c = input.peek(0)
  let planning_word = String.fromCharCode(c)
  log(stringifyCodeLogString(c))
  if (c === EOF) {
      log(`XX REFUSE notStartOfPlanning, only EOF left ${inputStreamEndString(input)}`)
      return
  } else if (c === COLON) {
    planning_word = ''
  } else if (c === HASH) {
    log(`XX REFUSE notStartOfPlanning, start of comment ${inputStreamEndString(input)}`)
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
      log(`XX REFUSE notStartOfPlanning, start of heading ${inputStreamEndString(input)}`)
      return // start of HEADING
    }
  }
  if (c === HASH) {
    log(`XX REFUSE notStartOfPlanning, start of comment ${inputStreamEndString(input)}`)
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
        log(`XX REFUSE notStartOfPlanning, start of Planning ${inputStreamEndString(input)}`)
        return
      }
    }
    planning_word += String.fromCharCode(c)
    log(`word [${planning_word}]`)
  }
  if (c === EOF) {
    log(`== ACCEPT notStartOfPlanning before eof ${inputStreamEndString(input)}`)
    input.acceptToken(notStartOfPlanning)
    return
  } else if (c === NEW_LINE && input.peek(primary_peek_distance + 1) === EOF) {
    primary_peek_distance += 1
    input.acceptToken(notStartOfPlanning)
    log(`== ACCEPT last notStartOfPlanning before EOF with a trailing newline ${inputStreamEndString(input)}`)
    return
  } else if (c === NEW_LINE) {
    primary_peek_distance += 1
    log(`== ACCEPT notStartOfPlanning before newline ${inputStreamEndString(input)}`)
    input.acceptToken(notStartOfPlanning)
    return
  }
  log(`== ACCEPT notStartOfPlanning by default ${inputStreamEndString(input)}`)
  input.acceptToken(notStartOfPlanning)
  return
})

export const notStartOfPropertyDrawer_lookaround = new ExternalTokenizer((input, stack) => {
  log(`-- START notStartOfPropertyDrawer ${inputStreamBeginString(input)}`)
  // sectionLineStart { ( ("*"+ ![ \t*]) | ![#*] ) }
  const previous = input.peek(-1)
  log(`previous ${stringifyCodeLogString(previous)}`)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE notStartOfPropertyDrawer, previous not endofline ${inputStreamEndString(input)}`)
    return
  }
  let c = input.peek(0)
  let planning_word = String.fromCharCode(c)
  let could_be_property_drawer = false
  log(stringifyCodeLogString(c))
  if (c === EOF) {
      log(`XX REFUSE notStartOfPropertyDrawer, only EOF left ${inputStreamEndString(input)}`)
      return
  } else if (c === COLON) {
    could_be_property_drawer = true
    planning_word = ''
  } else if (c === HASH) {
    log(`XX REFUSE notStartOfPropertyDrawer, start of comment ${inputStreamEndString(input)}`)
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
      log(`XX REFUSE notStartOfPropertyDrawer, start of heading ${inputStreamEndString(input)}`)
      return // start of HEADING
    }
  }
  if (c === HASH) {
    log(`XX REFUSE notStartOfPropertyDrawer, start of comment ${inputStreamEndString(input)}`)
    return
  }
  let primary_peek_distance = 0
  while (!isEndOfLine(c)) {
    primary_peek_distance += 1
    c = input.peek(primary_peek_distance)
    log(stringifyCodeLogString(c))
    if (c === COLON) {
      if (could_be_property_drawer && planning_word.toUpperCase() === 'PROPERTIES') {
        log(`XX REFUSE notStartOfPropertyDrawer, start of PropertyDrawer ${inputStreamEndString(input)}`)
        return
      }
    }
    planning_word += String.fromCharCode(c)
    log(`word [${planning_word}]`)
  }
  if (c === EOF) {
    log(`== ACCEPT notStartOfPropertyDrawer before eof ${inputStreamEndString(input)}`)
    input.acceptToken(notStartOfPropertyDrawer)
    return
  } else if (c === NEW_LINE && input.peek(primary_peek_distance + 1) === EOF) {
    primary_peek_distance += 1
    input.acceptToken(notStartOfPropertyDrawer)
    log(`== ACCEPT last notStartOfPropertyDrawer before EOF with a trailing newline ${inputStreamEndString(input)}`)
    return
  } else if (c === NEW_LINE) {
    primary_peek_distance += 1
    log(`== ACCEPT notStartOfPropertyDrawer before newline ${inputStreamEndString(input)}`)
    input.acceptToken(notStartOfPropertyDrawer)
    return
  }
  log(`== ACCEPT notStartOfPropertyDrawer by default ${inputStreamEndString(input)}`)
  input.acceptToken(notStartOfPropertyDrawer)
  return
})

export const propertydrawer_tokenizer = new ExternalTokenizer((input, stack) => {
  // PropertyDrawer { ":PROPERTIES:" ![:]+ ":END:" } // with newline before and after
  log(`-- START PropertyDrawer ${inputStreamBeginString(input)}`)
  const previous = input.peek(-1)
  log(`previous ${stringifyCodeLogString(previous)}`)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE PropertyDrawer, previous not endofline ${inputStreamEndString(input)}`)
    return
  }
  let c = input.peek(0)
  log(stringifyCodeLogString(c))
  if (c !== COLON) {
    log(`XX REFUSE PropertyDrawer, first not colon ${inputStreamEndString(input)}`)
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
            log(`== ACCEPT PropertyDrawer ${inputStreamEndString(input)}`)
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
      log(`XX REFUSE PropertyDrawer, no :PROPERTIES: on first line ${inputStreamEndString(input)}`)
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
  log(`== ACCEPT PropertyDrawer EOF reached without :END: ${inputStreamEndString(input)}`)
  return
});


export const notStartOfHeading_lookaround = new ExternalTokenizer((input, stack) => {
  log(`-- START notStartOfHeading_lookaround ${inputStreamBeginString(input)}`)
  const previous = input.peek(-1)
  log(`previous ${stringifyCodeLogString(previous)}`)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE notStartOfHeading_lookaround, previous not endofline ${inputStreamEndString(input)}`)
    return
  }
  let c = input.peek(0)
  log(stringifyCodeLogString(c))
  if (c === STAR) {
    // only start of heading if it matches the stars token { "*"+ $[ \t]+ }
    let peek_distance = 1
    let peek_c = input.peek(peek_distance)
    while (peek_c == STAR) {
      peek_distance += 1
      peek_c = input.peek(peek_distance)
    }
    if (isWhiteSpace(peek_c)) {
      log(`XX REFUSE notStartOfHeading_lookaround, start of heading ${inputStreamEndString(input)}`)
      return // start of HEADING
    }
  } else if (c === EOF) {
    log(`XX REFUSE notStartOfHeading_lookaround, EOF ${inputStreamEndString(input)}`)
    return // start of HEADING
  }
  log(`== ACCEPT notStartOfHeading_lookaround ${inputStreamEndString(input)}`)
  input.acceptToken(notStartOfHeading)
  return
});

export const notStartOfComment_lookaround = new ExternalTokenizer((input, stack) => {
  log(`-- START notStartOfComment_lookaround ${inputStreamBeginString(input)}`)
  const previous = input.peek(-1)
  log(`previous ${stringifyCodeLogString(previous)}`)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE notStartOfComment_lookaround, previous not endofline ${inputStreamEndString(input)}`)
    return
  }
  let c = input.peek(0)
  log(stringifyCodeLogString(c))
  if (c === HASH) {
    log(`XX REFUSE notStartOfComment_lookaround, start of comment ${inputStreamEndString(input)}`)
    return
  }
  log(`== ACCEPT notStartOfComment_lookaround ${inputStreamEndString(input)}`)
  input.acceptToken(notStartOfComment)
  return
});

export const sectionWord_tokenizer = new ExternalTokenizer((input, stack) => {
  log(`-- START sectionWord ${inputStreamBeginString(input)}`)
  let c = input.peek(0)
  if (c === EOF) {
    log(`XX REFUSE sectionWord, only EOF left ${inputStreamEndString(input)}`)
    return
  }
  log(stringifyCodeLogString(c))
  if (isWhiteSpace(c) || isEndOfLine(c)) {
    log(`XX REFUSE sectionWord, whitespace ${inputStreamEndString(input)}`)
    return
  }
  while (!isWhiteSpace(c) && !isEndOfLine(c)) {
    c = input.advance()
    log(stringifyCodeLogString(c))
  }
  log(`== ACCEPT sectionWord ${inputStreamEndString(input)}`)
  input.acceptToken(sectionword)
  return
});

export const sectionSpace_tokenizer = new ExternalTokenizer((input, stack) => {
  log(`-- START sectionSpace ${inputStreamBeginString(input)}`)
  let c = input.peek(0)
  if (c === EOF) {
    log(`XX REFUSE sectionSpace, only EOF left ${inputStreamEndString(input)}`)
    return
  }
  if (!isWhiteSpace(c)) {
    log(`XX REFUSE sectionSpace, not whitespace ${inputStreamEndString(input)}`)
    return
  }
  log(stringifyCodeLogString(c))
  while (isWhiteSpace(c)) {
    c = input.advance()
    log(stringifyCodeLogString(c))
  }
  log(`== ACCEPT sectionSpace ${inputStreamEndString(input)}`)
  input.acceptToken(sectionSpace)
  return
});

export const sectionEnd_tokenizer = new ExternalTokenizer((input, stack) => {
  log(`-- START sectionEnd ${inputStreamBeginString(input)}`)
  let c = input.peek(0)
  if (isEndOfLine(c)) {
    input.advance()
    log(`== ACCEPT sectionEnd ${inputStreamEndString(input)}`)
    input.acceptToken(sectionEnd)
    return
  }
  log(`XX REFUSE sectionSpace, ${inputStreamEndString(input)}`)
  return
});

export function sectionWordMarkup(input: InputStream, marker: number, term: number) {
  const MARKER = marker
  log(`-- START sectionWordMarkup ${stringifyCodeLogString(marker)} ${inputStreamBeginString(input)}`)
  let c = input.peek(0)
  log(stringifyCodeLogString(c))
  if (isWhiteSpace(c)) {
    log(`XX REFUSE sectionWordMarkup ${stringifyCodeLogString(marker)}, whitespace or endofline ${inputStreamEndString(input)}`)
    return
  }
  while (true) {
    while (!isWhiteSpace(c) && !isEndOfLine(c) && c !== MARKER) {
      c = input.advance()
      log(stringifyCodeLogString(c))
    }
    if (c === EOF) {
      log(`== ACCEPT sectionWordMarkup ${stringifyCodeLogString(marker)} before eof ${inputStreamEndString(input)}`)
      input.acceptToken(term)
      return
    } else if (c === NEW_LINE) {
      c = input.advance()
      log(stringifyCodeLogString(c))
    } else if (isWhiteSpace(c)) {
      log(`== ACCEPT sectionWordMarkup ${stringifyCodeLogString(marker)} before whitespace ${inputStreamEndString(input)}`)
      input.acceptToken(term)
      return
    } else if (c === MARKER) {
      if (checkEndOfTextMarkup(input, MARKER)) {
        log(`== ACCEPT sectionWordMarkup ${stringifyCodeLogString(marker)} at stuff ${inputStreamEndString(input)}`)
        input.acceptToken(term)
        return
      }
      c = input.advance()
      log(stringifyCodeLogString(c))
    } else {
      log(`XX REFUSE sectionWordMarkup ${stringifyCodeLogString(marker)}, unreachable code path ${inputStreamEndString(input)}`)
      return
    }
  }
}

export const sectionWordBold_tokenizer = new ExternalTokenizer((input, stack) => {
  sectionWordMarkup(input, STAR, sectionwordBold)
})

export const sectionWordItalic_tokenizer = new ExternalTokenizer((input, stack) => {
  sectionWordMarkup(input, '/'.charCodeAt(0), sectionwordItalic)
})

export const sectionWordUnderline_tokenizer = new ExternalTokenizer((input, stack) => {
  sectionWordMarkup(input, '_'.charCodeAt(0), sectionwordUnderline)
})

export const sectionWordVerbatim_tokenizer = new ExternalTokenizer((input, stack) => {
  sectionWordMarkup(input, '='.charCodeAt(0), sectionwordVerbatim)
})

export const sectionWordCode_tokenizer = new ExternalTokenizer((input, stack) => {
  sectionWordMarkup(input, '~'.charCodeAt(0), sectionwordCode)
})

export const sectionWordStrikeThrough_tokenizer = new ExternalTokenizer((input, stack) => {
  sectionWordMarkup(input, '+'.charCodeAt(0), sectionwordStrikeThrough)
})

export function checkEndOfTextMarkup(input: InputStream, marker: number) {
  const MARKER = marker
  const previous = input.peek(-1)
  const current = input.peek(0)
  if (isWhiteSpace(previous) || isEndOfLine(previous)) {
    log(`previous is whitespace ${stringifyCodeLogString(previous)}`)
    return false
  }
  log(`current ${stringifyCodeLogString(current)}`)
  if (current !== MARKER) {
    log(`not MARKER ${inputStreamEndString(input)}`)
    return false
  }
  const next = input.peek(1)
  log(`next ${stringifyCodeLogString(next)}`)
  if (!checkMarkupPOST(next)) {
    log(`no POST ${inputStreamEndString(input)}`)
    return false
  }
  return true
}

function isEndOfTextMarkup(input: InputStream, marker: number, term: number) {
  const MARKER = marker
  log(`-- START isEndOfTextMarkup ${stringifyCodeLogString(marker)} ${inputStreamBeginString(input)}`)
  if (checkEndOfTextMarkup(input, MARKER)) {
    input.acceptToken(term)
  } else {
    log(`XX REFUSE isEndOfTextMarkup ${stringifyCodeLogString(marker)} ${inputStreamEndString(input)}`)
  }
}

export const isEndOfTextBold_lookaround = new ExternalTokenizer((input, stack) => {
  isEndOfTextMarkup(input, STAR, isEndOfTextBold)
})

export const isEndOfTextItalic_lookaround = new ExternalTokenizer((input, stack) => {
  isEndOfTextMarkup(input, '/'.charCodeAt(0), isEndOfTextItalic)
})

export const isEndOfTextUnderline_lookaround = new ExternalTokenizer((input, stack) => {
  isEndOfTextMarkup(input, '_'.charCodeAt(0), isEndOfTextUnderline)
})

export const isEndOfTextVerbatim_lookaround = new ExternalTokenizer((input, stack) => {
  isEndOfTextMarkup(input, '='.charCodeAt(0), isEndOfTextVerbatim)
})

export const isEndOfTextCode_lookaround = new ExternalTokenizer((input, stack) => {
  isEndOfTextMarkup(input, '~'.charCodeAt(0), isEndOfTextCode)
})

export const isEndOfTextStrikeThrough_lookaround = new ExternalTokenizer((input, stack) => {
  isEndOfTextMarkup(input, '+'.charCodeAt(0), isEndOfTextStrikeThrough)
})



export const isStartOfTextBold_lookaround = new ExternalTokenizer((input, stack) => {
  isStartOfTextMarkup(input, STAR, isStartOfTextBold)
})

export const isStartOfTextItalic_lookaround = new ExternalTokenizer((input, stack) => {
  isStartOfTextMarkup(input, '/'.charCodeAt(0), isStartOfTextItalic)
})

export const isStartOfTextUnderline_lookaround = new ExternalTokenizer((input, stack) => {
  isStartOfTextMarkup(input, '_'.charCodeAt(0), isStartOfTextUnderline)
})

export const isStartOfTextVerbatim_lookaround = new ExternalTokenizer((input, stack) => {
  isStartOfTextMarkup(input, '='.charCodeAt(0), isStartOfTextVerbatim)
})

export const isStartOfTextCode_lookaround = new ExternalTokenizer((input, stack) => {
  isStartOfTextMarkup(input, '~'.charCodeAt(0), isStartOfTextCode)
})

export const isStartOfTextStrikeThrough_lookaround = new ExternalTokenizer((input, stack) => {
  isStartOfTextMarkup(input, '+'.charCodeAt(0), isStartOfTextStrikeThrough)
})


function isStartOfTextMarkup(input: InputStream, marker: number, term: number) {
  const MARKER = marker
  const initialPos = input.pos
  log(`-- START isStartOfTextMarkup ${stringifyCodeLogString(marker)} ${inputStreamBeginString(input)}`)
  const previous = input.peek(-1)
  log(`previous ${stringifyCodeLogString(previous)}`)
  if (!checkMarkupPRE(previous)) {
    log(`XX REFUSE isStartOfTextMarkup, not preceded by PRE ${inputStreamEndString(input)}`)
    return
  }
  let c = input.peek(0)
  log(stringifyCodeLogString(c))
  if (c !== MARKER) {
    log(`XX REFUSE isStartOfTextMarkup, not starting with ${stringifyCodeLogString(MARKER)} ${inputStreamEndString(input)}`)
    return
  }
  if (isEndOfLine(previous) && c === STAR) {
    let peek_distance = 1
    c = input.peek(peek_distance)
    while (c === STAR) {
      peek_distance += 1
      c = input.peek(peek_distance)
    }
    if (isWhiteSpace(c)) {
      log(`XX REFUSE isStartOfTextMarkup, start of heading ${inputStreamEndString(input)}`)
      return
    }
  }
  c = input.advance()
  log(stringifyCodeLogString(c))
  if (isWhiteSpace(input.peek(1))) {
    log(`XX REFUSE isStartOfTextMarkup, ${stringifyCodeLogString(MARKER)} followed by whitespace ${inputStreamEndString(input)}`)
    return
  }
  if (c === MARKER && (isWhiteSpace(input.peek(1)) || isEndOfLine(input.peek(1)))) {
    log(`XX REFUSE isStartOfTextMarkup, double ${stringifyCodeLogString(MARKER)} followed by whitespace ${inputStreamEndString(input)}`)
    return
  }
  while (true) {
    while (c !== MARKER && !isEndOfLine(c)) {
      c = input.advance()
      log(stringifyCodeLogString(c))
    }
    if (c === EOF) {
      log(`== REFUSE isStartOfTextMarkup unfinished EOF ${inputStreamEndString(input)}`)
      return
    } else if (c === MARKER) {
      while (input.peek(1) === MARKER) {
        c = input.advance()
        log(stringifyCodeLogString(c))
      }
      if (checkEndOfTextMarkup(input, MARKER)) {
        input.advance()
        log(`== ACCEPT isStartOfTextMarkup ${inputStreamEndString(input)}`)
        input.acceptToken(term, -(input.pos-initialPos))
        return
      }
      c = input.advance()
      log(stringifyCodeLogString(c))
    } else {  // NEWLINE
      if (isWhiteSpace(input.peek(1)) || isEndOfLine(input.peek(1))) {
        let peek_distance = 1
        while (isWhiteSpace(input.peek(peek_distance))) {
          peek_distance += 1
        }
        if (isEndOfLine(input.peek(peek_distance))) {
          log(`XX REFUSE isStartOfTextMarkup unfinished blank line ${inputStreamEndString(input)}`)
          return
        }
        c = input.advance()
        log(stringifyCodeLogString(c))
      } else if (input.peek(1) == STAR) {
        let peek_distance = 1
        c = input.peek(peek_distance)
        while (c === STAR) {
          peek_distance += 1
          c = input.peek(peek_distance)
        }
        if (isWhiteSpace(c)) {
          log(`XX REFUSE isStartOfTextMarkup, start of heading ${inputStreamEndString(input)}`)
          return
        }
        c = input.advance()
        log(stringifyCodeLogString(c))
      } else if (input.peek(1) == HASH) {
          log(`XX REFUSE isStartOfTextMarkup, start of comment ${inputStreamEndString(input)}`)
          return
      } else {  // regular newline
        c = input.advance()
        log(stringifyCodeLogString(c))
      }
    }
  }
}

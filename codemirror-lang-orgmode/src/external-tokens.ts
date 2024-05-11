import { ExternalTokenizer, InputStream, Stack } from '@lezer/lr';
import {
  TodoKeyword, Priority, Title, endofline,
  PropertyDrawer, Planning,
  sectionLine, sectionLineExcludingPropertyDrawerAndPlanning, sectionLineExcludingPropertyDrawer,
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
    log(`XX REFUSE Title empty ${inputStreamEndString(input)}`)
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

function checkSectionLine(excludePropertyDrawer: boolean, excludePlanning: boolean, input: InputStream, stack: Stack, term: number) {
  // sectionLineStart { ( ("*"+ ![ \t*]) | ![#*] ) }
  let termString = "unknown"
  if (term == sectionLineExcludingPropertyDrawerAndPlanning) {
    termString = "sectionLineExcludingPropertyDrawerAndPlanning"
  } else if (term == sectionLineExcludingPropertyDrawer) {
    termString = "sectionLineExcludingPropertyDrawer"
  } else if (term == sectionLine) {
    termString = "sectionLine"
  }
  const previous = input.peek(-1)
  log(`previous ${stringifyCodeLogString(previous)}`)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE Section Line (${termString}), previous not endofline ${inputStreamEndString(input)}`)
    return
  }
  let c = input.peek(0)
  let planning_word = String.fromCharCode(c)
  let could_be_property_drawer = false
  log(stringifyCodeLogString(c))
  if (c === EOF) {
      log(`XX REFUSE Section Line (${termString}), only EOF left ${inputStreamEndString(input)}`)
      return
  } else if (c === COLON && excludePropertyDrawer) {
    could_be_property_drawer = true
    planning_word = ''
  } else if (c === HASH) {
    log(`XX REFUSE Section Line (${termString}), start of comment ${inputStreamEndString(input)}`)
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
      log(`XX REFUSE Section Line (${termString}), start of heading ${inputStreamEndString(input)}`)
      return // start of HEADING
    }
  }
  if (c === COLON && excludePropertyDrawer) {
    could_be_property_drawer = true
    planning_word = ''
  }
  if (c === HASH) {
    log(`XX REFUSE Section Line (${termString}), start of comment ${inputStreamEndString(input)}`)
    return
  }
  while (!isEndOfLine(c)) {
    c = input.advance()
    log(stringifyCodeLogString(c))
    if (c === COLON) {
      if (could_be_property_drawer && planning_word.toUpperCase() === 'PROPERTIES') {
        log(`XX REFUSE Section Line (${termString}), start of PropertyDrawer ${inputStreamEndString(input)}`)
        return
      }
      if (!could_be_property_drawer && excludePlanning && (
        planning_word.toUpperCase() === 'DEADLINE' ||
        planning_word.toUpperCase() === 'SCHEDULED' ||
        planning_word.toUpperCase() === 'CLOSED')) {
        log(`XX REFUSE Section Line (${termString}), start of Planning ${inputStreamEndString(input)}`)
        return
      }
    }
    planning_word += String.fromCharCode(c)
    log(`word [${planning_word}]`)
  }
  if (c === EOF) {
    log(`== ACCEPT Section Line (${termString}) before eof ${inputStreamEndString(input)}`)
    input.acceptToken(term)
    return
  } else if (c === NEW_LINE && input.peek(1) === EOF) {
    input.advance()
    input.acceptToken(term)
    log(`== ACCEPT last Section Line (${termString}) before EOF with a trailing newline ${inputStreamEndString(input)}`)
    return
  } else if (c === NEW_LINE) {
    input.advance()
    log(`== ACCEPT Section Line (${termString}) before newline ${inputStreamEndString(input)}`)
    input.acceptToken(term)
    return
  }
  log(`next start ${stringifyCodeLogString(input.peek(1))}`)
  if (input.peek(1) === STAR) {
    // only end of section if start of heading matches the stars token { "*"+ $[ \t]+ }
    let peek_distance = 2
    let peek_c = input.peek(peek_distance)
    while (peek_c == STAR) {
      peek_distance += 1
      peek_c = input.peek(peek_distance)
    }
    if (isWhiteSpace(SPACE)) {
      input.advance(peek_distance)
      log(`== ACCEPT Section Line (${termString}) before heading ${inputStreamEndString(input)}`)
      input.acceptToken(term)
      return
    }
  } else if (input.peek(1) === HASH) {
    input.advance()
    log(`== ACCEPT Section Line (${termString}) before comment ${inputStreamEndString(input)}`)
    input.acceptToken(term)
    return
  } else {
    c = input.advance()
  }
  log(`== ACCEPT Section Line (${termString}) by default ${inputStreamEndString(input)}`)
  input.acceptToken(term)
  return
}

export const sectionlineexcludingpropertydrawerandplanning_tokenizer = new ExternalTokenizer((input, stack) => {
  log(`-- START sectionLineExcludingPropertyDrawerAndPlanning ${inputStreamBeginString(input)}`)
  checkSectionLine(true, true, input, stack, sectionLineExcludingPropertyDrawerAndPlanning)
})

export const sectionlineexcludingpropertydrawer_tokenizer = new ExternalTokenizer((input, stack) => {
  log(`-- START sectionLineExcludingPropertyDrawer ${inputStreamBeginString(input)}`)
  checkSectionLine(true, false, input, stack, sectionLineExcludingPropertyDrawer)
})

export const sectionline_tokenizer = new ExternalTokenizer((input, stack) => {
  log(`-- START sectionLine ${inputStreamBeginString(input)}`)
  checkSectionLine(false, false, input, stack, sectionLine)
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

export const planning_line_tokenizer = new ExternalTokenizer((input, stack: Stack) => {
  const planning_prefixes = ["DEADLINE:", "SCHEDULED:", "CLOSED:"]
  log(`-- START Planning ${inputStreamBeginString(input)}`)
  let previous = input.peek(-1)
  if (!isEndOfLine(previous)) {
    log(`XX REFUSE Planning, previous not endofline ${inputStreamEndString(input)}`)
    return
  }
  let c = input.peek(0)
  log(`${stringifyCodeLogString(c)}`)
  let s = String.fromCharCode(c)
  let prefix_matched = false
  while (!isEndOfLine(c)) {
      c = input.advance()
      log(`${stringifyCodeLogString(c)}`)
      s += String.fromCharCode(c)
      if (planning_prefixes.includes(s)) {
        log(`matched one planning prefix`)
        prefix_matched = true
      }
  }
  if (!prefix_matched) {
    log(`XX REFUSE Planning, no prefix found ${inputStreamEndString(input)}`)
    return
  }
  if (c == NEW_LINE) {
    c = input.advance()
    input.acceptToken(Planning)
    log(`== ACCEPT Planning ${inputStreamEndString(input)}`)
  } else if (c == EOF) {
    input.acceptToken(Planning)
    log(`== ACCEPT Planning ${inputStreamEndString(input)}`)
  }
  log(`XX REFUSE Planning, impossible case ${inputStreamEndString(input)}`)
  return
})

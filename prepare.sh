#!/user/bin/env bash

set -e

# we only need lezer-generator to generate parser.terms.ts
npx lezer-generator --typeScript codemirror-lang-orgmode/src/orgmode.grammar -o codemirror-lang-orgmode/src/parser >/dev/null
rm codemirror-lang-orgmode/src/parser.ts  # generated by lezer-generator but we don't know the external tokenizers at this point
echo Wrote codemirror-lang-orgmode/src/parser.terms.ts

# here we generate the grammar without linking any external tokenizers
bash codemirror-lang-orgmode/generate_grammar.sh > codemirror-lang-orgmode/src/generated_grammar.ts
echo Wrote codemirror-lang-orgmode/src/generated_grammar.ts

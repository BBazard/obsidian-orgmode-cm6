import typescript from "rollup-plugin-ts"
import {lezer} from "@lezer/generator/rollup"

export default {
  input: "codemirror-lang-orgmode/src/index.ts",
  external: id => id != "tslib" && !/^(\.?\/|\w:)/.test(id),
  output: [
    {file: "codemirror-lang-orgmode/dist/index.cjs", format: "cjs"},
    {dir: "./codemirror-lang-orgmode/dist", format: "es"}
  ],
  plugins: [lezer(), typescript()]
}

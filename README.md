# Obsidian Orgmode CM6

[Orgmode](https://orgmode.org) for [Obsidian](https://obsidian.md).

![Screenshot](screenshot.png)

This plugin is using a separate [codemirror 6](https://codemirror.net) instance with a custom [lezer](https://lezer.codemirror.net) grammar (not [everything](https://orgmode.org/worg/org-syntax.html) is implemented).
Inspired by https://github.com/ryanpcmcquen/obsidian-org-mode and https://github.com/nothingislost/obsidian-cm6-attributes.

## Features

- collapsable headers
- customizable todo keywords in the settings
- customizable colors via css (use the [styles.css](./styles.css) as a [css snippet](https://help.obsidian.md/Extending+Obsidian/CSS+snippets) and tweak it)

## Development

```
git clone https://github.com/bbazard/obsidian-orgmode-cm6
cd obsidian-orgmode-cm6
npm install
npm run build
npm test
cp main.js styles.css manifest.json "$OBSIDIAN_VAULT"/.obsidian/plugins/obsidian-orgmode-cm6/
```

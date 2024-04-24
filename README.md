# Obsidian Orgmode CM6

[Orgmode](https://orgmode.org) for [Obsidian](https://obsidian.md).

![Screenshot](https://github.com/BBazard/obsidian-orgmode-cm6/assets/10139245/527e3f78-2779-4f98-b4d8-9f18f6b3711a)

This plugin is using a separate [codemirror 6](https://codemirror.net) instance with a custom [lezer](https://lezer.codemirror.net) grammar (not [everything](https://orgmode.org/worg/org-syntax.html) is implemented).
Inspired by https://github.com/ryanpcmcquen/obsidian-org-mode and https://github.com/nothingislost/obsidian-cm6-attributes.

## Features

- collapsable headings
- customizable todo keywords in the settings
- customizable colors via css (use the [styles.css](./styles.css) as a [css snippet](https://help.obsidian.md/Extending+Obsidian/CSS+snippets) and tweak it)
- show orgmode tasks in markdown files (unstable feature, see the [dedicated section](#show-orgmode-tasks-in-markdown-files))

## Usage

By default org files are not shown in the sidebar.
To display them you need to go into the obsidian settings, section `Files and links` and check `Detect all file extensions`.

![detect-all-file-extensions](https://github.com/BBazard/obsidian-orgmode-cm6/assets/10139245/e6a91e66-295d-4057-bf80-e43dcdb8e3e7)



To create an org file in your vault, you currently have to create outside obsidian as obsidian doesn't allow to create a non-markdown file.

If you don't already have an org file, try to create a file called `todo.org` with the following content:

```org
* TODO [#A] A task with high priority

The description of the task

* A collapsed section

You cannot see the description when collapsed

* DONE something done already :sometag:
SCHEDULED: <2023-12-08 Fri 11:13>
:PROPERTIES:
:CREATED: [2023-12-03 Sun 10:48]
:END:
```

## Show orgmode tasks in markdown files

This feature is unstable and will likely change in breaking ways in the future.

Currently only TODO and DONE are handled.

https://github.com/BBazard/obsidian-orgmode-cm6/assets/10139245/b071b2c8-b56e-4050-8fcf-02a922fdd1c0

## Development

```
git clone https://github.com/bbazard/obsidian-orgmode-cm6
cd obsidian-orgmode-cm6
npm install
npm run build
npm test
cp main.js styles.css manifest.json "$OBSIDIAN_VAULT"/.obsidian/plugins/obsidian-orgmode-cm6/
```

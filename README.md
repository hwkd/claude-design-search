# claude-design-search

A Claude Code mod for the Claude desktop app (Code tab). Type `/designs` and a
panel opens beside the conversation: search your claude.ai design artifacts,
click one, and it opens in the session's Artifact pane next to the chat.

- A search box that narrows as you type, with your words in bold in the results
  (Enter opens the first match).
- A picker for **Designs** (artifacts made from the Design type) or **All
  artifacts**, with a count of what matches.
- **Show Artifact pane** opens the Artifact pane beside the chat without
  picking anything; **Refresh** lists your artifacts again.
- `/designs <words>` opens the panel with those words already searched.

It lists and opens artifacts with Claude's own Artifact tool, under your
account, and shows the pane through the desktop app's own view controls. It
sends nothing anywhere else and keeps no data beyond the current session.

The panel is drawn only in the desktop app. In a terminal session the command
still opens it, but the Artifact pane is a desktop feature.

## Install

At the prompt of a terminal session:

```
/plugin install artifact-split --marketplace hwkd/claude-design-search
```

Answer `y` to add the marketplace, then pick a scope (the user scope makes it
load in every session, the desktop app's included).

From a shell:

```bash
claude plugin install artifact-split --marketplace hwkd/claude-design-search
```

In the desktop app, where `/plugin` does not run: click **+** next to the
prompt box, then **Plugins**, **Add marketplace** with
`hwkd/claude-design-search`, then **Add plugin**.

## Use

1. Open a Code session in the Claude desktop app.
2. Type `/designs` (or `/designs onboarding` to start with a search).
3. Click a result to open it beside the chat.

## Develop

```bash
claude plugin validate .
claude plugin test .
```

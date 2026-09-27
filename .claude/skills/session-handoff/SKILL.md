---
name: session-handoff
description: Hand the work over to a new session without losing anything. Use at the end of every phase or major step, whenever the conversation is long or has been summarized/compacted, and before stopping mid-task. Also use at the START of a session to pick up from the last handoff.
---

# Session handoff: continue smoothly in another session

**Owner's rule:** when this session's memory (context) nears its limit, move the
plan to another session smoothly. Nothing may be lost: not the current step,
the decisions, or the unfinished checks.

The context size can't be measured exactly, so hand off **early and often**. Update the handoff:
- at the end of every phase, and after every major step inside a phase;
- when the conversation is long, or it has already been summarized ("compacted");
- before stopping with work unfinished, for any reason.

## Starting a session

1. Read `.claude/handoff/CURRENT.md` if it exists. It's the source of truth
   for where the work stands.
2. `git fetch && git status && git log --oneline -5` on the branch it names.
3. Run its **Verify** commands, then continue from **Next steps**. Don't redo
   finished work, and don't reopen decisions it lists as settled.

## Writing the handoff

Overwrite `.claude/handoff/CURRENT.md` with these sections, in plain Arabic or
English, short and factual:

```markdown
# Handoff — <phase / task> — <YYYY-MM-DD HH:MM>
## Where things stand
- Branch, last commit, open PR (URL), whether main is up to date
- Done in this phase (bullets, with file paths)
## In progress
- The exact step being worked on, what's half-done, which files
## Next steps (ordered)
1. …
## Decisions made (don't revisit)
- …with the reason
## Gotchas found
- traps discovered while working (tool quirks, library behaviour)
## Verify
- commands that prove the current state (tests, build, dev server)
## Owner's standing rules
- links to CLAUDE.md rules + anything the owner said this session
```

Then:
1. **Commit it with the work in progress.** WIP commits are fine on a feature
   branch, e.g. `wip(phase-1): … — handoff`.
2. **Push the branch**, so a session on another machine or in the cloud can continue.
3. **Update the memory:** the project memory file names the current
   phase/branch and points to `.claude/handoff/CURRENT.md`.
4. **Tell the owner in one line:** "state saved; a new session continues from
   `.claude/handoff/CURRENT.md`".

When a phase is merged to `main`, rewrite the handoff for the next phase: keep
only what is still useful, and move lasting rules into `CLAUDE.md`.

## Rules

- **The handoff is for a reader with zero context.** Write full paths, commands
  and URLs. Never write "as discussed".
- **No secrets.** Don't include passwords, tokens or keys (dev seed passwords
  belong in the seed file only).
- **Keep it current, not historical.** Git history holds the past; the handoff
  holds the present and the next steps.

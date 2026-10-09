# Domain Docs

## Before exploring

This repo uses a single-context layout:

- Read `GLOSSARY.md` at the repo root.
- Read ADRs in `docs/adr/` that touch the area being explored.

If these files do not exist, proceed silently. Domain modeling creates
them lazily when terms or decisions get resolved.

## Use the glossary's vocabulary

Use defined domain terms in issue titles, proposals, hypotheses,
and test names. Avoid synonyms the glossary explicitly excludes.

If a needed concept is missing, reconsider whether it belongs in the
domain; note real gaps for domain modeling.

## Flag ADR conflicts

Explicitly identify any proposal that contradicts an existing ADR,
and explain why the decision should be reopened.

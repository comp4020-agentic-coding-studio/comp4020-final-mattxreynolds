# Third-party skill credits

The 27 installed agent skills in `.agents/skills/` come from
[Matt Pocock's skills repository](https://github.com/mattpocock/skills).
They are included as evidence of the engineering workflows available for this
project; their inclusion does not imply that every skill was used.

Copyright (c) 2026 Matt Pocock. These skills are distributed under the MIT
License; the full upstream notice is preserved in
[`licenses/mattpocock-skills-MIT.txt`](licenses/mattpocock-skills-MIT.txt).

[`skills-lock.json`](skills-lock.json) records each installed skill's source,
upstream path, and computed hash. The relative symlinks in `.claude/skills/`
point to these same skill sources.

The PR skill incorporates guidance from the `show-me` skill by
[Dex Horthy](https://github.com/dexhorthy) and
[HumanLayer](https://github.com/humanlayer/skills/tree/main/plugins/show-me/skills/show-me).
Its original attribution is preserved in
[`.agents/skills/pr/CREDITS.md`](.agents/skills/pr/CREDITS.md).
Copyright (c) 2026 HumanLayer. The corresponding MIT license notice is preserved
in [`licenses/humanlayer-skills-MIT.txt`](licenses/humanlayer-skills-MIT.txt).

License notices were retrieved from the following upstream revisions:

- [mattpocock/skills at b0618bc436ad893b3c5e84e55fba86586d34a404](https://github.com/mattpocock/skills/blob/b0618bc436ad893b3c5e84e55fba86586d34a404/LICENSE).
- [humanlayer/skills at 653b6411c1f70c275a18e37673b042ff99f67ceb](https://github.com/humanlayer/skills/blob/653b6411c1f70c275a18e37673b042ff99f67ceb/LICENSE).

These revisions identify the license sources, not the installed skill versions;
the installation lockfile records the latter through its hashes. The notices
apply to the third-party skill material, rather than licensing the entire game.

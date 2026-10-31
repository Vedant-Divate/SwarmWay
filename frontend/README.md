# frontend/

This directory is reserved for the Google AI Studio-generated React SPA
(Section 0.4, Appendix G).

**AI Studio spike lands here (human task, Section 14 Phase 0 task 8).**

The spike is generated in Google AI Studio Build mode using the prompt
pack in PROJECT.md Appendix G, exported as a ZIP, and committed into this
folder by the human. Until then this directory contains only this
README.md; CI's frontend job skips gracefully while no `package.json` is
present and un-skips automatically once one appears (see
.github/workflows/ci.yml).

Do not hand-write a React app here — the frontend is produced in AI Studio
and synced per Section 13.5.

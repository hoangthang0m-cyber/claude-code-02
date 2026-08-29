# project-workspace

SPEC `docs/SPEC.md` §5.1 · checklist group 7.2.

Create and manage marketing Projects (standard form: objective, description,
scale, progress Google Sheets link, retrospective), project members and roles,
and the project lifecycle (running / done / archived).

Layout: `components/` `hooks/` `services/` `types/`. Mutations go through
`src/app/api/**` route handlers; reads via the Firebase Web SDK.

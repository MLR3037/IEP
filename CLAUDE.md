# Evoke IEP Builder: notes for Claude Code

React 19 + Vite single-page app. Teachers fill in IEPs in a form; the app stores each IEP in
SharePoint (Microsoft Graph, MSAL sign-in) and generates the Word IEP from Evoke's template
with docxtemplater. Hosted on GitHub Pages; all student data stays in M365 (FERPA records).

## Layout
- `src/schema.js`: every form section and field (types: text, textarea, date, select, yesno,
  yesnona, yesnoni, radio, checks, prepost, assessGrid, repeat, textList, static, note, heading).
  `isRequired`, `missingRequired`, transition-age logic, dropdown option lists.
- `src/generate.js`: maps saved data → template tags (checkbox glyphs ☒/☐, dates MM/DD/YYYY,
  service totals, loops) and renders the .docx.
- `src/assets/IEP_Template.docx`: Word template with `{tags}`; loops `goals`, `prevGoals`,
  `others`, `services`. Produced from `setup/IEP_Template_original.docx` by `setup/convert_template.py`.
- `src/Fields.jsx`: field renderers. `src/App.jsx`: shell, autosave, IEP editor, generate/finalize.
- `src/storage/`: `sharepointStore.js` (IEP Records library: one JSON file per IEP + metadata
  columns, ETag conflict checks) and `localStore.js` (demo mode, browser only).
- `src/caseload/`: caseload page from the *Current Clients* list (`config.js` column map, `source.js`
  loader + demo data, `due.js` due-date levels and alerts, `Caseload.jsx`).

## Rules
- Never put real student data in demo mode, test files, or commits.
- Adding a field: add `{key}` in the Word template + a field in `schema.js`. Plain strings pass through
  automatically; checkboxes/derived values need a line in `generate.js`.
- Every Yes/No and every dropdown is required; an IEP can't be marked final with any unanswered.
- Test changes locally (`npm run dev`) before pushing; pushing to `main` deploys.
- `npm run test:docx` renders `test/out.docx` from sample data (fictional) to check the template.

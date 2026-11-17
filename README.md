# Evoke IEP Builder

Teachers fill in an IEP in a web form. The app saves each IEP to SharePoint and builds
the finished Word document from Evoke's IEP template. Text fields grow as you type, and
goals, services, attendees and previous goals can be added as needed, so the document is
exactly as long as its content.

## How it works

| Piece | Where |
|---|---|
| Form definition (sections, fields) | `src/schema.js` |
| Field → Word template mapping | `src/generate.js` |
| Word template with `{tags}` | `src/assets/IEP_Template.docx` |
| Storage | `src/storage/sharepointStore.js` (real) / `localStore.js` (demo) |

**Database.** Each IEP is a JSON file in the **IEP Records** document library, with
columns for Student Name, Meeting Date, IEP Status and Case Manager. You can sort and filter it like a
list. Every save is a new version (version history = audit trail), and saving uses
ETags so two people editing the same IEP can't overwrite each other silently. Generated
Word documents go to **IEP Documents/<Student Name>/**.

Why files instead of list items: an IEP's narratives can exceed a list column's
63,999-character limit, and nested data (goals, services) stays intact.

**Workflow.** New IEP → fill sections (autosaves) → *Generate Word document* (downloads
and saves a copy to SharePoint) → *Mark final* (locks the record). Next year, open the
IEP and click *Start next IEP from this*: it copies everything into a new draft, moves
last year's goals and their latest progress into "Previous goal progress", and clears
meeting dates. Goals marked for ESY are included under "Goals to be worked on during ESY"
when ESY eligibility is Yes or To be determined.

## Run locally

```bash
npm install
npm run dev          # demo mode unless .env.local is filled in
```

## Connect to SharePoint

1. **Entra app registration** (or reuse the EvokeSchedule one): SPA platform, redirect
   URIs `http://localhost:5173/redirect.html` and your GitHub Pages URL ending in
   `/redirect.html`. Delegated Graph permissions `Sites.ReadWrite.All` and `User.Read`,
   with admin consent. Users only get to what their own SharePoint permissions allow.
2. Run `setup/Create-IEPLibraries.ps1` against the special-education site, then set
   permissions on both libraries to the special-education team only.
3. Copy `.env.example` to `.env.local` and fill it in.
4. `npm run build` and deploy `dist/` like the other Evoke apps.

## Changing the Word template

The template was produced from `setup/IEP_Template_original.docx` by
`setup/convert_template.py`, which replaced the content controls with tags. For
small wording or formatting changes, edit `src/assets/IEP_Template.docx` directly in
Word. Don't touch text in `{curly braces}`.
Loops: `{#goals}…{/goals}`, `{#prevGoals}…{/prevGoals}`, and table rows for
`others` and `services`. To add a field: add a `{newKey}` tag in Word and a field with
`key: 'newKey'` in `schema.js`. Plain text keys are passed through automatically.

## Caseload view

The app opens on **My caseload**: the signed-in teacher's students from the existing
SharePoint student list, with district, grade, classroom, services, disability, DOB/age,
IEP review / reevaluation due dates, and separate IEP and reevaluation meeting-scheduled columns.

- **Who sees what:** rows whose case manager column matches the signed-in user
  (person column → by email; text column → by display name). Emails listed in
  `allAccessEmails` also get an *All students* view with a case-manager filter.
- **Due dates:** taken from the student's latest *final* IEP in the app (Next IEP review /
  Next eligibility meeting). Until a student has one, the list's own due-date columns are used
  (marked "from list").
- **Alerts & highlights:** overdue = red, urgent = orange, coming up = gold, on the horizon =
  lavender, no date = gray. Windows are in `src/caseload/config.js`: IEP reviews 30/60/90 days,
  reevaluations 60/90/120 days (more lead time for testing). Alerts also say whether a draft has
  been started.
- **Start IEP** from a student row rolls forward their latest final IEP, or prefills a new
  one from the list (name, DOB, SASID, grade, district, disability, parent contact).
- **New IEP student picker:** when starting a blank IEP, choose a student from your
  Current Clients caseload. The app maps ClientDOB, ParentGuardianName, Email and StartDate
  to the IEP's student DOB, parent/guardian name and email, and “attending Evoke since” fields.
  Selecting a different student replaces the mapped student-specific details.
- **Goal standards:** each annual goal has cascading selectors for standard type, content area,
  grade, and standard. The official CDE lookup opens with those regular-standard selections;
  enter the GLE and evidence-outcome codes and wording from CDE to include them in the generated
  IEP. EEO selections link to CDE's EEO resources. The type defaults to EEO when an alternate
  assessment is selected and warns if the goal type does not match the assessment choice.
- **Vineland-III score grid:** upload or paste an image in the Vineland-III section. The image is
  saved with the IEP record and embedded in the generated Word document; the summary remains
  available as a separate text field.
- **Present levels:** narrative fields and previous-goal entries accept pasted or uploaded images.
  Images are stored with the IEP and included in the generated Word document. The disability field
  under “Needs, impact & input” follows the primary disability selected under Student & Family Info.
- **Parent interview:** the form includes short, optional prompts for strengths, concerns, daily routines,
  safety, and future priorities; these prompts are for the interviewer and are not printed as boilerplate.
- **Service delivery statements:** add a statement for each service type in the Services section and
  paste or upload supporting images. Each statement is included both in the service-delivery portion
  and as a related-service present level in the Word document; empty related-service present levels are omitted.
- **Standing IEP:** expand a student row and upload the current IEP as a PDF or Word file.
  Enter the meeting date and next annual review date from the document; add the next
  reevaluation date if it is shown. The file is saved in that student's IEP Documents folder;
  review dates update Current Clients, and a link plus the document's meeting date are kept with
  the shared checklist state.
- **Edit list dates:** expand a student row and select *Edit Current Clients dates* to update
  IEP review / reevaluation due dates and the scheduled fields in SharePoint. Dates from a
  Final IEP remain authoritative for dashboard due dates. Each teacher needs **Edit**
  permission on the Current Clients list; app sign-in or read-only list access alone is not enough.
- **Teacher to-do list:** tasks appear only for students with an IEP meeting scheduled within the
  next 60 days; Teacher-owned timeline tasks appear as their target dates approach. Task check-offs
  are shared in Current Clients, and the expanded student row can print the full teacher/BCBA/MHC checklist.

**Source:** *Evoke Client Intake → Current Clients* (`/sites/EvokeIntake`). Only entries
whose **Services** value is *School Services* appear. Columns used:
Title, ClientDOB, SchoolDistrict, Classroom, Services, Program, MentalHealthServices, Teacher (person,
decides whose caseload), BCBA, MHProvider, IEPDueDate, ReEvalDueDate, IEPMeetingScheduled,
ReEvalScheduled (date or yes/no), StartDate, ParentGuardianName, Email, SASID, and LASID. SASID
and LASID must be text columns on Current Clients; their internal names are configured in
`src/caseload/config.js`. Values entered in an IEP are written back to that student's Current
Clients item and prefill future IEPs for the student.
For shared checklist completion and the standing IEP link, add a **multiple lines of text**
column named `IEPChecklistState` to Current Clients. Staff need edit permission to save task
check-offs, dates, and standing IEP details. Without this column, the to-do list still displays,
but check-offs and persistent standing-document links are disabled. The printable checklist remains available.
Signed-in users need at least read access to the Current Clients list.

## Rules built into the form

- **Required:** legal name, meeting date, and every Yes/No question (including the ESY decision). The section list shows how many are unanswered. Drafts can still be generated, but an IEP can't be marked final until all required questions are answered.
- **AU address** is fixed to Evoke's street address (`AU_ADDRESS` in `schema.js`); the Evoke phone
  number is populated in the AU Number field.
- **Transition:** for a student over 14 (by typed age, or DOB on the meeting date), the form asks whether the team will complete the transition assessment. If the answer is No, or the student is 14 or under, the transition sections are hidden and omitted from the Word document.
- **ACCESS scores:** both score fields appear and are required only when the student is marked as having limited English proficiency.
- **Educational environment:** ages 3–5 see early-childhood choices, ages 6–21 see school-age choices, and both are shown when age is unknown.
- **Present levels:** the attendance field guides staff to note whether attendance is a concern and document relevant concerns or considerations.
- **Word document sections:** the General Education Teacher attendee, General Education Preschool Services, and Prior Written Notice sections are omitted.
- **Race / Ethnicity** use the federal reporting categories (`RACES`, `ETHNICITIES` in `schema.js`).

## Notes

- The Vineland-III score grid image is left in the template as is. Paste the grid into
  the generated document.
- Service frequencies are entered in minutes. Each service fills one column, and totals are shown in hours (HPD/HPW/HPM).
- Demo mode stores data in the browser's localStorage. Never use it for real students.

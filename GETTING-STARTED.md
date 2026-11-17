# Getting started in VS Code

## 1. One-time setup on your computer
- Install **Node.js 22 LTS** (nodejs.org) and **Git**.
- Unzip `evoke-iep-builder.zip` somewhere permanent, for example `Documents\GitHub\evoke-iep-builder`.
- In VS Code: **File → Open Folder…** → pick the `iep-builder` folder.
  Accept the prompt to install the recommended extensions (Claude Code, Copilot, Oxc linter, DotENV).

## 2. Install and run
Open a terminal in VS Code (**Terminal → New Terminal**):
```
npm install
npm run dev
```
Open http://localhost:5173. With no `.env.local` it runs in **demo mode** (sample students,
browser-only storage). Or press **F5** and pick *Run app in Edge (debug)* to debug with breakpoints.

## 3. Connect to SharePoint
1. **Entra app registration** (portal.azure.com → App registrations), or reuse EvokeSchedule's:
   - Platform: **Single-page application**. Redirect URIs: `http://localhost:5173/redirect.html` and your
     GitHub Pages URL ending in `/redirect.html` (e.g. `https://<org>.github.io/evoke-iep-builder/redirect.html`
     or `https://your-subdomain.example.com/redirect.html`).
   - API permissions (Microsoft Graph, delegated): `Sites.ReadWrite.All`, `User.Read` → **Grant admin consent**.
2. Create the IEP libraries: run `setup/Create-IEPLibraries.ps1` (PnP.PowerShell) against the
   site where IEPs should live, then restrict both libraries to the special-education team.
3. Copy `.env.example` → `.env.local` and fill in the client ID, tenant ID and site.
   `.env.local` is git-ignored.
4. Restart `npm run dev`. You'll get a Microsoft sign-in popup, then your real caseload.

## 4. Put it on GitHub and deploy
```
git init
git add .
git commit -m "Evoke IEP Builder"
git branch -M main
git remote add origin https://github.com/<your-org>/evoke-iep-builder.git
git push -u origin main
```
On GitHub, in the repo:
- **Settings → Pages → Source: GitHub Actions**
- **Settings → Secrets and variables → Actions → Variables**: add each `VITE_…` value from your
  `.env.local` (these aren't secrets. The client ID only works for your tenant's signed-in users).
- Every push to `main` builds and deploys automatically (`.github/workflows/deploy.yml`).
  Custom subdomain: Settings → Pages → Custom domain, same as the org chart app.

## Everyday commands
| | |
|---|---|
| `npm run dev` | local app with hot reload |
| `npm run test:docx` | render `test/out.docx` from fictional sample data to check the Word template |
| `npm run build` | production build into `dist/` |
| `npm run build:single` | one self-contained HTML demo file in `dist-single/` |
| `npm run lint` | check code |

## Working with a coworker
She clones the repo, runs `npm install`, creates her own `.env.local`, and tests on localhost.
Have her work on a branch and open a pull request, so nothing reaches the live app until you merge it.

## Using Visual Studio (not VS Code) instead
Visual Studio 2022 opens this as-is: **File → Open → Folder…**, then run `npm install` and
`npm run dev` from **View → Terminal**. VS Code is the smoother fit for Vite/React projects.

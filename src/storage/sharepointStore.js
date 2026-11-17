// SharePoint storage through Microsoft Graph (same pattern as EvokeSchedule).
//
// Each IEP is one JSON file in the "IEP Records" document library, with metadata
// columns (StudentName, MeetingDate, IEPStatus, CaseManager) so the library works as
// a searchable, filterable database with version history. Generated Word documents go
// to the "IEP Documents" library in a folder per student.
//
// Configure with .env (see README):
//   VITE_AAD_CLIENT_ID, VITE_AAD_TENANT_ID, VITE_SP_SITE (e.g. evoke.sharepoint.com:/sites/SpecialEducation)
//   VITE_SP_RECORDS_LIBRARY (default "IEP Records"), VITE_SP_DOCS_LIBRARY (default "IEP Documents")
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';

const env = import.meta.env;
const SCOPES = ['Sites.ReadWrite.All', 'User.Read'];
const GRAPH = 'https://graph.microsoft.com/v1.0';

export const spConfigured = !!(env.VITE_AAD_CLIENT_ID && env.VITE_AAD_TENANT_ID && env.VITE_SP_SITE);

let msal, account, siteId, recordsDrive, docsDrive;
let initPromise;

async function token() {
  try {
    return (await msal.acquireTokenSilent({ scopes: SCOPES, account })).accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) return (await msal.acquireTokenPopup({ scopes: SCOPES })).accessToken;
    throw e;
  }
}

async function g(path, opts = {}) {
  const res = await fetch(path.startsWith('http') ? path : GRAPH + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + (await token()), ...(opts.headers || {}) },
  });
  if (res.status === 412) throw Object.assign(new Error('Someone else saved this IEP after you opened it. Reload it before saving.'), { conflict: true });
  if (!res.ok) throw Object.assign(new Error(`Graph ${res.status}: ${(await res.text()).slice(0, 300)}`), { status: res.status });
  return res.status === 204 ? null : res.headers.get('content-type')?.includes('json') ? res.json() : res;
}

async function driveByName(name) {
  const { value } = await g(`/sites/${siteId}/drives?$select=id,name`);
  const d = value.find(x => x.name === name);
  if (!d) throw new Error(`Library "${name}" not found on the site. Run setup/Create-IEPLibraries.ps1 first.`);
  return d.id;
}

const safe = s => (s || 'Unnamed').replace(/["*:<>?/\\|#%]/g, '').trim();

// Shared with the caseload loader
export const sp = {
  graph: (...a) => g(...a),
  uploadStandingIep: (...a) => sharepointStore.uploadStandingIep(...a),
  get siteId() { return siteId; },
  get account() { return account; },
};

export const sharepointStore = {
  kind: 'sharepoint',
  label: 'SharePoint',
  user: null,
  init() {
    if (!initPromise) {
      initPromise = (async () => {
        msal = new PublicClientApplication({
          auth: {
            clientId: env.VITE_AAD_CLIENT_ID,
            authority: `https://login.microsoftonline.com/${env.VITE_AAD_TENANT_ID}`,
            redirectUri: new URL('redirect.html', window.location.href).href,
          },
          cache: { cacheLocation: 'sessionStorage' },
        });
        await msal.initialize();
        await msal.handleRedirectPromise();
        account = msal.getAllAccounts()[0];
        if (!account) account = (await msal.loginPopup({ scopes: SCOPES })).account;
        this.user = account.name || account.username;
        const [host, path] = env.VITE_SP_SITE.split(':');
        siteId = (await g(`/sites/${host}:${path}`)).id;
        recordsDrive = await driveByName(env.VITE_SP_RECORDS_LIBRARY || 'IEP Records');
        docsDrive = await driveByName(env.VITE_SP_DOCS_LIBRARY || 'IEP Documents');
      })().catch(error => {
        initPromise = null;
        throw error;
      });
    }
    return initPromise;
  },
  async list() {
    const out = [];
    let url = `/drives/${recordsDrive}/root/children?$top=200&$expand=listItem($expand=fields)`;
    while (url) {
      const page = await g(url);
      for (const it of page.value) {
        if (!it.name.endsWith('.json')) continue;
        const f = it.listItem?.fields || {};
        out.push({ id: it.id, legalName: f.StudentName || it.name, meetingDate: (f.MeetingDate || '').slice(0, 10),
          status: f.IEPStatus || 'Draft', caseManager: f.CaseManager || '', updatedAt: it.lastModifiedDateTime,
          nextReviewDate: (f.NextReviewDate || '').slice(0, 10), nextEligDate: (f.NextEligDate || '').slice(0, 10),
          caseloadId: f.CaseloadId || '', sasid: f.SASID || '',
          updatedBy: it.lastModifiedBy?.user?.displayName });
      }
      url = page['@odata.nextLink'];
    }
    return out.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  },
  async get(id) {
    const item = await g(`/drives/${recordsDrive}/items/${id}`);
    const content = await g(`/drives/${recordsDrive}/items/${id}/content`);
    const rec = content instanceof Response ? await content.json() : content;
    if (!rec || typeof rec !== 'object' || !rec.data || typeof rec.data !== 'object') {
      throw new Error('The saved IEP file is not valid. Contact your administrator for help recovering it.');
    }
    return { ...rec, id, eTag: item.eTag, updatedAt: item.lastModifiedDateTime };
  },
  async save(rec) {
    const { eTag, ...body } = rec;
    const json = JSON.stringify({ ...body, updatedBy: this.user }, null, 1);
    let item;
    if (rec.id) {
      item = await g(`/drives/${recordsDrive}/items/${rec.id}/content`, {
        method: 'PUT', body: json, headers: { 'Content-Type': 'application/json', ...(eTag ? { 'If-Match': eTag } : {}) },
      });
    } else {
      const name = `${safe(rec.data.legalName)} - ${rec.data.meetingDate || 'draft'} - ${crypto.randomUUID().slice(0, 8)}.json`;
      item = await g(`/drives/${recordsDrive}/root:/${encodeURIComponent(name)}:/content?@microsoft.graph.conflictBehavior=rename`, {
        method: 'PUT', body: json, headers: { 'Content-Type': 'application/json' },
      });
    }
    await g(`/drives/${recordsDrive}/items/${item.id}/listItem/fields`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        StudentName: rec.data.legalName || '', IEPStatus: rec.status || 'Draft', CaseManager: rec.data.cmName || '',
        CaseloadId: rec.data.caseloadId || '', SASID: rec.data.sasid || '',
        NextReviewDate: rec.data.nextReviewDate ? rec.data.nextReviewDate + 'T12:00:00Z' : null,
        NextEligDate: rec.data.nextEligDate ? rec.data.nextEligDate + 'T12:00:00Z' : null,
        ...(rec.data.meetingDate ? { MeetingDate: rec.data.meetingDate + 'T12:00:00Z' } : {}),
      }),
    });
    const fresh = await g(`/drives/${recordsDrive}/items/${item.id}?$select=id,eTag,lastModifiedDateTime`);
    return { ...rec, id: item.id, eTag: fresh.eTag, updatedAt: fresh.lastModifiedDateTime };
  },
  async remove(id) {
    await g(`/drives/${recordsDrive}/items/${id}`, { method: 'DELETE' }); // goes to the site recycle bin
  },
  async uploadDocument(rec, blob, fileName) {
    const folder = safe(rec.data.legalName);
    const it = await g(`/drives/${docsDrive}/root:/${encodeURIComponent(folder)}/${encodeURIComponent(fileName)}:/content`, {
      method: 'PUT', body: blob,
      headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    });
    return it.webUrl;
  },
  async uploadStandingIep(studentName, file) {
    const folder = safe(studentName);
    const extension = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'doc', 'docx'].includes(extension)) {
      throw new Error('Upload the current IEP as a PDF or Word document.');
    }
    if (file.size > 250 * 1024 * 1024) {
      throw new Error('The IEP file must be smaller than 250 MB.');
    }
    let folderItem;
    try {
      folderItem = await g(`/drives/${docsDrive}/root:/${encodeURIComponent(folder)}?$select=id`);
    } catch (error) {
      if (error.status !== 404) throw error;
      folderItem = await g(`/drives/${docsDrive}/root/children`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folder, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
      });
    }
    const fileName = `Current IEP.${extension}`;
    const item = await g(`/drives/${docsDrive}/items/${folderItem.id}:/${encodeURIComponent(fileName)}:/content?@microsoft.graph.conflictBehavior=replace`, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
    return { fileName, url: item.webUrl };
  },
};

// Browser-only storage, for trying the app out. Data stays on this computer in this browser.
// Do not use this for real student records — use the SharePoint store (see README).
const KEY = 'evoke-iep-records-v1';

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function writeAll(rows) {
  try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) { console.warn('local save failed', e); }
}

export const localStore = {
  kind: 'local',
  label: 'This browser only (demo)',
  async init() {},
  async list() {
    return readAll().map(({ data = {}, id, status, updatedAt }) => ({
      id, status, updatedAt, legalName: data.legalName, meetingDate: data.meetingDate, caseManager: data.cmName,
      nextReviewDate: data.nextReviewDate, nextEligDate: data.nextEligDate, caseloadId: data.caseloadId, sasid: data.sasid,
    })).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  },
  async get(id) {
    return readAll().find(r => r.id === id) || null;
  },
  async save(rec) {
    const rows = readAll();
    const now = new Date().toISOString();
    const out = { ...rec, id: rec.id || crypto.randomUUID(), updatedAt: now, updatedBy: 'me' };
    const i = rows.findIndex(r => r.id === out.id);
    if (i >= 0) rows[i] = out; else rows.push(out);
    writeAll(rows);
    return out;
  },
  async remove(id) {
    writeAll(readAll().filter(r => r.id !== id));
  },
};

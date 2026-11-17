// Loads the signed-in teacher's caseload from the existing SharePoint student list,
// or sample students in demo mode.
import { CASELOAD } from './config.js';
import { sp } from '../storage/sharepointStore.js';

const C = CASELOAD.columns;
const OPTIONAL_COLUMNS = new Set(['studentName', 'sasid', 'lasid', 'grade', 'disability', 'dischargeDate', 'parentPhone']);
const COLUMN_ALIASES = {
  sasid: ['State Student ID (SASID)'],
  lasid: ['Local Student ID (LASID)'],
};

function val(f, key, columnNames = {}) {
  const col = columnNames[key] || C[key];
  if (!col) return '';
  const v = f[col];
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.map(x =>
    (typeof x === 'object' ? x.LookupValue || x.displayName || x.Title || x.Email || '' : x)).join(', ');
  if (typeof v === 'object') return v.LookupValue || v.displayName || v.Title || v.Email || '';
  return String(v);
}
// SharePoint returns dates in UTC; convert to the local calendar date
const dateOnly = s => {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// "Scheduled" columns may be a date or a yes/no
export function parseScheduled(v) {
  if (v === undefined || v === null || v === '' || v === false || /^(no|false|0)$/i.test(String(v))) return null;
  if (v === true || /^(yes|true|1)$/i.test(String(v))) return { yes: true };
  const d = dateOnly(String(v));
  return d ? { date: d } : { yes: true, text: String(v) };
}

export async function loadSharePointCaseload() {
  const me = sp.account;
  const myEmail = (me.username || '').toLowerCase();
  const [host, path] = CASELOAD.site.split(':');
  const siteId = (await sp.graph(`/sites/${host}:${path}`)).id;
  let listPath = `/sites/${siteId}/lists/${encodeURIComponent(CASELOAD.list)}`;
  try { await sp.graph(listPath + '?$select=id'); } catch {
    const { value } = await sp.graph(`/sites/${siteId}/lists?$select=id,displayName,name`);
    const l = value.find(x => x.displayName === CASELOAD.list || x.name === CASELOAD.list);
    if (!l) throw new Error(`List "${CASELOAD.list}" not found on ${CASELOAD.site}`);
    listPath = `/sites/${siteId}/lists/${l.id}`;
  }

  const { value: columns } = await sp.graph(`${listPath}/columns?$select=name,displayName,dateTime,boolean`);
  const columnNames = Object.fromEntries(Object.entries(C).map(([key, configuredName]) => {
    if (!configuredName) return [key, ''];
    const column = columns.find(x => x.name === configuredName)
      || columns.find(x => [configuredName, ...(COLUMN_ALIASES[key] || [])]
        .some(name => (x.displayName || '').toLowerCase() === name.toLowerCase()));
    return [key, column?.name || (OPTIONAL_COLUMNS.has(key) ? '' : configuredName)];
  }));
  const columnTypes = Object.fromEntries(['iepScheduled', 'reevalScheduled'].map(key => {
    const column = columns.find(x => x.name === columnNames[key]);
    return [key, column?.dateTime ? 'date' : column?.boolean ? 'boolean' : 'unsupported'];
  }));
  const checklistEnabled = columns.some(x => x.name === columnNames.checklistState);
  if (!checklistEnabled) columnNames.checklistState = '';
  const saveDates = async (itemId, updates) => {
    const fields = {};
    for (const [key, columnKey] of [['iepDue', 'iepDue'], ['reevalDue', 'reevalDue']]) {
      if (Object.hasOwn(updates, key)) {
        fields[columnNames[columnKey]] = updates[key] ? `${updates[key]}T12:00:00Z` : null;
      }
    }
    for (const key of ['iepScheduled', 'reevalScheduled']) {
      if (!Object.hasOwn(updates, key)) continue;
      const column = columnNames[key];
      if (columnTypes[key] === 'date') fields[column] = updates[key] ? `${updates[key]}T12:00:00Z` : null;
      else if (columnTypes[key] === 'boolean') fields[column] = Boolean(updates[key]);
      else throw new Error(`The ${column} column must be a date or yes/no column to edit it here.`);
    }
    if (!Object.keys(fields).length) return;
    await sp.graph(`${listPath}/items/${encodeURIComponent(itemId)}/fields`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
  };
  const saveIdentifiers = async (itemId, updates) => {
    const fields = {};
    for (const key of ['sasid', 'lasid']) {
      const value = updates[key];
      if (value === undefined || value === null || value === '') continue;
      const column = columnNames[key];
      if (!column) {
        const label = key === 'sasid' ? 'SASID' : 'LASID';
        throw new Error(`Couldn’t save ${label} to Current Clients. Add a text column named ${label}, or update its internal name in src/caseload/config.js.`);
      }
      fields[column] = String(value).trim();
    }
    if (!Object.keys(fields).length) return;
    await sp.graph(`${listPath}/items/${encodeURIComponent(itemId)}/fields`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
  };
  const saveChecklist = async (itemId, checklistState) => {
    if (!checklistEnabled) {
      throw new Error('Add a multiple-lines-of-text column named IEPChecklistState to Current Clients before saving checklist progress.');
    }
    await sp.graph(`${listPath}/items/${encodeURIComponent(itemId)}/fields`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [columnNames.checklistState]: JSON.stringify(checklistState) }),
    });
  };

  const person = (f, key) => {
    const col = columnNames[key];
    if (!col) return { name: '', email: '' };
    const displayValue = f[col + 'LookupValue'];
    const name = displayValue ?? f[col];
    if (typeof name === 'string') return { name, email: '' };
    if (Array.isArray(name)) {
      return {
        name: name.map(value => value.LookupValue || value.displayName || value.Title || '').filter(Boolean).join(', '),
        email: '',
      };
    }
    return { name: name?.LookupValue || name?.displayName || name?.Title || '', email: '' };
  };
  const rows = [];
  const selectedFields = [...new Set(Object.values(columnNames).filter(Boolean))].join(',');
  let url = `${listPath}/items?$expand=fields($select=${selectedFields})&$top=500`;
  while (url) {
    const page = await sp.graph(url);
    for (const it of page.value) {
      const f = it.fields;
      const cmUser = person(f, 'caseManager');
      rows.push({
        id: it.id,
        legalName: val(f, 'legalName', columnNames), studentName: val(f, 'studentName', columnNames),
        dob: dateOnly(val(f, 'dob', columnNames)),
        sasid: val(f, 'sasid', columnNames), lasid: val(f, 'lasid', columnNames),
        grade: val(f, 'grade', columnNames), district: val(f, 'district', columnNames),
        classroom: val(f, 'classroom', columnNames), serviceType: val(f, 'serviceType', columnNames),
        program: val(f, 'program', columnNames), mhServices: val(f, 'mhServices', columnNames),
        disability: val(f, 'disability', columnNames),
        caseManager: cmUser.name, caseManagerEmail: cmUser.email,
        bcba: person(f, 'bcba').name, mhProvider: person(f, 'mhProvider').name,
        iepScheduled: parseScheduled(f[columnNames.iepScheduled]),
        reevalScheduled: parseScheduled(f[columnNames.reevalScheduled]),
        checklistState: parseChecklistState(f[columnNames.checklistState], val(f, 'legalName', columnNames)),
        iepDue: dateOnly(val(f, 'iepDue', columnNames)), reevalDue: dateOnly(val(f, 'reevalDue', columnNames)),
        startDate: dateOnly(val(f, 'startDate', columnNames)),
        dischargeDate: dateOnly(val(f, 'dischargeDate', columnNames)),
        parentName: val(f, 'parentName', columnNames), parentPhone: val(f, 'parentPhone', columnNames),
        parentEmail: val(f, 'parentEmail', columnNames),
        listUrl: it.webUrl,
      });
    }
    url = page['@odata.nextLink'];
  }
  const active = rows.filter(CASELOAD.activeFilter);
  const isAll = CASELOAD.allAccessEmails.map(e => e.toLowerCase()).includes(myEmail);
  const myName = (me.name || '').toLowerCase();
  const mine = active.filter(r => (r.caseManagerEmail ? r.caseManagerEmail === myEmail : r.caseManager.toLowerCase() === myName));
  return {
    me: { name: me.name, email: myEmail, allAccess: isAll },
    mine,
    all: isAll ? active : mine,
    scheduleFieldTypes: columnTypes,
    checklistEnabled,
    saveDates,
    saveIdentifiers,
    saveChecklist,
    uploadStandingIep: (studentName, file) => sp.uploadStandingIep(studentName, file),
  };
}

function parseChecklistState(value, studentName) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    throw new Error('Expected a JSON object.');
  } catch (error) {
    throw new Error(`Checklist progress for ${studentName || 'a student'} is unreadable: ${error.message}`);
  }
}

// ── Demo data (fictional) ────────────────────────────────────────────────────
const plus = days => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const T = 'Demo Teacher';
// name, dob, district, classroom, program, MH services, IEP due (days), reeval due (days), IEP scheduled (days|true|null), teacher
const DEMO = [
  ['Avery Lin', '2014-02-11', 'Jeffco Public Schools', 'Room 3', 'ABA', 'No', -5, 400, null, T],
  ['Brooklyn Ortiz', '2011-07-23', 'Adams 12 Five Star Schools', 'Room 5', 'Day Treatment', 'Individual Therapy', 12, 60, 8, T],
  ['Carter Nguyen', '2016-10-02', 'Westminster Public Schools', 'Room 1', 'ABA', 'No', 41, 300, null, T],
  ['Dakota Price', '2010-04-17', 'Jeffco Public Schools', 'Room 5', 'Day Treatment', 'Group Therapy', 75, 100, null, T],
  ['Emerson Hall', '2013-12-01', 'Denver Public Schools', 'Room 2', 'ABA', 'No', 150, 700, null, T],
  ['Finley Brooks', '2015-06-30', 'Boulder Valley SD', 'Room 3', 'ABA', 'No', 210, 25, null, T],
  ['Gray Patel', '2012-09-09', 'Adams 12 Five Star Schools', 'Room 4', 'Day Treatment', 'Individual Therapy', null, null, null, T],
  ['Harper Diaz', '2014-08-14', 'Jeffco Public Schools', 'Room 2', 'ABA', 'No', 20, 500, true, 'Other Teacher'],
  ['Indigo Reyes', '2011-01-05', 'Denver Public Schools', 'Room 5', 'Day Treatment', 'Individual Therapy', 95, 15, null, 'Other Teacher'],
];
export function demoCaseload() {
  const rows = DEMO.map(([n, dob, district, room, program, mh, iep, re, sched, cm], i) => ({
    id: 'demo-' + (i + 1), legalName: n, studentName: n.split(' ')[0], dob, sasid: '', grade: '', district,
    classroom: room, program, mhServices: mh, disability: '', caseManager: cm, caseManagerEmail: '',
    bcba: program === 'ABA' ? 'Demo BCBA' : '', mhProvider: mh !== 'No' ? 'Demo Therapist' : '',
    iepDue: iep === null ? '' : plus(iep), reevalDue: re === null ? '' : plus(re), startDate: '2024-08-19',
    iepScheduled: sched === true ? { yes: true } : typeof sched === 'number' ? { date: plus(sched) } : null, reevalScheduled: null,
    parentName: '', parentPhone: '', parentEmail: '',
  }));
  const mine = rows.filter(r => r.caseManager === T);
  return { me: { name: T, email: '', allAccess: true }, mine, all: rows };
}

// Prefill a new IEP from a caseload row
export function iepFromStudent(s) {
  const startDate = s.startDate
    ? `${s.startDate.slice(5, 7)}/${s.startDate.slice(8, 10)}/${s.startDate.slice(0, 4)}`
    : '';
  return {
    caseloadId: s.id, legalName: s.legalName, studentName: s.studentName || (s.legalName || '').split(' ')[0],
    dob: s.dob, sasid: s.sasid, studentLocalId: s.lasid, grade: s.grade,
    residenceDistrictPre: s.district, residenceDistrictPost: s.district,
    attendDistrictPre: s.district, attendDistrictPost: s.district,
    attendSchoolPre: 'Evoke Behavioral Health', attendSchoolPost: 'Evoke Behavioral Health',
    g1Name: s.parentName, g1Address: '', g1Phone: s.parentPhone, g1Email: s.parentEmail,
    g2Name: '', g2Address: '', g2Email: '', g2Phone: '', g2SameAddress: false, g2SamePhone: false,
    attParent1: s.parentName, attParent2: '', piParent: s.parentName,
    cmName: s.caseManager, attSpedTeacher: s.caseManager, nextReviewDate: '', nextEligDate: s.reevalDue,
    attendingSince: startDate,
  };
}

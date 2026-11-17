import { CASELOAD } from './config.js';

const DAY = 86400000;
export function daysUntil(iso, today = new Date()) {
  if (!iso) return null;
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d - t) / DAY);
}

// level: overdue | urgent | soon | upcoming | ok | missing
export function dueStatus(iso, kind) {
  const w = CASELOAD.windows[kind];
  const days = daysUntil(iso);
  if (days === null) return { level: 'missing', days: null };
  if (days < 0) return { level: 'overdue', days };
  if (days <= w.urgent) return { level: 'urgent', days };
  if (days <= w.soon) return { level: 'soon', days };
  if (days <= w.upcoming) return { level: 'upcoming', days };
  return { level: 'ok', days };
}

export const LEVEL_RANK = { overdue: 0, urgent: 1, soon: 2, missing: 3, upcoming: 4, ok: 5 };
export const LEVEL_LABEL = { overdue: 'Overdue', urgent: 'Due soon', soon: 'Coming up', upcoming: 'On the horizon', ok: 'On track', missing: 'No date' };

export function describeDays(days) {
  if (days === null) return '';
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return 'due today';
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

// Combine the caseload row with the student's IEP records.
// The latest IEP in the app is the most current source for due dates; the list's own
// columns are used when no IEP has been entered yet.
export function enrich(student, records) {
  const mine = records.filter(r => (r.caseloadId && r.caseloadId === student.id)
    || (!r.caseloadId && student.sasid && r.sasid === student.sasid)
    || (!r.caseloadId && !r.sasid && norm(r.legalName) === norm(student.legalName)));
  mine.sort((a, b) => (b.meetingDate || '').localeCompare(a.meetingDate || '') || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const latestFinal = mine.find(r => r.status === 'Final');
  const draft = mine.find(r => r.status !== 'Final');
  const standingIep = student.checklistState?._standingIep || null;
  const iepDue = standingIep?.iepDue || latestFinal?.nextReviewDate || student.iepDue || '';
  const reevalDue = standingIep?.reevalDue || latestFinal?.nextEligDate || student.reevalDue || '';
  const iep = dueStatus(iepDue, 'iep');
  const reeval = dueStatus(reevalDue, 'reeval');
  const worst = [iep, reeval].sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level])[0];
  return { ...student, listIepDue: student.iepDue, listReevalDue: student.reevalDue,
    records: mine, draft, latestFinal, iepDue, reevalDue, iep, reeval, worst,
    standingIep,
    iepSource: standingIep?.iepDue ? 'standing' : latestFinal?.nextReviewDate ? 'IEP' : student.iepDue ? 'list' : '',
    reevalSource: standingIep?.reevalDue ? 'standing' : latestFinal?.nextEligDate ? 'IEP' : student.reevalDue ? 'list' : '' };
}

// Alerts shown at the top of the caseload
export function buildAlerts(students) {
  const out = [];
  for (const s of students) {
    for (const [kind, st, date, label, sched] of [['iep', s.iep, s.iepDue, 'Annual IEP review', s.iepScheduled], ['reeval', s.reeval, s.reevalDue, 'Reevaluation', s.reevalScheduled]]) {
      if (['overdue', 'urgent', 'soon'].includes(st.level)) {
        const notes = [];
        notes.push(sched ? (sched.date ? `Meeting scheduled ${fmt(sched.date)}` : 'Meeting scheduled') : 'Meeting not scheduled');
        if (kind === 'iep') notes.push(s.draft ? 'Draft in progress' : 'No draft started');
        out.push({ student: s, kind, level: st.level, days: st.days, date, label, scheduled: !!sched, note: notes.join(' · ') });
      }
    }
    if (!s.iepDue) out.push({ student: s, kind: 'iep', level: 'missing', days: null, date: '', label: 'No IEP review date on file', note: '' });
  }
  return out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || (a.days ?? 9e9) - (b.days ?? 9e9));
}

const fmt = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || ''); return m ? `${m[2]}/${m[3]}/${m[1]}` : v; };
const norm = s => (s || '').toLowerCase().replace(/[^a-z]/g, '');

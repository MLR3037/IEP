import { Fragment, useEffect, useMemo, useState } from 'react';
import { enrich, buildAlerts, describeDays, LEVEL_LABEL, LEVEL_RANK } from './due.js';
import { fmtDate } from '../generate.js';
import { ageFrom } from '../schema.js';
import { activeTeacherTasks, checklistTasks } from './timeline.js';

const programs = s => [s.program, s.mhServices && !/^(no|none|n\/a)$/i.test(s.mhServices) ? 'MH: ' + s.mhServices : '']
  .flatMap(x => (x || '').split(/,\s*/)).filter(Boolean);
const localToday = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function DueCell({ date, st }) {
  if (!date) return <span className="due missing">Not on file</span>;
  return (
    <div className="duewrap">
      <span className={'due ' + st.level}>
        <span className="dd">{fmtDate(date)}</span>
        <span className="dl">{describeDays(st.days)}</span>
      </span>
    </div>
  );
}
function ScheduledCell({ value }) {
  if (!value) return <span className="muted">Not scheduled</span>;
  return <span>{value.date ? fmtDate(value.date) : value.text || 'Scheduled'}</span>;
}

export default function Caseload({ caseload, records, onOpenIep, onStartIep, onRefresh, onSaveDates, onSaveChecklist, onUploadStandingIep, loading, error }) {
  const [scope, setScope] = useState('mine');
  const [q, setQ] = useState('');
  const [district, setDistrict] = useState('');
  const [room, setRoom] = useState('');
  const [service, setService] = useState('');
  const [unsched, setUnsched] = useState(false);
  const [cm, setCm] = useState('');
  const [attention, setAttention] = useState(false);
  const [open, setOpen] = useState(null);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [sort, setSort] = useState('due');
  const [editingDates, setEditingDates] = useState(null);
  const [dateDraft, setDateDraft] = useState(null);
  const [dateError, setDateError] = useState('');
  const [dateSavedId, setDateSavedId] = useState(null);
  const [dateSaving, setDateSaving] = useState(false);
  const [checklistSaving, setChecklistSaving] = useState('');
  const [checklistError, setChecklistError] = useState('');
  const [printStudentId, setPrintStudentId] = useState(null);
  const [uploadDraft, setUploadDraft] = useState(null);
  const [uploadingIep, setUploadingIep] = useState(false);

  const students = useMemo(() => {
    const base = caseload ? (scope === 'all' ? caseload.all : caseload.mine) : [];
    return base.map(s => enrich(s, records));
  }, [caseload, scope, records]);
  const opts = key => [...new Set(students.flatMap(s => (key === 'programs' ? programs(s) : [s[key]])).filter(Boolean))].sort();
  const has = key => students.some(s => s[key]);

  const shown = useMemo(() => {
    let r = students.filter(s =>
      (!q || `${s.legalName} ${s.sasid}`.toLowerCase().includes(q.toLowerCase())) &&
      (!district || s.district === district) && (!room || s.classroom === room) &&
      (!service || programs(s).includes(service)) && (!cm || s.caseManager === cm) &&
      (!unsched || [[s.iep, s.iepScheduled], [s.reeval, s.reevalScheduled]].some(([st, sc]) => ['overdue', 'urgent', 'soon'].includes(st.level) && !sc)) &&
      (!attention || ['overdue', 'urgent', 'soon', 'missing'].includes(s.worst.level)));
    const byName = (a, b) => a.legalName.localeCompare(b.legalName);
    if (sort === 'name') r = [...r].sort(byName);
    else if (sort === 'iep') r = [...r].sort((a, b) => (a.iep.days ?? 9e9) - (b.iep.days ?? 9e9));
    else if (sort === 'reeval') r = [...r].sort((a, b) => (a.reeval.days ?? 9e9) - (b.reeval.days ?? 9e9));
    else r = [...r].sort((a, b) => LEVEL_RANK[a.worst.level] - LEVEL_RANK[b.worst.level] || (a.worst.days ?? 9e9) - (b.worst.days ?? 9e9) || byName(a, b));
    return r;
  }, [students, q, district, room, service, cm, attention, unsched, sort]);

  const alerts = useMemo(() => buildAlerts(students), [students]);
  const count = lvl => alerts.filter(a => a.level === lvl).length;
  const todoItems = students.flatMap(student => activeTeacherTasks(student).map(task => ({ student, task })))
    .sort((a, b) => (a.task.targetDate || '').localeCompare(b.task.targetDate || '')
      || a.student.legalName.localeCompare(b.student.legalName));
  const todoCount = todoItems.filter(({ student, task }) => task.dateRequired || !student.checklistState?.[task.id]?.doneAt).length;
  const printStudent = students.find(student => student.id === printStudentId);

  useEffect(() => {
    if (!printStudent) return undefined;
    const timer = setTimeout(() => window.print(), 100);
    const finish = () => setPrintStudentId(null);
    window.addEventListener('afterprint', finish);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', finish);
    };
  }, [printStudent]);

  function editDates(student) {
    const types = caseload.scheduleFieldTypes || {};
    setDateDraft({
      iepDue: student.listIepDue || '',
      reevalDue: student.listReevalDue || '',
      iepScheduled: types.iepScheduled === 'boolean' ? Boolean(student.iepScheduled) : student.iepScheduled?.date || '',
      reevalScheduled: types.reevalScheduled === 'boolean' ? Boolean(student.reevalScheduled) : student.reevalScheduled?.date || '',
    });
    setEditingDates(student.id);
    setDateError('');
    setDateSavedId(null);
  }
  async function saveDates(studentId) {
    setDateSaving(true);
    setDateError('');
    setDateSavedId(null);
    try {
      await onSaveDates(studentId, dateDraft);
      setEditingDates(null);
      setDateDraft(null);
      setDateSavedId(studentId);
      await onRefresh();
    } catch (e) {
      setDateError(e.message || String(e));
    } finally {
      setDateSaving(false);
    }
  }
  function startStandingIepUpload(student) {
    setUploadDraft({
      studentId: student.id,
      file: null,
      meetingDate: student.standingIep?.meetingDate || student.iepScheduled?.date || '',
      iepDue: student.listIepDue || student.iepDue || '',
      reevalDue: student.listReevalDue || student.reevalDue || '',
      error: '',
      status: '',
      uploaded: null,
    });
  }
  async function uploadStandingIep(student) {
    if (!uploadDraft?.file || !uploadDraft.meetingDate || !uploadDraft.iepDue) {
      setUploadDraft(d => ({ ...d, error: 'Choose a PDF or Word document and enter the IEP meeting and next review dates.' }));
      return;
    }
    setUploadingIep(true);
    setUploadDraft(d => ({ ...d, error: '', status: 'Uploading the standing IEP to SharePoint…' }));
    let uploaded;
    try {
      uploaded = await onUploadStandingIep(student.legalName, uploadDraft.file);
      setUploadDraft(d => ({ ...d, uploaded, status: 'Document uploaded. Saving dates and link…' }));
      const dateUpdates = {
        iepDue: uploadDraft.iepDue,
      };
      if (uploadDraft.reevalDue) dateUpdates.reevalDue = uploadDraft.reevalDue;
      await onSaveDates(student.id, dateUpdates);
      await onSaveChecklist(student.id, {
        ...(student.checklistState || {}),
        _standingIep: {
          fileName: uploaded.fileName,
          url: uploaded.url,
          uploadedAt: new Date().toISOString(),
          meetingDate: uploadDraft.meetingDate,
          iepDue: uploadDraft.iepDue,
          reevalDue: uploadDraft.reevalDue,
        },
      });
      await onRefresh();
      setUploadDraft(null);
    } catch (e) {
      setUploadDraft(d => ({
        ...d,
        uploaded: uploaded || d.uploaded,
        status: '',
        error: uploaded
          ? `The file was uploaded${uploaded.url ? ` (${uploaded.fileName})` : ''}, but saving its dates or link failed: ${e.message || String(e)}`
          : e.message || String(e),
      }));
    } finally {
      setUploadingIep(false);
    }
  }
  async function toggleChecklistTask(student, task, checked) {
    if (!onSaveChecklist) return;
    const state = { ...(student.checklistState || {}) };
    if (checked) {
      const initials = (caseload.me.name || '').split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 4).toUpperCase();
      state[task.id] = { doneAt: localToday(), initials };
    } else delete state[task.id];
    setChecklistSaving(student.id);
    setChecklistError('');
    try {
      await onSaveChecklist(student.id, state);
      await onRefresh();
    } catch (e) {
      setChecklistError(e.message || String(e));
    } finally {
      setChecklistSaving('');
    }
  }
  function runTaskAction(student, task) {
    if (task.action === 'edit-dates') {
      setOpen(student.id);
      editDates(student);
    } else if (task.action === 'open-iep') {
      if (student.draft) onOpenIep(student.draft.id);
      else onStartIep(student);
    }
  }

  if (error) return <main className="caseload"><div className="msg error">Couldn’t load the caseload list: {error}</div></main>;
  if (!caseload) return <main className="caseload"><p className="empty">Loading caseload…</p></main>;

  const sortBtn = (key, label) => <button type="button" className={'th-sort' + (sort === key ? ' on' : '')} onClick={() => setSort(key)}>{label}</button>;

  return (
    <main className="caseload">
      <div className="cl-head">
        <div>
          <h1>{scope === 'all' ? 'All students' : 'My caseload'}</h1>
          <p className="sub">{caseload.me.name} · {students.length} student{students.length === 1 ? '' : 's'}</p>
        </div>
        <div className="tools">
          {caseload.me.allAccess && (
            <div className="seg" role="tablist">
              <button className={scope === 'mine' ? 'on' : ''} onClick={() => setScope('mine')}>My students</button>
              <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>All students</button>
            </div>
          )}
          <button onClick={onRefresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </div>

      <div className="tiles">
        {[['overdue', 'Overdue'], ['urgent', 'Due within 30 days*'], ['soon', 'Coming up*'], ['missing', 'No IEP date on file']].map(([lvl, label]) => (
          <button key={lvl} className={'tile ' + lvl} onClick={() => { setAttention(true); }}>
            <span className="n">{count(lvl)}</span><span className="t">{label}</span>
          </button>
        ))}
      </div>
      <p className="fine">*IEP reviews: urgent within 30 days, coming up within 60. Reevaluations: urgent within 60 days, coming up within 90, to leave time for testing.</p>

      <section className="todo-panel">
        <div className="todo-head">
          <h2>To do <span className="todo-count">{todoCount}</span></h2>
        </div>
        {!caseload.checklistEnabled && (
          <p className="msg warn">To save checklist check-offs across refreshes, add a multiple-lines-of-text SharePoint column named <b>IEPChecklistState</b> to Current Clients.</p>
        )}
        {checklistError && <p className="msg error" role="alert">{checklistError}</p>}
        {todoItems.length ? (
          <ul className="todo-list">
            {todoItems.map(({ student, task }) => {
              const status = student.checklistState?.[task.id];
              const saving = checklistSaving === student.id;
              return (
                <li key={`${student.id}:${task.id}`} className={task.dateRequired ? 'todo-item missing-date' : 'todo-item'}>
                  {!task.dateRequired && (
                    <input type="checkbox" checked={Boolean(status?.doneAt)} disabled={!onSaveChecklist || saving}
                      aria-label={`Mark ${task.title} complete for ${student.legalName}`}
                      onChange={event => toggleChecklistTask(student, task, event.target.checked)} />
                  )}
                  <div className="todo-copy">
                    <b>{student.legalName}</b>
                    <span>{task.title}</span>
                    <small>{task.dateRequired ? 'Date needed' : `${task.checkpoint} · Owner: ${task.owner}`}
                      {task.targetDate ? ` · ${fmtDate(task.targetDate)}` : ''}
                      {status?.doneAt ? ` · Done ${fmtDate(status.doneAt)}${status.initials ? ` (${status.initials})` : ''}` : ''}
                    </small>
                  </div>
                  {task.action && <button className="mini" onClick={() => runTaskAction(student, task)}>{task.action === 'edit-dates' ? 'Enter date' : student.draft ? 'Open draft' : 'Start IEP'}</button>}
                  {saving && <small>Saving…</small>}
                </li>
              );
            })}
          </ul>
        ) : <p className="muted">No current tasks. Checklist tasks appear only for students with an IEP meeting scheduled within the next 60 days.</p>}
      </section>

      {alerts.length > 0 && (
        <section className="alerts">
          <h2>Alerts</h2>
          <ul>
            {(showAllAlerts ? alerts : alerts.slice(0, 6)).map((a, i) => (
              <li key={i} className={'alert ' + a.level}>
                <span className="pip" />
                <span className="what"><b>{a.student.legalName}</b> — {a.label}{a.date && <> {a.level === 'overdue' ? 'was due' : 'due'} {fmtDate(a.date)} ({describeDays(a.days)})</>}
                  {a.note && <span className="anote"> · {a.note}</span>}</span>
                <span className="act">
                  {a.student.draft
                    ? <button className="mini" onClick={() => onOpenIep(a.student.draft.id)}>Open draft</button>
                    : <button className="mini" onClick={() => onStartIep(a.student)}>Start IEP</button>}
                </span>
              </li>
            ))}
          </ul>
          {alerts.length > 6 && <button className="link" onClick={() => setShowAllAlerts(v => !v)}>{showAllAlerts ? 'Show fewer' : `Show all ${alerts.length} alerts`}</button>}
        </section>
      )}

      <div className="filters">
        <input className="search" placeholder="Search students…" value={q} onChange={e => setQ(e.target.value)} />
        <select value={district} onChange={e => setDistrict(e.target.value)}><option value="">All districts</option>{opts('district').map(o => <option key={o}>{o}</option>)}</select>
        <select value={room} onChange={e => setRoom(e.target.value)}><option value="">All classrooms</option>{opts('classroom').map(o => <option key={o}>{o}</option>)}</select>
        <select value={service} onChange={e => setService(e.target.value)}><option value="">All programs</option>{opts('programs').map(o => <option key={o}>{o}</option>)}</select>
        {scope === 'all' && <select value={cm} onChange={e => setCm(e.target.value)}><option value="">All case managers</option>{opts('caseManager').map(o => <option key={o}>{o}</option>)}</select>}
        <label className="check"><input type="checkbox" checked={attention} onChange={e => setAttention(e.target.checked)} /> Needs attention only</label>
        <label className="check"><input type="checkbox" checked={unsched} onChange={e => setUnsched(e.target.checked)} /> Due soon, meeting not scheduled</label>
      </div>

      <div className="tablewrap">
        <table className="cl-table">
          <thead><tr>
            <th>{sortBtn('name', 'Student')}</th>{has('grade') && <th>Grade</th>}<th>District</th><th>Classroom</th><th>Program / services</th>{has('disability') && <th>Disability</th>}
            {scope === 'all' && <th>Case manager</th>}
            <th>{sortBtn('iep', 'IEP review due')}</th><th>IEP meeting scheduled</th>
            <th>{sortBtn('reeval', 'Reevaluation due')}</th><th>Reevaluation scheduled</th>
            <th>IEP in app</th><th></th>
          </tr></thead>
          <tbody>
            {shown.map(s => {
              const age = ageFrom(s.dob);
              return (
                <Fragment key={s.id}>
                  <tr className={'row ' + s.worst.level + (open === s.id ? ' open' : '')} onClick={() => setOpen(open === s.id ? null : s.id)}>
                    <td><div className="nm">{s.legalName}</div><div className="meta">DOB {fmtDate(s.dob) || '—'}{age !== null ? ` · age ${age}` : ''}</div></td>
                    {has('grade') && <td>{s.grade}</td>}<td>{s.district}</td><td>{s.classroom}</td>
                    <td><div className="chips">{programs(s).map(x => <span key={x} className={'chip' + (x.startsWith('MH') ? ' mh' : '')}>{x}</span>)}</div></td>
                    {has('disability') && <td className="small">{s.disability}</td>}
                    {scope === 'all' && <td className="small">{s.caseManager}</td>}
                    <td><DueCell date={s.iepDue} st={s.iep} /></td>
                    <td className="small"><ScheduledCell value={s.iepScheduled} /></td>
                    <td><DueCell date={s.reevalDue} st={s.reeval} /></td>
                    <td className="small"><ScheduledCell value={s.reevalScheduled} /></td>
                    <td className="small">{s.draft
                      ? <button className="link st draft" onClick={event => { event.stopPropagation(); onOpenIep(s.draft.id); }}>Draft</button>
                      : s.latestFinal ? <span className="st final">Final {fmtDate(s.latestFinal.meetingDate)}</span> : <span className="muted">None</span>}</td>
                    <td onClick={e => e.stopPropagation()}>
                      {s.draft
                        ? <button className="mini" onClick={() => onOpenIep(s.draft.id)}>Open draft</button>
                        : <button className="mini primary" onClick={() => onStartIep(s)}>Start IEP</button>}
                    </td>
                  </tr>
                  {open === s.id && (
                    <tr className="detail"><td colSpan={20}>
                      <div className="dgrid">
                        <div><h4>Student</h4>
                          <p>{s.sasid ? <>SASID {s.sasid}<br /></> : null}Started at Evoke {fmtDate(s.startDate) || '—'}<br />Program: {s.program || '—'}{s.mhServices ? <><br />Mental health services: {s.mhServices}</> : null}</p></div>
                        <div><h4>Team</h4>
                          <p>Teacher: {s.caseManager || '—'}<br />BCBA: {s.bcba || '—'}<br />MH provider: {s.mhProvider || '—'}</p>
                          {s.parentName && <p>Parent: {s.parentName}{s.parentPhone ? ` · ${s.parentPhone}` : ''}</p>}</div>
                        <div><h4>Due dates</h4>
                          {onSaveDates && editingDates !== s.id && <button className="mini" onClick={() => editDates(s)}>Edit Current Clients dates</button>}
                          <p>IEP review: {fmtDate(s.iepDue) || 'not on file'} {s.iepSource && <span className="muted">({s.iepSource === 'standing' ? 'from standing IEP' : s.iepSource === 'IEP' ? 'from latest final IEP' : 'from student list'})</span>}<br />
                            Reevaluation: {fmtDate(s.reevalDue) || 'not on file'} {s.reevalSource && <span className="muted">({s.reevalSource === 'standing' ? 'from standing IEP' : s.reevalSource === 'IEP' ? 'from latest final IEP' : 'from student list'})</span>}<br />
                            IEP meeting: {s.iepScheduled ? (s.iepScheduled.date ? `scheduled ${fmtDate(s.iepScheduled.date)}` : 'scheduled') : 'not scheduled'}<br />
                            Reevaluation: {s.reevalScheduled ? (s.reevalScheduled.date ? `scheduled ${fmtDate(s.reevalScheduled.date)}` : 'scheduled') : 'not scheduled'}</p></div>
                        {editingDates === s.id && dateDraft && (
                          <div className="date-editor">
                            <h4>Edit Current Clients dates</h4>
                            <p className="muted">Changes save to the Current Clients list. Dates from a Final IEP still take precedence in the dashboard.</p>
                            <label>IEP review due
                              <input type="date" value={dateDraft.iepDue} onChange={e => setDateDraft(d => ({ ...d, iepDue: e.target.value }))} />
                            </label>
                            <label>Reevaluation due
                              <input type="date" value={dateDraft.reevalDue} onChange={e => setDateDraft(d => ({ ...d, reevalDue: e.target.value }))} />
                            </label>
                            {['iepScheduled', 'reevalScheduled'].map((key, index) => {
                              const label = index === 0 ? 'IEP meeting scheduled' : 'Reevaluation scheduled';
                              const type = caseload.scheduleFieldTypes?.[key];
                              if (type === 'boolean') return (
                                <label key={key}>{label}
                                  <select value={dateDraft[key] ? 'yes' : 'no'}
                                    onChange={e => setDateDraft(d => ({ ...d, [key]: e.target.value === 'yes' }))}>
                                    <option value="no">Not scheduled</option>
                                    <option value="yes">Scheduled</option>
                                  </select>
                                </label>
                              );
                              if (type === 'date') return (
                                <label key={key}>{label}
                                  <input type="date" value={dateDraft[key]} onChange={e => setDateDraft(d => ({ ...d, [key]: e.target.value }))} />
                                </label>
                              );
                              return <p className="muted" key={key}>{label}: unsupported SharePoint column type</p>;
                            })}
                            {dateError && <p className="date-error" role="alert">{dateError}</p>}
                            <div className="date-actions">
                              <button className="mini primary" disabled={dateSaving} onClick={() => saveDates(s.id)}>{dateSaving ? 'Saving…' : 'Save dates'}</button>
                              <button className="mini" disabled={dateSaving} onClick={() => { setEditingDates(null); setDateDraft(null); setDateError(''); }}>Cancel</button>
                            </div>
                          </div>
                        )}
                        {dateSavedId === s.id && <p className="date-saved" role="status">Dates saved to Current Clients.</p>}
                        <div className="standing-iep">
                          <h4>Standing IEP document</h4>
                          {s.standingIep?.url
                            ? <p><a href={s.standingIep.url} target="_blank" rel="noreferrer">{s.standingIep.fileName || 'Open current IEP'}</a>
                              {s.standingIep.uploadedAt ? <><br /><span className="muted">Uploaded {fmtDate(s.standingIep.uploadedAt)}</span></> : null}</p>
                            : <p className="muted">No current IEP document uploaded.</p>}
                          {!onUploadStandingIep && <p className="muted">Document upload is available when connected to SharePoint.</p>}
                          {onUploadStandingIep && !caseload.checklistEnabled && <p className="msg warn">Add the IEPChecklistState column before uploading; it stores the document link and meeting date.</p>}
                          {onUploadStandingIep && caseload.checklistEnabled && uploadDraft?.studentId !== s.id && (
                            <button className="mini" onClick={() => startStandingIepUpload(s)}>Upload current IEP</button>
                          )}
                          {uploadDraft?.studentId === s.id && (
                            <div className="standing-iep-form">
                              <label>Current IEP file (PDF or Word)
                                <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                  disabled={uploadingIep}
                                  onChange={event => setUploadDraft(d => ({ ...d, file: event.target.files?.[0] || null, error: '', uploaded: null }))} />
                              </label>
                              <label>Meeting date shown on this IEP
                                <input type="date" value={uploadDraft.meetingDate} disabled={uploadingIep}
                                  onChange={event => setUploadDraft(d => ({ ...d, meetingDate: event.target.value }))} />
                              </label>
                              <label>Next IEP review due
                                <input type="date" value={uploadDraft.iepDue} disabled={uploadingIep}
                                  onChange={event => setUploadDraft(d => ({ ...d, iepDue: event.target.value }))} />
                              </label>
                              <label>Next reevaluation due (if shown)
                                <input type="date" value={uploadDraft.reevalDue} disabled={uploadingIep}
                                  onChange={event => setUploadDraft(d => ({ ...d, reevalDue: event.target.value }))} />
                              </label>
                              <p className="muted">The uploaded document is stored in this student’s IEP Documents folder. Enter the dates shown in it; these update Current Clients.</p>
                              {uploadDraft.error && <p className="date-error" role="alert">{uploadDraft.error}</p>}
                              {uploadDraft.status && <p className="date-saved" role="status">{uploadDraft.status}</p>}
                              {uploadDraft.uploaded?.url && <p><a href={uploadDraft.uploaded.url} target="_blank" rel="noreferrer">Open uploaded document</a></p>}
                              <div className="date-actions">
                                <button className="mini primary" disabled={uploadingIep} onClick={() => uploadStandingIep(s)}>{uploadingIep ? 'Uploading…' : 'Upload and save dates'}</button>
                                <button className="mini" disabled={uploadingIep} onClick={() => setUploadDraft(null)}>Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                        <div><h4>IEPs in the app</h4>
                          {s.records.length ? <ul className="iep-list">{s.records.map(r => (
                            <li key={r.id}><button className="link" onClick={() => onOpenIep(r.id)}>{fmtDate(r.meetingDate) || 'No meeting date'}</button> <span className={'st ' + (r.status || 'Draft').toLowerCase()}>{r.status || 'Draft'}</span></li>
                          ))}</ul> : <p className="muted">None yet.</p>}
                          <button className="mini" onClick={() => onStartIep(s)}>{s.latestFinal ? 'Start next IEP from latest' : 'Start IEP'}</button>
                          <button className="mini" onClick={() => setPrintStudentId(s.id)}>Print full timeline checklist</button>
                        </div>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
            {!shown.length && <tr><td colSpan={20} className="empty">No students match.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="legend">
        {['overdue', 'urgent', 'soon', 'upcoming', 'missing'].map(l => <span key={l} className={'due ' + l}><span className="dd">{LEVEL_LABEL[l]}</span></span>)}
      </div>
      {printStudent && <section className="print-checklist">
        <h1>IEP Timeline Checklist</h1>
        <p>Evoke Behavioral Health · One checklist per student, counted back from the IEP due date.</p>
        <div className="print-student">
          <span>Student: {printStudent.legalName}</span>
          <span>IEP due date: {fmtDate(printStudent.iepDue) || '—'}</span>
          <span>IEP meeting date: {fmtDate(printStudent.iepScheduled?.date || printStudent.draft?.meetingDate || printStudent.latestFinal?.meetingDate) || '—'}</span>
          <span>Age 15+ (transition): {ageFrom(printStudent.dob, printStudent.iepDue) >= 15 ? 'Yes' : 'No'}</span>
          <span>Teacher: {printStudent.caseManager || '—'}</span>
          <span>BCBA: {printStudent.bcba || '—'}</span>
          <span>MH clinician: {printStudent.mhProvider || '—'}</span>
        </div>
        <p>Owner key: T = Teacher · B = BCBA · M = MHC</p>
        <table>
          <thead><tr><th>Done</th><th>When / target date</th><th>Owner</th><th>Task</th><th>Done date / initials</th></tr></thead>
          <tbody>{checklistTasks(printStudent).map(task => {
            const state = printStudent.checklistState?.[task.id];
            return <tr key={task.id}>
              <td>{state?.doneAt ? '☒' : '☐'}</td>
              <td>{task.checkpoint || 'Before starting'}{task.targetDate ? ` · ${fmtDate(task.targetDate)}` : ''}</td>
              <td>{task.owner}</td>
              <td>{task.title}</td>
              <td>{state?.doneAt ? `${fmtDate(state.doneAt)} / ${state.initials || ''}` : '________________'}</td>
            </tr>;
          })}</tbody>
        </table>
        <h2>Action items from the meeting</h2>
        {[1, 2, 3, 4].map(number => <p key={number}>{number}. __________________________________________________________________________________</p>)}
      </section>}
    </main>
  );
}

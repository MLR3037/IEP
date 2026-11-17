import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import { SECTIONS, defaultData, missingRequired, DISABILITIES, effectiveAge, isTransitionAge } from './schema.js';
import Caseload from './caseload/Caseload.jsx';
import { loadSharePointCaseload, demoCaseload, iepFromStudent } from './caseload/source.js';
import { Field } from './Fields.jsx';
import { renderDocx, fileNameFor, fmtDate } from './generate.js';
import { localStore } from './storage/localStore.js';
import { sharepointStore, spConfigured } from './storage/sharepointStore.js';
import tplUrl from './assets/IEP_Template.docx?url';
import './App.css';

const store = spConfigured ? sharepointStore : localStore;
const normalizeStudentName = value => (value || '').toLowerCase().replace(/[^a-z]/g, '');
function matchCaseloadStudent(students, data) {
  if (data.caseloadId) {
    const linked = students.find(item => item.id === data.caseloadId);
    if (linked) return linked;
  }
  if (data.sasid) {
    const matches = students.filter(item => item.sasid === data.sasid);
    if (matches.length === 1) return matches[0];
  }
  const matches = students.filter(item => normalizeStudentName(item.legalName) === normalizeStudentName(data.legalName));
  return matches.length === 1 ? matches[0] : null;
}

function filled(f, d) {
  if (['heading', 'note', 'bool', 'static'].includes(f.type)) return null;
  if (f.showIf && !f.showIf(d)) return null;
  if (f.type === 'prepost') return f.rows.some(r => d[r.key + 'Pre'] || d[r.key + 'Post']);
  const v = d[f.key];
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === 'object') return Object.values(v).some(Boolean);
  return v !== undefined && v !== '' && v !== null;
}
function sectionProgress(s, d) {
  const r = s.fields.map(f => filled(f, d)).filter(x => x !== null);
  return { done: r.filter(Boolean).length, total: r.length };
}

// Start next year's IEP from an existing one: carries everything forward,
// clears meeting-specific items, and turns last year's goals into "previous goal progress".
function rollForward(rec) {
  const d = structuredClone(rec.data);
  d.prevGoals = (d.goals || []).map(g => ({ domain: g.area || '', prevGoal: g.goal || '', progress: '', recommendation: '' }));
  for (const k of ['meetingDate', 'psSignDate', 'piDate', 'cmDate', 'amendDate']) d[k] = '';
  for (const k of ['eligType']) d[k] = '';
  d.iepType = 'review';
  d.copyProvided = false;
  return { data: d, status: 'Draft' };
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState('');
  const [list, setList] = useState([]);
  const [rec, setRec] = useState(null);
  const [section, setSection] = useState(SECTIONS[0].id);
  const [saveState, setSaveState] = useState('saved');
  const [msg, setMsg] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('caseload');
  const [showStudentSelector, setShowStudentSelector] = useState(false);
  const [caseload, setCaseload] = useState(null);
  const [clLoading, setClLoading] = useState(false);
  const [clError, setClError] = useState('');
  const saveTimer = useRef();
  const recRef = useRef(rec);
  recRef.current = rec;
  const caseloadRef = useRef(caseload);
  caseloadRef.current = caseload;
  const caseloadLoadRef = useRef(Promise.resolve(null));
  const inFlight = useRef(false);
  const inFlightPromise = useRef(null);
  const selectableStudents = caseload?.me.allAccess ? caseload.all : caseload?.mine || [];

  const refresh = useCallback(async () => setList(await store.list()), []);

  useEffect(() => {
    (async () => {
      try { await store.init(); await refresh(); setReady(true); loadCaseload(); } catch (e) { setInitError(e.message || String(e)); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  function loadCaseload() {
    setClLoading(true); setClError('');
    const request = (async () => {
      try {
        const loaded = store.kind === 'sharepoint' ? await loadSharePointCaseload() : demoCaseload();
        caseloadRef.current = loaded;
        setCaseload(loaded);
        await refresh();
        return loaded;
      } catch (e) {
        setClError(e.message || String(e));
        return null;
      } finally {
        setClLoading(false);
      }
    })();
    caseloadLoadRef.current = request;
    return request;
  }

  const doSave = useCallback(async () => {
    const cur = recRef.current;
    if (!cur) return;
    if (inFlight.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => doSaveRef.current(), 800);
      return inFlightPromise.current;
    }
    inFlight.current = true;
    setSaveState('saving');
    const operation = (async () => {
      try {
        const saved = await store.save(cur);
        // Keep edits made while saving, and don't attach this save to a newly opened draft.
        setRec(r => (r && r.createdAt === cur.createdAt && r.id === cur.id
          ? { ...r, id: saved.id, eTag: saved.eTag, updatedAt: saved.updatedAt }
          : r));
        const active = recRef.current;
        if (active?.createdAt === cur.createdAt && active.id === cur.id) {
          recRef.current = { ...active, id: saved.id, eTag: saved.eTag, updatedAt: saved.updatedAt };
        }
        if (store.kind === 'sharepoint' && (cur.data.caseloadId || cur.data.sasid || cur.data.studentLocalId)) {
          let currentCaseload = caseloadRef.current;
          if (!currentCaseload) currentCaseload = await caseloadLoadRef.current;
          const students = currentCaseload?.me.allAccess ? currentCaseload.all : currentCaseload?.mine || [];
          const student = matchCaseloadStudent(students, cur.data);
          const identifiers = {};
          if (cur.data.sasid && cur.data.sasid !== student?.sasid) identifiers.sasid = cur.data.sasid;
          if (cur.data.studentLocalId && cur.data.studentLocalId !== student?.lasid) identifiers.lasid = cur.data.studentLocalId;
          if (Object.keys(identifiers).length) {
            try {
              if (!student) throw new Error('This IEP is not linked to a student in your Current Clients caseload. Select the student from Current Clients before saving these IDs.');
              if (!currentCaseload?.saveIdentifiers) throw new Error('Current Clients is unavailable; the ID updates were not written to the student list.');
              await currentCaseload.saveIdentifiers(student.id, identifiers);
              const nextCaseload = {
                ...currentCaseload,
                mine: currentCaseload.mine.map(item => item.id === student.id ? { ...item, sasid: identifiers.sasid || item.sasid, lasid: identifiers.lasid || item.lasid } : item),
                all: currentCaseload.all.map(item => item.id === student.id ? { ...item, sasid: identifiers.sasid || item.sasid, lasid: identifiers.lasid || item.lasid } : item),
              };
              caseloadRef.current = nextCaseload;
              setCaseload(nextCaseload);
            } catch (e) {
              setMsg({ kind: 'error', text: `IEP saved, but student IDs were not written to Current Clients: ${e.message || String(e)}` });
            }
          }
        }
        setSaveState(active?.createdAt === cur.createdAt && active.data !== cur.data ? 'unsaved' : 'saved');
        refresh();
      } catch (e) {
        setSaveState('error');
        setMsg({ kind: 'error', text: e.message });
      } finally {
        inFlight.current = false;
        inFlightPromise.current = null;
      }
    })();
    inFlightPromise.current = operation;
    return operation;
  }, [refresh]);
  const doSaveRef = useRef(doSave);
  doSaveRef.current = doSave;

  const scheduleSave = useCallback(() => {
    setSaveState('unsaved');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(doSave, store.kind === 'local' ? 600 : 2500);
  }, [doSave]);

  const setField = useCallback((k, v) => {
    setRec(r => ({ ...r, data: { ...r.data, [k]: v } }));
    scheduleSave();
  }, [scheduleSave]);

  async function open(id) {
    try {
      if (saveState === 'unsaved' || saveState === 'saving') await doSaveRef.current();
      const opened = await store.get(id);
      if (!opened) throw new Error('This IEP could not be found. Refresh the list and try again.');
      clearTimeout(saveTimer.current);
      recRef.current = opened;
      setRec(opened);
      setShowStudentSelector(false);
      setSaveState('saved');
      setMsg(null);
      setView('iep');
    } catch (e) {
      setMsg({ kind: 'error', text: `Couldn’t open this IEP: ${e.message || String(e)}` });
      setView('iep');
    }
  }
  // From the caseload: roll forward the student's latest final IEP, or prefill a new one from the student list.
  async function startForStudent(st) {
    if (saveState === 'unsaved') await doSave();
    const fromList = iepFromStudent(st);
    const dis = DISABILITIES.find(x => x === st.disability || x.startsWith(st.disability || '\u0000'));
    if (dis) Object.assign(fromList, { primaryDisabilityPre: dis, primaryDisabilityPost: dis });
    if (st.latestFinal) {
      const prev = await store.get(st.latestFinal.id);
      create(prev, {
        caseloadId: st.id, grade: st.grade || prev.data.grade,
        sasid: st.sasid || prev.data.sasid, studentLocalId: st.lasid || prev.data.studentLocalId,
        cmName: prev.data.cmName || st.caseManager,
      });
    } else {
      create(null, fromList);
      setMsg({ kind: 'info', text: `Filled in ${st.legalName}’s details from the student list. Check them before the meeting.` });
    }
  }
  function selectStudentForDraft(studentId) {
    const student = selectableStudents.find(item => item.id === studentId);
    if (!student) return;
    if (rec.data.legalName && rec.data.legalName !== student.legalName
      && !confirm(`Replace the student-specific fields in this draft with ${student.legalName}’s Current Clients information?`)) return;
    const studentFields = iepFromStudent(student);
    const dis = DISABILITIES.find(x => x === student.disability || x.startsWith(student.disability || '\u0000'));
    Object.assign(studentFields, { primaryDisabilityPre: dis || '', primaryDisabilityPost: dis || '' });
    setRec(current => ({ ...current, data: { ...current.data, ...studentFields } }));
    scheduleSave();
    setMsg({ kind: 'info', text: `Filled student details from Current Clients for ${student.legalName}. Review the imported fields before completing the IEP.` });
  }
  function create(from, extra = {}) {
    const base0 = from ? rollForward(from) : { data: defaultData(), status: 'Draft' };
    const base = { ...base0, data: { ...base0.data, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined && v !== '')) } };
    setView('iep');
    setRec({ ...base, createdAt: new Date().toISOString() });
    setShowStudentSelector(!from && !extra.caseloadId);
    setSection(SECTIONS[0].id);
    setSaveState('unsaved');
    setMsg(from ? { kind: 'info', text: `Started from ${from.data.legalName}’s ${fmtDate(from.data.meetingDate) || 'previous'} IEP. Last year’s goals were copied into “Previous goal progress” (add progress there) and kept as a starting point for new goals.` } : null);
  }
  async function del() {
    if (!rec?.id || !confirm(`Delete this IEP for ${rec.data.legalName || 'this student'}? ${store.kind === 'sharepoint' ? 'It goes to the SharePoint recycle bin.' : ''}`)) return;
    await store.remove(rec.id);
    setRec(null);
    refresh();
  }
  async function setStatus(status) {
    if (status === 'Final' && missing.length) return showMissing(`Answer ${missing.length} required question${missing.length > 1 ? 's' : ''} before marking this IEP final:`);
    setRec(r => ({ ...r, status }));
    scheduleSave();
  }
  async function generate() {
    setBusy(true);
    try {
      if (!rec.data.legalName) throw new Error('Add the student’s legal name first.');
      let currentCaseload = caseloadRef.current;
      if (!currentCaseload && store.kind === 'sharepoint') currentCaseload = await caseloadLoadRef.current;
      const students = currentCaseload?.me.allAccess ? currentCaseload.all : currentCaseload?.mine || [];
      const student = matchCaseloadStudent(students, rec.data);
      const documentData = {
        ...rec.data,
        sasid: rec.data.sasid || student?.sasid || '',
        studentLocalId: rec.data.studentLocalId || student?.lasid || '',
      };
      const tpl = await (await fetch(tplUrl)).arrayBuffer();
      const blob = renderDocx(tpl, documentData);
      const name = fileNameFor(documentData);
      saveAs(blob, name);
      if (store.uploadDocument) {
        const url = await store.uploadDocument(rec, blob, name);
        setMsg({ kind: missing.length ? 'warn' : 'ok', text: 'Saved a copy to SharePoint.' + (missing.length ? ` ${missing.length} required question(s) still unanswered:` : ''), url, missing: missing.length ? missing : undefined });
      } else setMsg(missing.length
        ? { kind: 'warn', text: `Downloaded ${name} as a draft. ${missing.length} required question${missing.length > 1 ? 's are' : ' is'} still unanswered:`, missing }
        : { kind: 'ok', text: `Downloaded ${name}.` });
    } catch (e) {
      const detail = e.properties?.errors?.map(x => x.properties?.explanation).join('; ');
      setMsg({ kind: 'error', text: detail || e.message });
    } finally { setBusy(false); }
  }

  const filtered = useMemo(() => list.filter(r => (r.legalName || '').toLowerCase().includes(q.toLowerCase())), [list, q]);
  const ageKnown = rec && effectiveAge(rec.data) !== null;
  const visibleSections = SECTIONS.filter(s => s.id !== 'transition' || !ageKnown || isTransitionAge(rec.data));
  const sec = visibleSections.find(s => s.id === section) || visibleSections[0];
  const missing = useMemo(() => (rec ? missingRequired(rec.data) : []), [rec]);
  const missingBy = useMemo(() => missing.reduce((m, x) => ({ ...m, [x.section]: (m[x.section] || 0) + 1 }), {}), [missing]);
  function goTo(item) {
    setSection(item.section);
    setTimeout(() => document.getElementById(item.key)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }
  function showMissing(prefix) {
    setMsg({ kind: 'error', text: prefix, missing });
  }
  const locked = rec?.status === 'Final';

  if (initError) return <div className="boot error"><h2>Couldn’t connect to SharePoint</h2><p>{initError}</p></div>;
  if (!ready) return <div className="boot">Connecting…</div>;

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><span className="mark">EVOKE</span><span className="title">IEP Builder</span>
          <nav className="topnav">
            <button className={view === 'caseload' ? 'on' : ''} onClick={() => setView('caseload')}>Caseload</button>
            <button className={view === 'iep' ? 'on' : ''} onClick={() => setView('iep')}>IEPs</button>
          </nav></div>
        <div className="where">{store.kind === 'local'
          ? <span className="warn">Demo mode — saved in this browser only. Don’t enter real student information.</span>
          : <span>Saved to SharePoint as {sharepointStore.user}</span>}</div>
      </header>

      {view === 'caseload' ? (
        <Caseload caseload={caseload} records={list} loading={clLoading} error={clError}
          onRefresh={loadCaseload} onSaveDates={caseload?.saveDates} onSaveChecklist={caseload?.saveChecklist}
          onUploadStandingIep={caseload?.uploadStandingIep}
          onOpenIep={open} onStartIep={startForStudent} />
      ) : <>
      <aside className="side">
        <button className="primary block" onClick={() => create()}>+ New IEP</button>
        <input className="search" placeholder="Search students…" value={q} onChange={e => setQ(e.target.value)} />
        <ul className="records">
          {filtered.map(r => (
            <li key={r.id}><button className={rec?.id === r.id ? 'rec on' : 'rec'} onClick={() => open(r.id)}>
              <span className="nm">{r.legalName || 'Untitled'}</span>
              <span className="meta">{fmtDate(r.meetingDate) || 'No meeting date'} · <span className={'st ' + (r.status || 'Draft').toLowerCase()}>{r.status || 'Draft'}</span></span>
            </button></li>
          ))}
          {!filtered.length && <li className="empty">No IEPs yet.</li>}
        </ul>
      </aside>

      {!rec ? (
        <main className="welcome">
          <h1>IEP Builder</h1>
          <p>Fill in an IEP section by section and generate the finished Word document from Evoke’s template. Text boxes grow as you type, and the document gets as long as it needs to.</p>
          <p>Pick a student on the left, or start a new IEP.</p>
        </main>
      ) : (
        <>
          <nav className="sections">
            <div className="student">
              <div className="sn">{rec.data.legalName || 'New IEP'}</div>
              <div className="sm">{fmtDate(rec.data.meetingDate) || 'Meeting date not set'}</div>
            </div>
            {visibleSections.map(s => {
              const p = sectionProgress(s, rec.data);
              return <button key={s.id} className={s.id === section ? 'sec on' : 'sec'} onClick={() => setSection(s.id)}>
                <span>{s.title}</span><span className="badges">{missingBy[s.id] ? <span className="need" title="Required questions unanswered">{missingBy[s.id]} required</span> : null}<span className={'cnt' + (p.done === p.total ? ' full' : '')}>{p.done}/{p.total}</span></span></button>;
            })}
          </nav>
          <main className="editor">
            <div className="toolbar">
              <div className={'save ' + saveState}>{{ saved: rec.id ? 'All changes saved' : 'Not saved yet', saving: 'Saving…', unsaved: 'Unsaved changes', error: 'Save failed' }[saveState]}</div>
              <div className="tools">
                {rec.id && <button onClick={() => create(rec)} title="Copy this IEP into a new draft for the next annual review">Start next IEP from this</button>}
                {locked
                  ? <button onClick={() => setStatus('Draft')}>Reopen for edits</button>
                  : <button onClick={() => setStatus('Final')} disabled={!rec.data.legalName}>Mark final</button>}
                <button className="primary" onClick={generate} disabled={busy}>{busy ? 'Building…' : 'Generate Word document'}</button>
                {rec.id && <button className="danger ghost" onClick={del}>Delete</button>}
              </div>
            </div>
            {msg && <div className={'msg ' + msg.kind}>{msg.text} {msg.url && <a href={msg.url} target="_blank" rel="noreferrer">Open in SharePoint</a>}<button className="x" onClick={() => setMsg(null)} aria-label="Dismiss">×</button>
              {msg.missing && <ul className="missing-list">{msg.missing.map(m => <li key={m.key}><button className="link" onClick={() => goTo(m)}>{m.sectionTitle}: {m.label}</button></li>)}</ul>}</div>}
            {locked && <div className="msg info">This IEP is marked final and locked. Reopen it to make changes.</div>}
            {showStudentSelector && sec.id === 'meeting' && (
              <div className="student-picker">
                <label htmlFor="current-client-picker">Select a student from Current Clients</label>
                <select id="current-client-picker" value={rec.data.caseloadId || ''} onChange={event => selectStudentForDraft(event.target.value)}>
                  <option value="">Choose a student…</option>
                  {[...selectableStudents]
                    .sort((a, b) => a.legalName.localeCompare(b.legalName))
                    .map(student => <option key={student.id} value={student.id}>{student.legalName}</option>)}
                </select>
                {clLoading && <span className="muted">Loading Current Clients…</span>}
                {clError && <span className="date-error" role="alert">Couldn’t load Current Clients: {clError}</span>}
                {!clLoading && !clError && !selectableStudents.length && <span className="muted">No students are available in your Current Clients caseload.</span>}
                <span className="help">Selecting a student fills matching IEP fields from Current Clients. Review those values before continuing.</span>
              </div>
            )}
            <h2>{sec.title}</h2>
            <fieldset className="fields" disabled={locked}>
              {sec.fields.map((f, i) => <Field key={f.key || i} f={f} data={rec.data} set={setField} />)}
            </fieldset>
            <div className="pager">
              {visibleSections.indexOf(sec) > 0 && <button onClick={() => setSection(visibleSections[visibleSections.indexOf(sec) - 1].id)}>← {visibleSections[visibleSections.indexOf(sec) - 1].title}</button>}
              <span />
              {visibleSections.indexOf(sec) < visibleSections.length - 1 && <button onClick={() => setSection(visibleSections[visibleSections.indexOf(sec) + 1].id)}>{visibleSections[visibleSections.indexOf(sec) + 1].title} →</button>}
            </div>
          </main>
        </>
      )}
      </>}
    </div>
  );
}

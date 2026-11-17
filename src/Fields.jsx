import { useLayoutEffect, useRef, useState } from 'react';
import { newGoal, isRequired } from './schema.js';
import { STANDARD_AREAS, standardFieldText, standardLookupUrl } from './standardOptions.js';

function AutoText({ value, onChange, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
  }, [value]);
  return <textarea ref={ref} rows={3} value={value || ''} onChange={e => onChange(e.target.value)} {...rest} />;
}

const YN = {
  yesno: [['y', 'Yes'], ['n', 'No']],
  yesnona: [['y', 'Yes'], ['n', 'No'], ['na', 'N/A']],
  yesnona_noN: [['y', 'Yes'], ['na', 'N/A']],
  yesnoni: [['y', 'Yes'], ['n', 'No'], ['ni', 'No information']],
};

function Pills({ value, options, onChange }) {
  return (
    <div className="pills" role="radiogroup">
      {options.map(([v, l]) => (
        <button type="button" key={v} role="radio" aria-checked={value === v}
          className={value === v ? 'pill on' : 'pill'} onClick={() => onChange(value === v ? '' : v)}>{l}</button>
      ))}
    </div>
  );
}

function PrePostSelect({ id, value, options, onChange }) {
  return <select id={id} className={value ? '' : 'missing-sel'} value={value || ''} onChange={e => onChange(e.target.value)}>
    <option value="">Select…</option>{options.map(o => <option key={o}>{o}</option>)}
    {value && !options.includes(value) && <option value={value}>{value} (old value)</option>}
  </select>;
}

async function prepareImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('Choose or paste an image file.');
  if (file.size > 12 * 1024 * 1024) throw new Error('The image must be smaller than 12 MB.');
  if (typeof createImageBitmap !== 'function') throw new Error('This browser cannot process pasted images. Try a current version of Edge or Chrome.');

  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, 2000 / bitmap.width, 2400 / bitmap.height);
    let quality = 0.9;
    let data;
    let width;
    let height;
    do {
      width = Math.max(1, Math.round(bitmap.width * scale));
      height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('The browser could not process this image.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= 1_300_000) break;
      if (quality > 0.76) quality -= 0.06;
      else scale *= 0.85;
    } while (scale >= 0.5);
    if (!data || data.length > 1_300_000) throw new Error('The image is too large to save with this IEP. Try a smaller image.');
    return { data, width, height, mimeType: 'image/jpeg' };
  } finally {
    bitmap.close();
  }
}

function VinelandImageField({ id, value, onChange, help }) {
  const [error, setError] = useState('');
  async function accept(file) {
    if (!file) return;
    setError('');
    try {
      onChange(await prepareImage(file));
    } catch (e) {
      setError(e.message || String(e));
    }
  }
  function paste(event) {
    const item = [...(event.clipboardData?.items || [])].find(entry => entry.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (file) {
      event.preventDefault();
      accept(file);
    }
  }
  return <div className="field wide vineland-image">
    <label htmlFor={id} className="lbl">Vineland-III score grid</label>
    <div className="image-paste" tabIndex={0} onPaste={paste} aria-label="Paste Vineland score grid image">
      {value?.data
        ? <img src={value.data} alt="Vineland-III score grid preview" />
        : <span>Click here, then paste a copied image (Ctrl+V)</span>}
    </div>
    <div className="image-actions">
      <label className="mini" htmlFor={id}>Upload image</label>
      {value?.data && <button type="button" className="mini danger" onClick={() => onChange(null)}>Remove image</button>}
      <span className="help">PNG, JPEG, or another browser-supported image · max 12 MB before compression</span>
    </div>
    <input id={id} className="image-file" type="file" accept="image/*"
      onChange={event => { accept(event.target.files?.[0]); event.target.value = ''; }} />
    {help && <div className="help">{help}</div>}
    {error && <div className="date-error" role="alert">{error}</div>}
  </div>;
}

function ImageTextArea({ id, value, images = [], onChange, onImagesChange }) {
  const [error, setError] = useState('');
  async function addFiles(files) {
    if (!files.length) return;
    if (images.length + files.length > 6) {
      setError('You can add up to 6 images to this field.');
      return;
    }
    setError('');
    try {
      const prepared = await Promise.all(files.map(prepareImage));
      onImagesChange([...images, ...prepared]);
    } catch (e) {
      setError(e.message || String(e));
    }
  }
  function paste(event) {
    const files = [...(event.clipboardData?.items || [])]
      .filter(item => item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter(Boolean);
    if (!files.length) return;
    event.preventDefault();
    addFiles(files);
  }
  return <>
    <AutoText id={id} value={value} onChange={onChange} onPaste={paste} />
    <div className="image-actions">
      <label className="mini" htmlFor={`${id}-upload`}>Upload images</label>
      <span className="help">Or paste an image into the text box · up to 6 images</span>
      <input id={`${id}-upload`} className="image-file" type="file" accept="image/*" multiple
        onChange={event => { addFiles([...event.target.files]); event.target.value = ''; }} />
    </div>
    {images.length > 0 && <div className="inline-image-list">
      {images.map((image, index) => <div className="inline-image" key={`${image.data.slice(-32)}-${index}`}>
        <img src={image.data} alt={`Pasted image ${index + 1}`} />
        <button type="button" className="mini danger" onClick={() => onImagesChange(images.filter((_, i) => i !== index))}>
          Remove image {index + 1}
        </button>
      </div>)}
    </div>}
    {error && <div className="date-error" role="alert">{error}</div>}
  </>;
}

export function Field({ f, data, set, idPrefix = '', rootData = data }) {
  if (f.showIf && !f.showIf(data)) return null;
  const v = data[f.key];
  const id = idPrefix + f.key;
  const req = isRequired(f);
  const missing = req && (v === undefined || v === null || v === '');
  const star = req && <span className="req" title="Required"> *</span>;
  const label = f.label && <label htmlFor={id} className="lbl">{f.label}{star}</label>;
  const help = f.help && <div className="help">{f.help}</div>;

  switch (f.type) {
    case 'heading':
      return <h3 className="subhead">{f.label}</h3>;
    case 'note':
      return <p className={'note' + (f.tone ? ' ' + f.tone : '')}>{f.label}</p>;
    case 'static':
      return <div className="field">{label}<div className="static" id={id}>{f.value}</div></div>;
    case 'text':
    case 'number':
    case 'date':
      return <div className={'field ' + f.type}>{label}<input id={id} type={f.type} value={v ?? ''}
        placeholder={typeof f.placeholder === 'function' ? f.placeholder(data) : f.placeholder}
        onChange={e => set(f.key, f.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} />{help}</div>;
    case 'textarea':
      return <div className="field wide">{label}<AutoText id={id} value={v} onChange={x => set(f.key, x)} />{help}</div>;
    case 'textareaImages':
      return <div className="field wide">{label}
        <ImageTextArea id={id} value={v} images={data[`${f.key}Images`]}
          onChange={x => set(f.key, x)} onImagesChange={x => set(`${f.key}Images`, x)} />
        {help}</div>;
    case 'image':
      return <VinelandImageField id={id} value={v} onChange={x => set(f.key, x)} help={f.help} />;
    case 'derivedText': {
      const value = data.primaryDisabilityPost || data.primaryDisabilityPre || '';
      return <div className="field wide">{label}
        <input id={id} value={value.startsWith('N/A') ? '' : value} readOnly placeholder="Choose a primary disability above" />
        {help}</div>;
    }
    case 'standardPicker':
      return <StandardPicker data={data} rootData={rootData} set={set} id={id} label={label} help={help} />;
    case 'select':
      return <div className={'field' + (missing ? ' missing' : '')}>{label}<select id={id} value={v || ''} onChange={e => set(f.key, e.target.value)}>
        <option value="">Select…</option>{f.options.map(o => <option key={o}>{o}</option>)}
        {v && !f.options.includes(v) && <option value={v}>{v} (old value)</option>}</select>
        {v === 'Other' && <input id={id + 'Other'} className="other" placeholder="Please specify" value={data[f.key + 'Other'] || ''} onChange={e => set(f.key + 'Other', e.target.value)} />}
        {help}</div>;
    case 'bool':
      return <div className="field wide"><label className="check"><input type="checkbox" checked={!!v} onChange={e => set(f.key, e.target.checked)} /> {f.label}</label></div>;
    case 'yesno': case 'yesnona': case 'yesnoni':
      return <div className={'field wide yn' + (missing ? ' missing' : '')} id={id}><span className="lbl">{f.label}{star}</span>
        <Pills value={v} options={YN[f.type + (f.noN ? '_noN' : '')]} onChange={x => set(f.key, x)} />{help}</div>;
    case 'radio':
      return <div className={'field wide' + (missing ? ' missing' : '')} id={id}><span className="lbl">{f.label}{star}</span>
        <div className="radios">{f.options.map(o => (
          <label key={o.value} className="check"><input type="radio" name={id} checked={(v || '') === o.value} onChange={() => set(f.key, o.value)} /> {o.label}</label>
        ))}</div></div>;
    case 'checks': {
      const sel = new Set(v || []);
      return <div className="field wide"><span className="lbl">{f.label}</span>
        <div className={'checks cols' + (f.columns || 1)}>{f.options.map((o, i) => (
          <label key={i} className="check"><input type="checkbox" checked={sel.has(i)} onChange={e => {
            const n = new Set(sel); if (e.target.checked) n.add(i); else n.delete(i); set(f.key, [...n].sort((a, b) => a - b));
          }} /> {o}</label>))}</div></div>;
    }
    case 'prepost':
      return <div className="field wide"><table className="grid"><thead><tr><th></th><th>Prior to meeting</th><th>After meeting</th></tr></thead>
        <tbody>{f.rows.map(r => (
          <tr key={r.key}><th>{r.label}{r.optionsPre && <span className="req" title="Required"> *</span>}</th>
            {r.optionsPre ? <>
              <td><PrePostSelect id={r.key + 'Pre'} value={data[r.key + 'Pre']} options={r.optionsPre} onChange={x => set(r.key + 'Pre', x)} /></td>
              <td><PrePostSelect id={r.key + 'Post'} value={data[r.key + 'Post']} options={r.optionsPost} onChange={x => set(r.key + 'Post', x)} />
                {data[r.key + 'Pre'] && !data[r.key + 'Post'] && r.optionsPost.includes(data[r.key + 'Pre']) && <button type="button" className="mini" onClick={() => set(r.key + 'Post', data[r.key + 'Pre'])}>Same as prior</button>}</td>
            </> : <>
              <td><AutoText rows={1} value={data[r.key + 'Pre']} onChange={x => set(r.key + 'Pre', x)} /></td>
              <td><AutoText rows={1} value={data[r.key + 'Post']} onChange={x => set(r.key + 'Post', x)} />
                {data[r.key + 'Pre'] && !data[r.key + 'Post'] && <button type="button" className="mini" onClick={() => set(r.key + 'Post', data[r.key + 'Pre'])}>Same as prior</button>}</td>
            </>}
          </tr>))}</tbody></table></div>;
    case 'assessGrid': {
      const g = v || {};
      return <div className="field wide"><span className="lbl">{f.label}</span><table className="grid"><thead><tr><th>Assessment</th><th>Regular grade</th><th>Not assessed at this grade level</th></tr></thead>
        <tbody>{f.rows.map(r => (
          <tr key={r.key}><th>{r.otherKey ? <input placeholder="Other:" value={data[r.otherKey] || ''} onChange={e => set(r.otherKey, e.target.value)} /> : r.label}</th>
            {['r', 'n'].map(c => <td key={c} className="c"><input type="radio" name={id + r.key} checked={g[r.key] === c}
              onChange={() => set(f.key, { ...g, [r.key]: c })} onClick={() => g[r.key] === c && set(f.key, { ...g, [r.key]: '' })} /></td>)}
          </tr>))}</tbody></table></div>;
    }
    case 'textList': {
      const items = v ?? (f.legacyKey && data[f.legacyKey] ? [data[f.legacyKey]] : []);
      const upd = n => set(f.key, n);
      return <div className="field wide"><span className="lbl">{f.label}</span>{help}
        <div className="tlist">{items.map((x, i) => (
          <div key={i} className="titem"><span className="tnum">{i + 1}.</span>
            <AutoText rows={2} value={x} aria-label={`${f.itemLabel} ${i + 1}`} onChange={val => upd(items.map((y, j) => (j === i ? val : y)))} />
            <button type="button" className="mini danger" onClick={() => upd(items.filter((_, j) => j !== i))} aria-label={`Remove ${f.itemLabel.toLowerCase()} ${i + 1}`}>Remove</button>
          </div>))}
          <button type="button" className="add small" onClick={() => upd([...items, ''])}>+ Add {f.itemLabel.toLowerCase()}</button>
        </div></div>;
    }
    case 'repeat':
      return <Repeat f={f} items={v || []} rootData={rootData} onChange={x => set(f.key, x)} />;
    default:
      return null;
  }
}

function Repeat({ f, items, rootData, onChange }) {
  const make = () => (f.key === 'goals' ? newGoal() : {});
  const upd = (i, key, value) => onChange(items.map((it, j) => (j === i
    ? { ...it, ...(typeof key === 'object' ? key : { [key]: value }) }
    : it)));
  const move = (i, d) => { const n = [...items]; const [it] = n.splice(i, 1); n.splice(i + d, 0, it); onChange(n); };
  return (
    <div className="field wide repeat">
      <span className="lbl">{f.label}</span>
      {items.length === 0 && <p className="empty">None yet.</p>}
      {items.map((it, i) => (
        <fieldset key={i} className="card">
          <legend>{f.itemLabel} {i + 1}{it.area ? ` — ${it.area}` : it.domain ? ` — ${it.domain}` : it.sArea ? ` — ${it.sArea}` : it.serviceType ? ` — ${it.serviceType}` : ''}</legend>
          <div className="cardtools">
            <button type="button" className="mini" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button type="button" className="mini" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button type="button" className="mini" onClick={() => onChange([...items.slice(0, i + 1), structuredClone(it), ...items.slice(i + 1)])}>Duplicate</button>
            <button type="button" className="mini danger" onClick={() => { if (confirm(`Remove ${f.itemLabel.toLowerCase()} ${i + 1}?`)) onChange(items.filter((_, j) => j !== i)); }}>Remove</button>
          </div>
          <div className="fields">
            {f.fields.map(sf => <Field key={sf.key} f={sf} data={it} rootData={rootData}
              set={(k, x) => upd(i, k, x)} idPrefix={`${f.key}${i}-`} />)}
          </div>
        </fieldset>
      ))}
      <button type="button" className="add" onClick={() => onChange([...items, make()])}>+ Add {f.itemLabel.toLowerCase()}</button>
    </div>
  );
}

function StandardPicker({ data, rootData, set, id, label, help }) {
  const area = STANDARD_AREAS.find(option => option.id === data.standardArea);
  const grade = area?.grades.find(option => option.id === data.standardGrade);
  const category = area?.categories.find(option => option.id === data.standardCategory);
  const alternate = rootData.saAlt === 'y' || rootData.daAlt === 'y';
  const regularAssessment = rootData.saAlt === 'n' && rootData.daAlt === 'n';
  const type = data.standardType || (alternate ? 'eeo' : 'cas');
  const link = standardLookupUrl(type, area, grade?.id, category);

  function update(patch) {
    const hasSelection = data.standardType || data.standardArea || data.standardGrade || data.standardCategory;
    if (data.standard && !hasSelection && !data.standardLegacyAccepted
      && !confirm('Choosing a structured CDE standard will replace the existing text in this goal’s standard field. Continue?')) return;
    const selection = {
      type: patch.standardType ?? type,
      area: patch.standardArea !== undefined
        ? STANDARD_AREAS.find(option => option.id === patch.standardArea)
        : area,
      gradeLabel: patch.standardGrade !== undefined
        ? STANDARD_AREAS.find(option => option.id === (patch.standardArea ?? area?.id))
          ?.grades.find(option => option.id === patch.standardGrade)?.label
        : grade?.label,
      category: patch.standardCategory !== undefined
        ? STANDARD_AREAS.find(option => option.id === (patch.standardArea ?? area?.id))
          ?.categories.find(option => option.id === patch.standardCategory)
        : category,
      gleCode: patch.standardGLECode ?? data.standardGLECode ?? '',
      gleText: patch.standardGLEText ?? data.standardGLEText ?? '',
      evidenceCode: patch.standardEvidenceCode ?? data.standardEvidenceCode ?? '',
      evidenceText: patch.standardEvidenceText ?? data.standardEvidenceText ?? '',
    };
    const next = { ...data, ...patch, standard: standardFieldText(selection), standardLegacyAccepted: true };
    set(next);
  }

  return (
    <div className="field wide standard-picker">
      {label}
      <label htmlFor={`${id}-type`}>Type</label>
      <select id={`${id}-type`} value={type} onChange={event => update({
        standardType: event.target.value,
        standardArea: '', standardGrade: '', standardCategory: '',
        standardGLECode: '', standardGLEText: '', standardEvidenceCode: '', standardEvidenceText: '',
      })}>
        <option value="cas">Colorado Academic Standard (regular)</option>
        <option value="eeo">Extended Evidence Outcome (EEO)</option>
      </select>
      {alternate && type !== 'eeo' && <p className="standard-warning" role="status">The assessment section indicates an alternate assessment. Colorado EEOs are generally the aligned choice.</p>}
      {regularAssessment && type === 'eeo' && <p className="standard-warning" role="status">The assessment section indicates regular assessments. Confirm that an EEO is appropriate for this goal.</p>}

      <label htmlFor={`${id}-area`}>Content area</label>
      <select id={`${id}-area`} value={data.standardArea || ''} onChange={event => update({
        standardArea: event.target.value, standardGrade: '', standardCategory: '',
        standardGLECode: '', standardGLEText: '', standardEvidenceCode: '', standardEvidenceText: '',
      })}>
        <option value="">Select content area…</option>
        {STANDARD_AREAS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>

      <label htmlFor={`${id}-grade`}>Grade level</label>
      <select id={`${id}-grade`} value={data.standardGrade || ''} disabled={!area}
        onChange={event => update({ standardGrade: event.target.value, standardCategory: '', standardGLECode: '', standardGLEText: '', standardEvidenceCode: '', standardEvidenceText: '' })}>
        <option value="">Select grade level…</option>
        {area?.grades.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>

      <label htmlFor={`${id}-category`}>Standard</label>
      <select id={`${id}-category`} value={data.standardCategory || ''} disabled={!grade}
        onChange={event => update({ standardCategory: event.target.value, standardGLECode: '', standardGLEText: '', standardEvidenceCode: '', standardEvidenceText: '' })}>
        <option value="">Select standard…</option>
        {area?.categories.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>

      <p className="help">
        Use the official CDE lookup for the selected type, area, grade, and standard. Choose a GLE
        and evidence outcome there, then enter their codes and wording below.
        {' '}<a href={link} target="_blank" rel="noreferrer">Open CDE lookup</a>
        {type === 'eeo' && <> · EEOs are available for the four listed content areas. <a href="https://ed.cde.state.co.us/coextendedeo" target="_blank" rel="noreferrer">CDE EEO resources</a></>}
      </p>

      <label htmlFor={`${id}-gle-code`}>Grade Level Expectation code</label>
      <input id={`${id}-gle-code`} value={data.standardGLECode || ''}
        onChange={event => update({ standardGLECode: event.target.value })} placeholder="e.g., MA.P.CC.A" />
      <label htmlFor={`${id}-gle-text`}>Grade Level Expectation text</label>
      <AutoText id={`${id}-gle-text`} value={data.standardGLEText} onChange={value => update({ standardGLEText: value })} />

      <label htmlFor={`${id}-evidence-code`}>Evidence outcome / EEO code</label>
      <input id={`${id}-evidence-code`} value={data.standardEvidenceCode || ''}
        onChange={event => update({ standardEvidenceCode: event.target.value })} placeholder="Enter the code shown by CDE" />
      <label htmlFor={`${id}-evidence-text`}>Evidence outcome / EEO text</label>
      <AutoText id={`${id}-evidence-text`} value={data.standardEvidenceText} onChange={value => update({ standardEvidenceText: value })} />
      {help}
      <details className="standard-preview">
        <summary>Text included in the IEP document</summary>
        <pre>{data.standard || 'Selections and entered GLE/outcome text will appear here.'}</pre>
      </details>
    </div>
  );
}

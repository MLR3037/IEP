// Turns a saved IEP record into the tag values used by IEP_Template.docx and builds the .docx.
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import {
  AU_ADDRESS, AU_NUMBER, effectiveAge, showEarlyChildhoodEnvironment, showSchoolAgeEnvironment, transitionOn,
} from './schema.js';

const ON = '☒';
const OFF = '☐';
const box = v => (v ? ON : OFF);
const IMAGE_TEXT_FIELDS = [
  'enjoys', 'staffDescribe', 'academicRecordReview', 'dailyWork', 'attendance', 'structuredObs', 'unstructuredObs',
  'piCommunication', 'piDailyLiving', 'piAcademics', 'piSafety', 'piPostSecondary', 'vinelandSummary',
  'transitionAssessment', 'parentInput',
];

const imageMarker = (key, index) => `__IEP_IMAGE_${key}_${index}__`;
function textWithImages(text, images, key) {
  const markers = (Array.isArray(images) ? images : []).map((image, index) => image?.data ? `\n${imageMarker(key, index)}` : '');
  return `${text || ''}${markers.join('')}`;
}

export function fmtDate(v) {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : v;
}

const hrs = n => (n ? String(Math.round((n / 60) * 100) / 100) : '');

function elementRanges(xml, tagName) {
  const tags = /<\/?([A-Za-z_][\w:.-]*)(?:\s[^<>]*?)?\/?>/g;
  const open = [];
  const ranges = [];
  let match;
  while ((match = tags.exec(xml))) {
    if (match[1] !== tagName) continue;
    if (match[0].startsWith('</')) {
      const start = open.pop();
      if (start !== undefined) ranges.push({ start, end: tags.lastIndex });
    } else if (!match[0].endsWith('/>')) {
      open.push(match.index);
    }
  }
  return ranges.sort((a, b) => a.start - b.start || b.end - a.end);
}

function xmlText(fragment) {
  return [...fragment.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map(match => match[1]
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"))
    .join('');
}

function paragraphForText(xml, text) {
  const paragraphs = elementRanges(xml, 'w:p');
  const matches = paragraphs.filter(range => xmlText(xml.slice(range.start, range.end)).includes(text));
  return matches.find(range => xmlText(xml.slice(range.start, range.end)).trim() === text) || matches[0];
}

function smallestContaining(ranges, range) {
  return ranges.filter(candidate => candidate.start <= range.start && candidate.end >= range.end)
    .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
}

function removeRanges(xml, ranges) {
  const selected = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start || b.end - a.end)) {
    if (selected.some(parent => range.start >= parent.start && range.end <= parent.end)) continue;
    selected.push(range);
  }
  for (const range of selected.sort((a, b) => b.start - a.start)) {
    xml = xml.slice(0, range.start) + xml.slice(range.end);
  }
  return xml;
}

function removeParagraphsContaining(xml, text) {
  const ranges = elementRanges(xml, 'w:p').filter(range => xmlText(xml.slice(range.start, range.end)).includes(text));
  return removeRanges(xml, ranges);
}

function removeParagraphsWithExactText(xml, text) {
  const ranges = elementRanges(xml, 'w:p').filter(range => xmlText(xml.slice(range.start, range.end)).trim() === text);
  return removeRanges(xml, ranges);
}

function removeRowsContaining(xml, text) {
  const paragraphs = elementRanges(xml, 'w:p');
  const rows = elementRanges(xml, 'w:tr');
  const matches = paragraphs.filter(range => xmlText(xml.slice(range.start, range.end)).includes(text));
  const rowsToRemove = matches.map(paragraph => smallestContaining(rows, paragraph)).filter(Boolean);
  if (!rowsToRemove.length) throw new Error(`The IEP template is missing the ${text} row.`);
  return removeRanges(xml, rowsToRemove);
}

function removeRowsBetween(xml, startText, endText) {
  const startParagraph = paragraphForText(xml, startText);
  const endParagraph = paragraphForText(xml, endText);
  const rows = elementRanges(xml, 'w:tr');
  const startRow = startParagraph && smallestContaining(rows, startParagraph);
  const endRow = endParagraph && smallestContaining(rows, endParagraph);
  if (!startRow || !endRow || startRow.start >= endRow.start) {
    throw new Error(`The IEP template is missing the ${startText} section boundary.`);
  }
  const rowsToRemove = rows.filter(range => range.start >= startRow.start && range.end <= endRow.start);
  if (!rowsToRemove.length) throw new Error(`The IEP template has no rows in the ${startText} section.`);
  return removeRanges(xml, rowsToRemove);
}

function removePwnTableTail(xml) {
  const heading = paragraphForText(xml, 'Prior Written Notice');
  const rows = elementRanges(xml, 'w:tr');
  const tables = elementRanges(xml, 'w:tbl');
  const headingRow = heading && smallestContaining(rows, heading);
  const table = headingRow && smallestContaining(tables, headingRow);
  if (!headingRow || !table) throw new Error('The IEP template is missing the Prior Written Notice section.');
  const rowsToRemove = rows.filter(range => range.start >= headingRow.start && range.end <= table.end);
  if (!rowsToRemove.length) throw new Error('The IEP template has no Prior Written Notice rows.');
  return removeRanges(xml, rowsToRemove);
}

function replaceText(xml, oldText, newText) {
  return xml.replace(/<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/g, (element, attributes, encodedText) => {
    const text = xmlText(`<w:t>${encodedText}</w:t>`);
    if (!text.includes(oldText)) return element;
    const escaped = text.replace(oldText, newText)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<w:t${attributes}>${escaped}</w:t>`;
  });
}

function replaceParagraphText(xml, needle, text) {
  const paragraph = paragraphForText(xml, needle);
  if (!paragraph) throw new Error(`The IEP template is missing the ${needle} paragraph.`);
  const current = xml.slice(paragraph.start, paragraph.end);
  const properties = current.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0] || '';
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const replacement = `<w:p>${properties}<w:r><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
  return xml.slice(0, paragraph.start) + replacement + xml.slice(paragraph.end);
}

function replaceParagraphTag(xml, tag, replacement) {
  const paragraph = paragraphForText(xml, tag);
  if (!paragraph) throw new Error(`The IEP template is missing the ${tag} paragraph.`);
  const current = xml.slice(paragraph.start, paragraph.end);
  const replaced = current.replace(tag, replacement);
  if (replaced === current) throw new Error(`The IEP template could not update the ${tag} paragraph.`);
  return xml.slice(0, paragraph.start) + replaced + xml.slice(paragraph.end);
}

function getServiceDeliveryStatements(data) {
  const entries = Array.isArray(data.serviceDeliveryStatements) ? [...data.serviceDeliveryStatements] : [];
  if (data.mhServiceDelivery?.trim()) entries.push({ serviceType: 'Mental health', statement: data.mhServiceDelivery });
  if (data.relatedServiceStatement?.trim()) entries.push({ serviceType: 'Related services', statement: data.relatedServiceStatement });
  return entries.filter(entry => entry.serviceType?.trim()
    && (entry.statement?.trim() || (Array.isArray(entry.statementImages) && entry.statementImages.some(image => image?.data))));
}

function pruneTemplate(zip, data) {
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new Error('The IEP template is missing its document body.');
  let xml = documentFile.asText();

  if (data.lep !== 'y') xml = removeRowsContaining(xml, '{accessScores}');
  xml = removeParagraphsContaining(xml, '{attGenEd}');
  xml = removeParagraphsContaining(xml, 'General Education Teacher');
  xml = removeParagraphsContaining(xml, 'IDEA 300.321(a)(2)');
  xml = removeParagraphsWithExactText(xml, 'Academic Present Levels');
  xml = replaceText(xml, 'Academic Record Review from latest Evaluation Report:', 'Academic Present Levels:');
  xml = replaceText(xml, 'Ages 3 through 5 (age of the Dec. 1 that follows the date of the IEP)', 'Ages 3 through 5 (age on the IEP meeting date)');
  xml = replaceText(xml, 'Ages 6 to 21 (age as of the Dec. 1 that follows the date of the IEP)', 'Ages 6 to 21 (age on the IEP meeting date)');
  xml = removeRowsBetween(xml, 'General Education Preschool Services', 'Educational Environment');

  const serviceDeliveryStatements = getServiceDeliveryStatements(data);
  const hasServiceDeliveryStatements = serviceDeliveryStatements.length > 0;
  const serviceLoop = '{#serviceDeliveryStatements}{serviceType}: {serviceStatement}\n{/serviceDeliveryStatements}';
  xml = replaceParagraphText(xml, '{piInterviewer}', '{piInterviewer} interviewed {studentName}’s parent/guardian, {piParent}, on {piDate}.');
  xml = replaceText(xml, '{mhServiceDelivery}', serviceLoop);
  xml = removeParagraphsContaining(xml, '{relatedServiceStatement}');
  xml = replaceParagraphText(xml, 'Speech and Language Present', 'Service Delivery Statement Present Levels');
  xml = replaceParagraphTag(xml, '{slpLevels}', '{#presentLevelStatements}{serviceType}: {presentLevelStatement}\n{/presentLevelStatements}');
  for (const oldTag of ['{slpReportedBy}', '{otReportedBy}', '{otLevels}', '{ptReportedBy}', '{ptLevels}', '{semhLevels}']) {
    xml = removeParagraphsContaining(xml, oldTag);
  }
  for (const heading of ['Occupational Therapy Present Levels', 'Physical Therapy Present', 'Social Emotional and Mental Health Present Levels']) {
    xml = removeParagraphsContaining(xml, heading);
  }
  if (!hasServiceDeliveryStatements) {
    xml = removeParagraphsContaining(xml, '{#presentLevelStatements}');
    xml = removeParagraphsContaining(xml, 'Service Delivery Statement Present Levels');
  }

  if (!showEarlyChildhoodEnvironment(data)) {
    xml = removeRowsBetween(xml, 'Ages 3 through 5', 'Ages 6 to 21');
  }
  if (!showSchoolAgeEnvironment(data)) {
    xml = removeRowsBetween(xml, 'Ages 6 to 21', 'Prior Written Notice');
  }

  if (!transitionOn(data)) {
    xml = removeRowsBetween(xml, 'Describe the age-appropriate transition assessment process', 'Student Needs and Impact of Disability');
    xml = removeParagraphsContaining(xml, 'For students of transition age');
    xml = removeRowsBetween(xml, 'Measurable Post-School Goals', 'Consideration of Special Factors');
    xml = removeRowsBetween(xml, 'Postsecondary Transition Plan', 'Annual Goals (Objectives, if required)');
    xml = removeRowsContaining(xml, 'For transitions IEPs, annual goals MUST link directly to postsecondary goals.');
  }

  xml = removePwnTableTail(xml);
  zip.file('word/document.xml', xml);
  return serviceDeliveryStatements;
}

export function buildTemplateData(d) {
  const t = {};
  const s = k => (d[k] ?? '').toString();
  const yesno = (k, tag = k) => {
    t[`c_${tag}_y`] = box(d[k] === 'y');
    t[`c_${tag}_n`] = box(d[k] === 'n');
    t[`c_${tag}_na`] = box(d[k] === 'na');
    t[`c_${tag}_ni`] = box(d[k] === 'ni');
  };

  // plain text / textarea / dates
  const dateKeys = ['dob', 'meetingDate', 'amendDate', 'consentServicesDate', 'nextEligDate', 'initialEvalDate',
    'nextReviewDate', 'initialEligDate', 'consentEvalDate', 'psSignDate', 'piDate', 'cmDate'];
  for (const [k, v] of Object.entries(d)) if (typeof v === 'string' || typeof v === 'number') t[k] = String(v);
  for (const k of dateKeys) t[k] = fmtDate(d[k]);
  t.attGenEd = '';

  for (const k of ['homeLanguage', 'studentLanguage']) if (d[k] === 'Other') t[k] = s(k + 'Other') || 'Other';
  for (const k of ['primaryDisabilityPre', 'primaryDisabilityPost', 'secondaryDisabilityPre', 'secondaryDisabilityPost']) {
    if (t[k]) t[k] = t[k].replace(' (ages 3–8)', '');
  }
  const primaryDisability = s('primaryDisabilityPost') || s('primaryDisabilityPre');
  t.disabilityType = primaryDisability.startsWith('N/A') ? '' : primaryDisability.replace(' (ages 3–8)', '');
  if (d.g2SameAddress) t.g2Address = s('g1Address');
  if (d.g2SamePhone) t.g2Phone = s('g1Phone');
  t.studentName = s('studentName') || s('legalName').split(/\s+/)[0] || '';
  t.age = effectiveAge(d)?.toString() ?? '';
  t.auAddress = AU_ADDRESS;
  t.auNumber = s('auNumber') || AU_NUMBER;
  t.pronoun = d.pronoun || 'their';

  // meeting type
  t.c_elig_initial = box(d.eligType === 'initial');
  t.c_elig_reeval = box(d.eligType === 'reeval');
  for (const v of ['initial', 'review', 'amend', 'na', 'other']) t[`c_iep_${v}`] = box(d.iepType === v);

  // yes / no style questions
  for (const k of ['lep', 'interp', 'esp', 'ps', 'bip', 'vis', 'hoh', 'db', 'comm', 'at', 'transp', 'hcp',
    'rights', 'esyq1', 'esyq2', 'esyq3', 'daAlt', 'saAlt', 'saInformed', 'pl1', 'pl2', 'pl3']) yesno(k);
  if (!transitionOn(d)) { t.c_rights_y = OFF; t.c_rights_n = OFF; t.c_rights_na = ON; }
  t.c_esyElig_y = box(d.esyElig === 'y');
  t.c_esyElig_n = box(d.esyElig === 'n');
  t.c_esyElig_tbd = box(d.esyElig === 'tbd');

  // accommodation / modification checklists
  const acc = new Set(d.accommodations || []);
  for (let i = 0; i < 29; i++) t[`c_acc_${i}`] = box(acc.has(i));
  const mod = new Set(d.modifications || []);
  for (let i = 0; i < 3; i++) t[`c_mod_${i}`] = box(mod.has(i));

  // assessment grids
  for (const [prefix, rows] of [['da', ['ela', 'math', 'sci', 'ss', 'o1', 'o2']], ['sa', ['ela', 'math', 'sci', 'ss', 'act', 'o']]]) {
    const g = d[prefix] || {};
    for (const r of rows) {
      t[`c_${prefix}_${r}_r`] = box(g[r] === 'r');
      t[`c_${prefix}_${r}_n`] = box(g[r] === 'n');
    }
  }

  // placement / environment
  for (let i = 0; i < 9; i++) t[`c_ec_${i}`] = box(d.envEC === String(i));
  for (let i = 0; i < 7; i++) t[`c_env_${i}`] = box(d.envSchool === String(i));

  // repeating sections
  t.others = (d.others || []).map(o => ({ oName: o.oName || '', oTitle: o.oTitle || '', oAgency: o.oAgency || '' }));
  if (!t.others.length) t.others = [{ oName: '', oTitle: '', oAgency: '' }];

  t.prevGoals = (d.prevGoals || []).map((g, index) => ({
    domain: g.domain || '',
    prevGoal: textWithImages(g.prevGoal, g.prevGoalImages, `prevGoals_${index}_prevGoal`),
    progress: textWithImages(g.progress, g.progressImages, `prevGoals_${index}_progress`),
    recommendation: textWithImages(g.recommendation, g.recommendationImages, `prevGoals_${index}_recommendation`),
  }));

  const serviceDeliveryStatements = getServiceDeliveryStatements(d);
  t.serviceDeliveryStatements = serviceDeliveryStatements.map((entry, index) => ({
    serviceType: entry.serviceType.trim(),
    serviceStatement: textWithImages(entry.statement, entry.statementImages, `serviceDeliveryStatements_${index}_service`),
  }));
  t.presentLevelStatements = serviceDeliveryStatements.map((entry, index) => ({
    serviceType: entry.serviceType.trim(),
    presentLevelStatement: textWithImages(entry.statement, entry.statementImages, `serviceDeliveryStatements_${index}_present`),
  }));

  t.goals = (d.goals || []).map((g, i) => {
    const m = new Set(g.methods || []);
    const objs = (g.objectives ?? (g.objective ? [g.objective] : [])).map(x => (x || '').trim()).filter(Boolean);
    const o = {
      goalNum: String(i + 1), c_esy: box(g.esy), area: g.area || '', goal: g.goal || '',
      objective: objs.length > 1 ? objs.map((x, k) => `${k + 1}. ${x}`).join('\n') : (objs[0] || ''),
      unit: g.unit || '', standard: g.standard || '', baseline: g.baseline || '', methodOther: g.methodOther || '',
      progressReport: g.progressReport || '',
    };
    for (let k = 0; k < 4; k++) {
      o[`c_m${k + 1}`] = box(m.has(k));
      // progress-report rows stay blank in the document; progress data is reported separately
      o[`rd${k + 1}`] = ''; o[`p${k + 1}`] = ''; o[`s${k + 1}`] = '';
    }
    return o;
  });
  if (!t.goals.length) t.goals = [buildEmptyGoal()];
  if (d.esyElig === 'y' || d.esyElig === 'tbd') {
    const selectedGoals = (d.goals || []).filter(goal => goal.esy)
      .map(goal => [goal.area, goal.goal].filter(Boolean).join(': '))
      .filter(Boolean);
    const supplementalGoals = (d.esyGoals || '').trim();
    t.esyGoals = [...selectedGoals, ...(supplementalGoals && !selectedGoals.includes(supplementalGoals) ? [supplementalGoals] : [])].join('\n');
  } else {
    t.esyGoals = '';
  }

  const totals = { DD: 0, DW: 0, DM: 0, ID: 0, IW: 0, IM: 0 };
  t.services = (d.services || []).map(sv => {
    const col = (sv.kind || 'D') + (sv.per || 'W');
    const o = { sArea: sv.sArea || '', sProvider: sv.sProvider || '', sStart: fmtDate(sv.sStart), sEnd: fmtDate(sv.sEnd),
      sDD: '', sDW: '', sDM: '', sID: '', sIW: '', sIM: '' };
    if (sv.minutes) {
      o['s' + col] = `${sv.minutes} min`;
      totals[col] += Number(sv.minutes) || 0;
    }
    return o;
  });
  if (!t.services.length) t.services = [{ sArea: '', sProvider: '', sStart: '', sEnd: '', sDD: '', sDW: '', sDM: '', sID: '', sIW: '', sIM: '' }];
  for (const k of Object.keys(totals)) t['tot' + k] = hrs(totals[k]);
  for (const key of IMAGE_TEXT_FIELDS) t[key] = textWithImages(t[key], d[`${key}Images`], key);

  return t;
}

function findVinelandDrawing(zip) {
  const documentXml = zip.file('word/document.xml')?.asText();
  if (!documentXml) throw new Error('The IEP template is missing its document body.');
  const paragraphs = [...documentXml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)];
  const summaryIndex = paragraphs.findIndex(match => match[0].includes('{vinelandSummary}'));
  const imageParagraph = paragraphs.slice(summaryIndex + 1).find(match => match[0].includes('<w:drawing>'));
  const drawing = imageParagraph?.[0].match(/<w:drawing>[\s\S]*?<\/w:drawing>/)?.[0];
  if (summaryIndex < 0 || !drawing) throw new Error('The IEP template is missing the Vineland image location.');
  return drawing;
}

function embedVinelandImage(zip, image) {
  const documentFile = zip.file('word/document.xml');
  const relationshipsFile = zip.file('word/_rels/document.xml.rels');
  if (!documentFile || !relationshipsFile) throw new Error('The IEP template is missing its document image location.');
  let documentXml = documentFile.asText();
  const paragraphs = [...documentXml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)];
  const summaryIndex = paragraphs.findIndex(match => match[0].includes('{vinelandSummary}'));
  const imageParagraph = paragraphs.slice(summaryIndex + 1).find(match => match[0].includes('<w:drawing>'));
  if (summaryIndex < 0 || !imageParagraph) throw new Error('The IEP template is missing the Vineland image location.');
  const relationId = imageParagraph[0].match(/\br:embed="([^"]+)"/)?.[1];
  if (!relationId) throw new Error('The Vineland image location in the IEP template is invalid.');

  let relationshipsXml = relationshipsFile.asText();
  const escapedId = relationId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const relationPattern = new RegExp(`<Relationship\\b(?=[^>]*\\bId="${escapedId}")[^>]*\\/>`);
  const relation = relationshipsXml.match(relationPattern)?.[0];
  const target = relation?.match(/\bTarget="([^"]+)"/)?.[1];
  if (!relation || !target) throw new Error('The Vineland image relationship in the IEP template is invalid.');
  const paragraphPattern = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
  const paragraphsToReplace = [imageParagraph[0]];

  if (!image?.data) {
    documentXml = documentXml.replace(paragraphPattern, paragraph => paragraph === paragraphsToReplace[0] ? '' : paragraph);
    zip.file('word/document.xml', documentXml);
    return;
  }

  if (!['image/jpeg', 'image/png'].includes(image.mimeType) || !Number.isFinite(image.width) || !Number.isFinite(image.height)
    || image.width <= 0 || image.height <= 0) throw new Error('The saved Vineland image is invalid. Upload or paste it again.');
  const encoded = image.data.match(/^data:image\/(?:jpeg|png);base64,([A-Za-z0-9+/=]+)$/)?.[1];
  if (!encoded) throw new Error('The saved Vineland image could not be read. Upload or paste it again.');
  const extension = image.mimeType === 'image/png' ? 'png' : 'jpg';
  const newTarget = `media/vineland.${extension}`;
  const cxMax = 6.25 * 914400;
  const cyMax = 6 * 914400;
  const pxToEmu = 9525;
  const scale = Math.min(1, cxMax / (image.width * pxToEmu), cyMax / (image.height * pxToEmu));
  const cx = Math.round(image.width * pxToEmu * scale);
  const cy = Math.round(image.height * pxToEmu * scale);
  const updatedParagraph = imageParagraph[0]
    .replace(/<wp:extent\b[^>]*\/>/, `<wp:extent cx="${cx}" cy="${cy}"/>`)
    .replace(/<a:ext\b[^>]*\/>/, `<a:ext cx="${cx}" cy="${cy}"/>`)
    .replace(/\bname="[^"]*"/, 'name="Vineland-III score grid"')
    .replace(/\bdescr="[^"]*"/, 'descr="Vineland-III score grid"');
  documentXml = documentXml.replace(paragraphPattern, paragraph => paragraph === imageParagraph[0] ? updatedParagraph : paragraph);
  relationshipsXml = relationshipsXml.replace(relation, relation.replace(/\bTarget="[^"]+"/, `Target="${newTarget}"`));
  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', relationshipsXml);
  zip.file(`word/${newTarget}`, Uint8Array.from(atob(encoded), character => character.charCodeAt(0)));

  const contentTypesFile = zip.file('[Content_Types].xml');
  if (!contentTypesFile) throw new Error('The IEP template is missing image content types.');
  let contentTypes = contentTypesFile.asText();
  const contentType = image.mimeType;
  const typeExists = new RegExp(`<Default\\b(?=[^>]*\\bExtension="${extension}")[^>]*/>`).test(contentTypes);
  if (typeExists) {
    contentTypes = contentTypes.replace(
      new RegExp(`<Default\\b(?=[^>]*\\bExtension="${extension}")[^>]*/>`),
      `<Default Extension="${extension}" ContentType="${contentType}"/>`,
    );
  } else {
    contentTypes = contentTypes.replace('</Types>', `<Default Extension="${extension}" ContentType="${contentType}"/></Types>`);
  }
  zip.file('[Content_Types].xml', contentTypes);
}

function addInlineTextImages(zip, data, drawingTemplate) {
  const images = new Map();
  for (const key of IMAGE_TEXT_FIELDS) {
    if (key === 'transitionAssessment' && !transitionOn(data)) continue;
    (Array.isArray(data[`${key}Images`]) ? data[`${key}Images`] : [])
      .forEach((image, index) => image?.data && images.set(imageMarker(key, index), image));
  }
  (Array.isArray(data.prevGoals) ? data.prevGoals : []).forEach((goal, index) => {
    for (const key of ['prevGoal', 'progress', 'recommendation']) {
      (Array.isArray(goal[`${key}Images`]) ? goal[`${key}Images`] : [])
        .forEach((image, imageIndex) => image?.data
          && images.set(imageMarker(`prevGoals_${index}_${key}`, imageIndex), image));
    }
  });
  (Array.isArray(data.serviceDeliveryStatements) ? data.serviceDeliveryStatements : []).forEach((entry, index) => {
    (Array.isArray(entry.statementImages) ? entry.statementImages : [])
      .forEach((image, imageIndex) => {
        if (!image?.data) return;
        images.set(imageMarker(`serviceDeliveryStatements_${index}_service`, imageIndex), image);
        images.set(imageMarker(`serviceDeliveryStatements_${index}_present`, imageIndex), image);
      });
  });
  if (!images.size) return;

  const documentFile = zip.file('word/document.xml');
  const relationshipsFile = zip.file('word/_rels/document.xml.rels');
  const contentTypesFile = zip.file('[Content_Types].xml');
  if (!documentFile || !relationshipsFile || !contentTypesFile) throw new Error('The IEP template is missing image support.');
  let documentXml = documentFile.asText();
  let relationshipsXml = relationshipsFile.asText();
  let contentTypes = contentTypesFile.asText();
  let nextRelationshipId = Math.max(0, ...[...relationshipsXml.matchAll(/\bId="rId(\d+)"/g)].map(match => Number(match[1]))) + 1;
  let nextDrawingId = Math.max(0, ...[...documentXml.matchAll(/<(?:wp:docPr|pic:cNvPr)\b[^>]*\bid="(\d+)"/g)].map(match => Number(match[1]))) + 1;
  let imageNumber = 0;

  for (const [marker, image] of images) {
    if (!['image/jpeg', 'image/png'].includes(image.mimeType) || !Number.isFinite(image.width) || !Number.isFinite(image.height)
      || image.width <= 0 || image.height <= 0) throw new Error('A pasted present-level image is invalid. Upload or paste it again.');
    const encoded = image.data.match(/^data:image\/(?:jpeg|png);base64,([A-Za-z0-9+/=]+)$/)?.[1];
    if (!encoded) throw new Error('A pasted present-level image could not be read. Upload or paste it again.');
    const tokenPosition = documentXml.indexOf(marker);
    if (tokenPosition < 0) throw new Error('A pasted present-level image could not be placed in the Word document.');
    const runStart = Math.max(documentXml.lastIndexOf('<w:r>', tokenPosition), documentXml.lastIndexOf('<w:r ', tokenPosition));
    const runEnd = documentXml.indexOf('</w:r>', tokenPosition);
    const textStart = documentXml.lastIndexOf('<w:t', tokenPosition);
    const textOpenEnd = documentXml.indexOf('>', textStart);
    const textEnd = documentXml.indexOf('</w:t>', tokenPosition);
    if (runStart < 0 || runEnd < 0 || textStart < runStart || textStart > tokenPosition || textOpenEnd < 0 || textEnd > runEnd) {
      throw new Error('A pasted present-level image could not be placed in the Word document.');
    }
    const textOpenTag = documentXml.slice(textStart, textOpenEnd + 1);
    const textContent = documentXml.slice(textOpenEnd + 1, textEnd);
    const markerIndex = textContent.indexOf(marker);
    if (markerIndex < 0) throw new Error('A pasted present-level image could not be placed in the Word document.');

    const relationId = `rId${nextRelationshipId++}`;
    const extension = image.mimeType === 'image/png' ? 'png' : 'jpg';
    const target = `media/iep-image-${imageNumber++}.${extension}`;
    const pxToEmu = 9525;
    const scale = Math.min(1, (6.25 * 914400) / (image.width * pxToEmu), (6 * 914400) / (image.height * pxToEmu));
    const cx = Math.round(image.width * pxToEmu * scale);
    const cy = Math.round(image.height * pxToEmu * scale);
    const escapedTemplateId = drawingTemplate.match(/\br:embed="([^"]+)"/)?.[1];
    if (!escapedTemplateId) throw new Error('The Vineland image location in the IEP template is invalid.');
    const escapedRelationship = escapedTemplateId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const drawing = drawingTemplate
      .replace(new RegExp(`r:embed="${escapedRelationship}"`), `r:embed="${relationId}"`)
      .replace(/(<wp:extent\b[^>]*\bcx=")\d+("\s+cy=")\d+("[^>]*\/>)/, (match, start, middle, end) => `${start}${cx}${middle}${cy}${end}`)
      .replace(/(<a:ext\b[^>]*\bcx=")\d+("\s+cy=")\d+("[^>]*\/>)/, (match, start, middle, end) => `${start}${cx}${middle}${cy}${end}`)
      .replace(/(<wp:docPr\b[^>]*\bid=")\d+(")/, (match, start, end) => `${start}${nextDrawingId++}${end}`)
      .replace(/(<pic:cNvPr\b[^>]*\bid=")\d+(")/, (match, start, end) => `${start}${nextDrawingId++}${end}`)
      .replace(/\bname="[^"]*"/g, 'name="Present levels image"')
      .replace(/\bdescr="[^"]*"/g, 'descr="Present levels image"');
    const before = textContent.slice(0, markerIndex);
    const after = textContent.slice(markerIndex + marker.length);
    const replacement = `${textOpenTag}${before}</w:t>${drawing}<w:t xml:space="preserve">${after}</w:t>`;
    documentXml = documentXml.slice(0, textStart) + replacement + documentXml.slice(textEnd + 6);
    relationshipsXml = relationshipsXml.replace('</Relationships>',
      `<Relationship Id="${relationId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/></Relationships>`);
    zip.file(`word/${target}`, Uint8Array.from(atob(encoded), character => character.charCodeAt(0)));

    const contentType = image.mimeType;
    const extensionPattern = new RegExp(`<Default\\b(?=[^>]*\\bExtension="${extension}")[^>]*/>`);
    const existing = contentTypes.match(extensionPattern)?.[0];
    contentTypes = existing
      ? contentTypes.replace(existing, `<Default Extension="${extension}" ContentType="${contentType}"/>`)
      : contentTypes.replace('</Types>', `<Default Extension="${extension}" ContentType="${contentType}"/></Types>`);
  }

  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', relationshipsXml);
  zip.file('[Content_Types].xml', contentTypes);
}

function buildEmptyGoal() {
  const o = { goalNum: '1', c_esy: OFF };
  for (let k = 1; k <= 4; k++) Object.assign(o, { [`c_m${k}`]: OFF, [`rd${k}`]: '', [`p${k}`]: '', [`s${k}`]: '' });
  return o;
}

export function renderDocx(templateArrayBuffer, data) {
  const zip = new PizZip(templateArrayBuffer);
  const drawingTemplate = findVinelandDrawing(zip);
  const serviceDeliveryStatements = pruneTemplate(zip, data);
  embedVinelandImage(zip, data.vinelandImage);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });
  doc.render(buildTemplateData(data));
  const result = doc.getZip();
  addInlineTextImages(result, { ...data, serviceDeliveryStatements }, drawingTemplate);
  return result.generate({
    type: typeof window === 'undefined' ? 'nodebuffer' : 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}

export function fileNameFor(d) {
  const name = (d.legalName || 'Student').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_');
  return `IEP_${name}_${d.meetingDate || 'draft'}.docx`;
}

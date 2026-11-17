import assert from 'node:assert/strict';
import fs from 'fs';
import PizZip from 'pizzip';
import { buildTemplateData, renderDocx } from '../src/generate.js';
import { missingRequired } from '../src/schema.js';
const long = 'Jordan benefits from visual supports and frequent movement breaks throughout the day. '.repeat(6);
const d = {
  legalName: 'Jordan Alexander Sample', studentName: 'Jordan', pronoun: 'their', dob: '2012-03-14', meetingDate: '2026-11-11',
  sasid: '1234567890', studentLocalId: 'EV-0042', grade: '8th', gender: 'Male', race: 'White', ethnicity: 'Not Hispanic',
  auAddress: 'Arvada, CO', auNumber: '00000', eligType: '', iepType: 'review', consentServicesDate: '2020-09-01',
  nextReviewDate: '2027-11-10', nextEligDate: '2028-10-01', residenceDistrict: { }, residenceDistrictPre: 'Jeffco Public Schools', residenceDistrictPost: 'Jeffco Public Schools',
  primaryDisabilityPre: 'Autism Spectrum Disorder', primaryDisabilityPost: 'Autism Spectrum Disorder', secondaryDisabilityPre: 'None', secondaryDisabilityPost: 'Speech or Language Impairment',
  homeLanguage: 'Other', homeLanguageOther: 'Tagalog', studentLanguage: 'English', lep: 'n', interp: 'n', esp: 'n',
  g1Name: 'Pat Sample', g1Email: 'pat@example.com', g1Phone: '303-555-0100', g1Address: '123 Main St\nArvada, CO 80002',
  ps: 'y', attStudent: 'Jordan Sample', attParent1: 'Pat Sample', attSped: 'Maddie Reid', attGenEd: 'A. Teacher', attSpedTeacher: 'B. Teacher',
  others: [{ oName: 'C. Clinician', oTitle: 'BCBA', oAgency: 'Evoke' }, { oName: 'D. Therapist', oTitle: 'LCSW', oAgency: 'Evoke' }],
  attendingSince: 'August 2023', enjoys: 'building with LEGO and music class', staffDescribe: 'curious and kind',
  academicReportedBy: 'B. Teacher', academicRecordReview: long, dailyWork: 'Line one\nLine two\nLine three', attendance: '94%',
  prevGoals: [{ domain: 'Reading', prevGoal: 'Read 20 CVC words', progress: 'Met', recommendation: 'Continue' },
              { domain: 'Math', prevGoal: 'Count to 50', progress: 'Progressing', recommendation: 'Revise' }],
  piInterviewer: 'B. Teacher', piParent: 'Pat Sample', piDate: '2026-10-20', piCommunication: 'Uses 3–4 word phrases.', piSafety: 'Needs supervision near roads.',
  disabilityType: 'autism', parentInput: long, postEdu: 'After high school, Jordan will attend a vocational program.',
  bip: 'y', bipText: 'See attached BIP.', at: 'y', atText: 'Tablet with AAC app.',
  goals: [
    { esy: true, area: 'Reading', goal: long, objectives: ['Jordan will decode CVC words with short a with 80% accuracy.', 'Jordan will decode CVC words with mixed vowels with 80% accuracy.', 'Jordan will read a decodable passage with 90% accuracy.'], unit: 'percent accuracy', baseline: '40%', methods: [0, 3], methodOther: 'Data sheets', progressReport: 'Quarterly reports', reports: [{ date: '2027-01-15', progress: '3', data: '55%' }, {}, {}, {}] },
    { area: 'Social', goal: 'Initiate greetings with peers in 4 of 5 opportunities.', unit: 'opportunities', baseline: '1/5', methods: [1], reports: [{}, {}, {}, {}] },
  ],
  accommodations: [0, 2, 15, 16], modifications: [0], esyq1: 'n', esyq2: 'n', esyq3: 'y', esyElig: 'y', esyGoals: 'Goal 1',
  da: { ela: 'n', math: 'n' }, sa: { ela: 'r' }, daAlt: 'na', daAltJustification: 'The student does not take district assessments at this time due to separate school placement.',
  services: [
    { sArea: 'Specialized instruction', sProvider: 'Special education teacher', sStart: '2026-11-11', sEnd: '2027-11-10', kind: 'D', per: 'W', minutes: 1500 },
    { sArea: 'Mental health', sProvider: 'LCSW', sStart: '2026-11-11', sEnd: '2027-11-10', kind: 'D', per: 'W', minutes: 60 },
    { sArea: 'Case management', sProvider: 'Special education teacher', kind: 'I', per: 'M', minutes: 30 },
  ],
  pl1: 'y', pl1Disc: 'Advantages: small ratio. Disadvantages: fewer gen-ed peers.', pl2: 'n', envSchool: '3', cmName: 'B. Teacher', cmTitle: 'Special Education Teacher', copyProvided: true,
};
const tpl = fs.readFileSync('src/assets/IEP_Template.docx');
function renderText(data) {
  const zip = new PizZip(renderDocx(tpl, data));
  const xml = zip.file('word/document.xml').asText();
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(match => match[1]).join(' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

const sampleDocument = renderText(d);
fs.writeFileSync('test/out.docx', renderDocx(tpl, d));
fs.writeFileSync('test/empty.docx', renderDocx(tpl, {}));
assert.doesNotMatch(sampleDocument, /ACCESS Scores|Alternate ACCESS Scores/);
assert.doesNotMatch(sampleDocument, /General Education Teacher|Prior Written Notice|General Education Preschool Services|Case Manager:/);
assert.doesNotMatch(sampleDocument, /Academic Record Review from latest Evaluation Report|Postsecondary Transition Plan|Measurable Post-School Goals/);
assert.doesNotMatch(sampleDocument, /strengths and areas of need in communication|Speech and Language Present Levels|Occupational Therapy Present Levels|Physical Therapy Present Levels|Social Emotional and Mental Health Present Levels|Service Delivery Statement Present Levels/);
assert.match(sampleDocument, /interviewed Jordan’s parent\/guardian, Pat Sample, on 10\/20\/2026/);
assert.equal((sampleDocument.match(/Academic Present Levels/g) || []).length, 1);
assert.match(sampleDocument, /Student Needs and Impact of Disability/);
assert.match(sampleDocument, /placement option/);
assert.match(sampleDocument, /Ages 6 to 21/);
assert.match(sampleDocument, /age on the IEP meeting date/);
assert.doesNotMatch(sampleDocument, /Ages 3 through 5/);
assert.match(sampleDocument, /Reading: Jordan benefits from visual supports/);
assert.equal(buildTemplateData({ ...d, esyElig: 'n' }).esyGoals, '');
assert.deepEqual(
  missingRequired({ lep: 'n' }).filter(field => field.key === 'accessScores' || field.key === 'altAccessScores'),
  [],
);
assert.deepEqual(
  missingRequired({ lep: 'y' }).filter(field => field.key === 'accessScores' || field.key === 'altAccessScores').map(field => field.key).sort(),
  ['accessScores', 'altAccessScores'],
);

const ellDocument = renderText({ ...d, lep: 'y', accessScores: 'ACCESS sample', altAccessScores: 'Alternate ACCESS sample' });
assert.match(ellDocument, /ACCESS Scores:\s+ACCESS sample/);
assert.match(ellDocument, /Alternate ACCESS Scores:\s+Alternate ACCESS sample/);

const earlyChildhoodDocument = renderText({ ...d, age: '4' });
assert.match(earlyChildhoodDocument, /Ages 3 through 5/);
assert.doesNotMatch(earlyChildhoodDocument, /Ages 6 to 21/);

const transitionAgeDocument = renderText({ ...d, age: '16', transitionPlanned: 'y' });
assert.match(transitionAgeDocument, /Postsecondary Transition Plan/);
assert.match(transitionAgeDocument, /Measurable Post-School Goals/);

const unknownAgeDocument = renderText({ ...d, age: '', dob: '', meetingDate: '' });
assert.match(unknownAgeDocument, /Ages 3 through 5/);
assert.match(unknownAgeDocument, /Ages 6 to 21/);
assert.match(buildTemplateData({ ...d, esyElig: 'tbd' }).esyGoals, /Reading: Jordan benefits from visual supports/);
assert.doesNotThrow(() => renderText({ ...d, transitionAssessmentImages: [{ data: 'not-an-image' }] }));

const serviceStatement = {
  serviceType: 'Speech-language',
  statement: 'Jordan communicates with gestures and a speech-generating device.',
  statementImages: [{ data: 'data:image/jpeg;base64,/9j/2Q==', mimeType: 'image/jpeg', width: 1, height: 1 }],
};
const withServiceStatement = renderDocx(tpl, { ...d, serviceDeliveryStatements: [serviceStatement] });
const serviceStatementXml = new PizZip(withServiceStatement).file('word/document.xml').asText();
assert.equal((serviceStatementXml.match(/Jordan communicates with gestures/g) || []).length, 2);
assert.equal((serviceStatementXml.match(/<w:drawing>/g) || []).length, 2);
assert.match(serviceStatementXml, /Service Delivery Statement Present Levels/);

const noServiceStatements = renderText({ ...d, serviceDeliveryStatements: [] });
assert.doesNotMatch(noServiceStatements, /Service Delivery Statement Present Levels/);
console.log('ok');

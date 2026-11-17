// IEP form definition. Each field's `key` is what gets stored in the database.
// The mapping from these keys to the tags in IEP_Template.docx lives in generate.js.
//
// Field types:
//   text, textarea, textareaImages, image, derivedText, date, number, select (options), standardPicker, bool (single checkbox)
//   yesno / yesnona / yesnoni  -> stored "y" | "n" | "na" | "ni"
//   radio (options: [{value,label}])
//   checks (options: [label,...])           -> stored as array of option indexes
//   prepost (rows: [{key,label}])           -> stored as {keyPre, keyPost}
//   assessGrid (rows: [{key,label,otherKey?}]) -> stored "r" (regular) | "n" (not assessed) per row
//   repeat (fields: [...])                  -> stored as array of objects

export const PRONOUNS = ['his', 'her', 'their'];

export const ACCOMMODATIONS = [
  '1:1 Instruction', 'Small Group Instruction', 'Frequent breaks', 'Frequent checks for understanding',
  'Extended time to complete assignments or tasks', 'Access to sensory tools (seating, fidgets, etc.)',
  'Calculator', '100’s Chart', 'Multiplication chart', 'First, then language',
  'Read aloud text (human or computer)', 'Text to speech', 'Speech to text', 'Manipulatives',
  'Graphic organizers', 'Visual supports', 'Visual schedule', 'Token board to complete tasks',
  'Repeated instructions', 'Access to choices within academic work', 'Access to motor breaks',
  'Clear, concise directions', 'Timer or visual timer', 'Sentence stems', 'Highlighted text',
  'Access to ability level texts', 'Access to headphones or quiet space', 'AAC Device (high tech)',
  'Communication Board (low tech)',
];

export const MODIFICATIONS = [
  'Modified Standards: Extended Evidence Outcomes',
  'Shortened assignments/projects/assessments',
  'Modified grading scale (include scale or rubric)',
];

export const EVAL_METHODS = ['Monitor and Chart Progress', 'Focused Assessments', 'Portfolio Collection', 'Other'];

export const EC_ENVIRONMENTS = [
  'Regular EC program ≥10 hrs/week, majority of services in the regular EC program',
  'Regular EC program ≥10 hrs/week, majority of services in some other location',
  'Regular EC program <10 hrs/week, majority of services in the regular EC program',
  'Regular EC program <10 hrs/week, majority of services in some other location',
  'Separate Class', 'Separate School', 'Residential Facility', 'Home', 'Service Provider Location',
];
export const SCHOOL_ENVIRONMENTS = [
  'General education class at least 80% of the time', 'General education class 40% to 79% of the time',
  'General education class less than 40% of the time', 'Separate School', 'Residential Facility',
  'Homebound/Hospital', 'Correctional facilities (including short-term detention)',
];

const yn = (key, label, extra = {}) => ({ type: 'yesno', key, label, ...extra });

export const AU_ADDRESS = 'Evoke Behavioral Health, 7750 N. Harlan St., Arvada, CO 80003';
export const AU_NUMBER = '720-355-1081';

// Federal race / ethnicity reporting categories (as used in Colorado student data)
export const RACES = ['American Indian or Alaska Native', 'Asian', 'Black or African American',
  'Native Hawaiian or Other Pacific Islander', 'White', 'Two or More Races'];
export const ETHNICITIES = ['Hispanic or Latino', 'Not Hispanic or Latino'];

// Most common home languages in Colorado schools, plus Other (type it in)
export const LANGUAGES = ['English', 'Spanish', 'American Sign Language', 'Amharic', 'Arabic', 'Chinese (Mandarin)',
  'Chinese (Cantonese)', 'Dari', 'French', 'Korean', 'Nepali', 'Pashto', 'Russian', 'Somali', 'Swahili', 'Tigrinya',
  'Ukrainian', 'Vietnamese', 'Other'];

// Colorado ECEA disability categories (CDE). Developmental Delay applies to ages 3–8 only.
export const DISABILITIES = ['Autism Spectrum Disorder', 'Deaf-Blindness', 'Developmental Delay (ages 3–8)',
  'Hearing Impairment, Including Deafness', 'Intellectual Disability', 'Multiple Disabilities', 'Orthopedic Impairment',
  'Other Health Impairment', 'Serious Emotional Disability', 'Specific Learning Disability',
  'Speech or Language Impairment', 'Traumatic Brain Injury', 'Visual Impairment, Including Blindness'];

export function ageFrom(dob, on) {
  if (!dob) return null;
  const b = new Date(dob + 'T00:00:00');
  const d = on ? new Date(on + 'T00:00:00') : new Date();
  let a = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) a--;
  return isNaN(a) ? null : a;
}
// Age typed in the Age box wins; otherwise calculated from DOB on the meeting date.
export function effectiveAge(d) {
  const typed = parseInt(d.age, 10);
  return Number.isFinite(typed) ? typed : ageFrom(d.dob, d.meetingDate);
}
export const isTransitionAge = d => (effectiveAge(d) ?? 0) > 14;
export const showEarlyChildhoodEnvironment = d => {
  const age = effectiveAge(d);
  return age === null || (age >= 3 && age <= 5);
};
export const showSchoolAgeEnvironment = d => {
  const age = effectiveAge(d);
  return age === null || (age >= 6 && age <= 21);
};
// Transition sections are shown when the student is over 14 and the team will complete
// the transition assessment, or when age is unknown (no DOB yet).
export function transitionOn(d) {
  const a = effectiveAge(d);
  if (a === null) return true;
  return a > 14 && d.transitionPlanned === 'y';
}
const tOn = transitionOn;

export const SECTIONS = [
  {
    id: 'meeting', title: 'Student & Meeting',
    fields: [
      { type: 'text', key: 'legalName', label: 'Legal name of student', required: true },
      { type: 'text', key: 'studentName', label: 'Name used in narratives', help: 'Usually first name. Fills every “Student Name” in the document.' },
      { type: 'select', key: 'pronoun', label: 'Pronoun used in narratives', options: PRONOUNS },
      { type: 'date', key: 'dob', label: 'Date of birth' },
      { type: 'date', key: 'meetingDate', label: 'Meeting date', required: true },
      { type: 'text', key: 'sasid', label: 'State Student ID (SASID)' },
      { type: 'text', key: 'studentLocalId', label: 'Local Student ID (LASID)' },
      { type: 'text', key: 'grade', label: 'Grade' },
      { type: 'text', key: 'age', label: 'Age', help: 'Leave blank to calculate from date of birth and meeting date.', placeholder: d => { const a = ageFrom(d.dob, d.meetingDate); return a === null ? '' : `${a} (calculated)`; } },
      yn('transitionPlanned', 'This student is over 14. Will you complete the transition assessment and postsecondary transition plan in this IEP?', { showIf: isTransitionAge }),
      { type: 'note', tone: 'warn', label: 'The transition sections are hidden and omitted from the Word document for this IEP.', showIf: d => isTransitionAge(d) && d.transitionPlanned === 'n' },
      { type: 'text', key: 'gender', label: 'Gender' },
      { type: 'select', key: 'race', label: 'Race', options: RACES },
      { type: 'select', key: 'ethnicity', label: 'Ethnicity', options: ETHNICITIES },
      { type: 'static', key: 'auAddress', label: 'AU address', value: AU_ADDRESS },
      { type: 'text', key: 'auNumber', label: 'AU number', default: AU_NUMBER },
      { type: 'heading', label: 'Type of meeting' },
      { type: 'radio', key: 'eligType', label: 'Eligibility', options: [
        { value: 'initial', label: 'Initial Eligibility Meeting' }, { value: 'reeval', label: 'Reevaluation' }, { value: '', label: 'Not an eligibility meeting' }] },
      { type: 'radio', key: 'iepType', label: 'Individualized Educational Program', options: [
        { value: 'initial', label: 'Initial IEP' }, { value: 'review', label: 'IEP Review' },
        { value: 'amend', label: 'Amendment to IEP' }, { value: 'na', label: 'N/A (student did not qualify)' },
        { value: 'other', label: 'Other' }] },
      { type: 'date', key: 'amendDate', label: 'Amendment to IEP dated', showIf: d => d.iepType === 'amend' },
      { type: 'text', key: 'iepOtherText', label: 'Other meeting type', showIf: d => d.iepType === 'other' },
      { type: 'heading', label: 'Dates' },
      { type: 'date', key: 'consentServicesDate', label: 'Date initial consent for services' },
      { type: 'date', key: 'consentEvalDate', label: 'Date of initial consent for evaluation' },
      { type: 'date', key: 'initialEvalDate', label: 'Date initial evaluation completed' },
      { type: 'date', key: 'initialEligDate', label: 'Date of initial eligibility determination' },
      { type: 'date', key: 'nextReviewDate', label: 'Next IEP review meeting (on or before)' },
      { type: 'date', key: 'nextEligDate', label: 'Next eligibility meeting (on or before)' },
    ],
  },
  {
    id: 'family', title: 'Student & Family Info',
    fields: [
      { type: 'prepost', label: 'Prior to / after meeting', rows: [
        { key: 'residenceDistrict', label: 'District of Residence' }, { key: 'homeSchool', label: 'Home School' },
        { key: 'attendDistrict', label: 'District of Attendance' }, { key: 'attendSchool', label: 'School of Attendance' },
        { key: 'primaryDisability', label: 'Primary Disability, if any',
          optionsPre: [...DISABILITIES, 'N/A – not previously eligible'], optionsPost: [...DISABILITIES, 'N/A – not eligible'] },
        { key: 'secondaryDisability', label: 'Secondary Disability (choose None if not applicable)', optionsPre: ['None', ...DISABILITIES], optionsPost: ['None', ...DISABILITIES] },
        { key: 'eduEnvironment', label: 'Primary Educational Environment' }] },
      { type: 'select', key: 'homeLanguage', label: 'Primary language spoken in the home', options: LANGUAGES },
      { type: 'select', key: 'studentLanguage', label: 'Student’s primary language', options: LANGUAGES },
      yn('lep', 'Does the student have limited English proficiency?'),
      yn('interp', 'Is an interpreter needed for meetings?'),
      { type: 'text', key: 'accessScores', label: 'ACCESS scores', required: true, showIf: d => d.lep === 'y' },
      { type: 'text', key: 'altAccessScores', label: 'Alternate ACCESS scores', required: true, showIf: d => d.lep === 'y' },
      yn('esp', 'Is there an Educational Surrogate Parent (ESP)?'),
      { type: 'heading', label: 'Parent / guardian / ESP 1' },
      { type: 'text', key: 'g1Name', label: 'Parent/guardian 1 — name' },
      { type: 'text', key: 'g1Address', label: 'Parent/guardian 1 — address' },
      { type: 'text', key: 'g1Email', label: 'Parent/guardian 1 — email' },
      { type: 'text', key: 'g1Phone', label: 'Parent/guardian 1 — phone' },
      { type: 'heading', label: 'Parent / guardian / ESP 2' },
      { type: 'text', key: 'g2Name', label: 'Parent/guardian 2 — name' },
      { type: 'bool', key: 'g2SameAddress', label: 'Parent/guardian 2 has the same address as parent/guardian 1' },
      { type: 'text', key: 'g2Address', label: 'Parent/guardian 2 — address', showIf: d => !d.g2SameAddress },
      { type: 'text', key: 'g2Email', label: 'Parent/guardian 2 — email' },
      { type: 'bool', key: 'g2SamePhone', label: 'Parent/guardian 2 has the same phone as parent/guardian 1' },
      { type: 'text', key: 'g2Phone', label: 'Parent/guardian 2 — phone', showIf: d => !d.g2SamePhone },
    ],
  },
  {
    id: 'participants', title: 'Safeguards & Participants',
    fields: [
      yn('ps', 'Parent was provided procedural safeguards in native language / mode of communication', { default: 'y' }),
      { type: 'date', key: 'psSignDate', label: 'Date procedural safeguards and the draft were sent' },
      { type: 'heading', label: 'Participants who attended' },
      { type: 'text', key: 'attStudent', label: 'Student' },
      { type: 'text', key: 'attParent1', label: 'Parent/Guardian/ESP' },
      { type: 'text', key: 'attParent2', label: 'Parent/Guardian/ESP (2)' },
      { type: 'text', key: 'attSped', label: 'Special Education Director or Designee' },
      { type: 'text', key: 'attSpedTeacher', label: 'Special Education Teacher/Provider' },
      { type: 'text', key: 'cmName', label: 'Case manager (for IEP record metadata)' },
      { type: 'repeat', key: 'others', label: 'Others in attendance', itemLabel: 'Attendee', fields: [
        { type: 'text', key: 'oName', label: 'Name' }, { type: 'text', key: 'oTitle', label: 'Title' },
        { type: 'text', key: 'oAgency', label: 'Area/agency represented' }] },
    ],
  },
  {
    id: 'plaafp', title: 'Present Levels',
    fields: [
      { type: 'heading', label: 'Strengths, preferences, interests' },
      { type: 'text', key: 'attendingSince', label: '[Name] has been attending Evoke since…' },
      { type: 'textareaImages', key: 'enjoys', label: 'During this time [Name] has enjoyed…' },
      { type: 'textareaImages', key: 'staffDescribe', label: 'Staff describes [Name] as…' },
      { type: 'heading', label: 'Academic present levels' },
      { type: 'text', key: 'academicReportedBy', label: 'Reported by' },
      { type: 'textareaImages', key: 'academicRecordReview', label: 'Academic Present Levels' },
      { type: 'textareaImages', key: 'dailyWork', label: 'Daily work' },
      { type: 'textareaImages', key: 'attendance', label: 'Attendance',
        help: 'State that attendance is not a concern, or document concerns and relevant considerations.' },
      { type: 'repeat', key: 'prevGoals', label: 'Previous goal progress', itemLabel: 'Previous goal', fields: [
        { type: 'text', key: 'domain', label: 'Domain' }, { type: 'textareaImages', key: 'prevGoal', label: 'Previous goal' },
        { type: 'textareaImages', key: 'progress', label: 'Progress/Data' }, { type: 'textareaImages', key: 'recommendation', label: 'Recommendation' }] },
      { type: 'textareaImages', key: 'structuredObs', label: 'Structured observation' },
      { type: 'textareaImages', key: 'unstructuredObs', label: 'Unstructured observation' },
      { type: 'heading', label: 'Parent interview' },
      { type: 'note', label: 'Ask a few open questions: What is going well? What are your biggest concerns? What helps your child communicate, learn, and manage daily routines? What hopes do you have for the future?' },
      { type: 'text', key: 'piInterviewer', label: 'Interviewed by' },
      { type: 'text', key: 'piParent', label: 'Parent/guardian interviewed' },
      { type: 'date', key: 'piDate', label: 'Interview date' },
      { type: 'textareaImages', key: 'piCommunication', label: 'Communication',
        help: 'Ask: How does your child communicate needs, choices, and ideas? What helps them be understood?' },
      { type: 'textareaImages', key: 'piDailyLiving', label: 'Daily living skills',
        help: 'Ask: Which daily routines are going well? Where would more support or independence help?' },
      { type: 'textareaImages', key: 'piAcademics', label: 'Functional academics/school',
        help: 'Ask: What is going well at school or during learning activities? What is most challenging?' },
      { type: 'textareaImages', key: 'piSafety', label: 'Safety skills',
        help: 'Ask: Are there safety concerns or supports that are important for the team to know?' },
      { type: 'textareaImages', key: 'piPostSecondary', label: 'Post-secondary pursuits',
        help: 'Ask: What hopes or priorities do you have for your child’s life after school?' },
      { type: 'heading', label: 'Vineland-III' },
      { type: 'textareaImages', key: 'vinelandSummary', label: 'Summary from BCBA' },
      { type: 'image', key: 'vinelandImage', label: 'Vineland-III score grid', help: 'Upload an image or focus this area and paste a copied image. It will be embedded in the generated Word document.' },
      { type: 'note', label: 'Related-service present levels in the Word document are taken from the service delivery statements entered in the Services section.' },
      { type: 'heading', label: 'Needs, impact & input' },
      { type: 'textareaImages', key: 'transitionAssessment', label: 'Age-appropriate transition assessment process (age 15+ / end of 9th grade)', showIf: tOn },
      { type: 'derivedText', key: 'disabilityType', label: 'Primary disability (automatically from Student & Family Info)' },
      { type: 'textareaImages', key: 'parentInput', label: 'Parent/student input' },
    ],
  },
  {
    id: 'transition', title: 'Post-School & Transition',
    fields: [
      { type: 'note', label: 'The transition sections are omitted from the Word document for this IEP.', showIf: d => isTransitionAge(d) && !tOn(d) },
      { type: 'heading', label: 'Measurable post-school goals (fills both places in the IEP)', showIf: tOn },
      { type: 'textarea', key: 'postEdu', label: 'Education/training goal', showIf: tOn },
      { type: 'textarea', key: 'postEmploy', label: 'Employment goal', showIf: tOn },
      { type: 'textarea', key: 'postIndependent', label: 'Independent living skills goal (when appropriate)', showIf: tOn },
      { type: 'heading', label: 'Postsecondary transition plan', showIf: tOn },
      { type: 'text', key: 'gradDate', label: 'Projected date of graduation/program completion', showIf: tOn },
      { type: 'text', key: 'completionDoc', label: 'Projected type of completion document', showIf: tOn },
      { type: 'textarea', key: 'tsInstruction', label: 'Education/instruction and related services', showIf: tOn },
      { type: 'textarea', key: 'tsCareer', label: 'Career/employment and other post-school adult living objectives', showIf: tOn },
      { type: 'textarea', key: 'tsCommunity', label: 'Community experiences', showIf: tOn },
      { type: 'textarea', key: 'tsDailyLiving', label: 'Daily living skills and/or functional vocational evaluation', showIf: tOn },
      { type: 'textarea', key: 'agencyLinkages', label: 'Agency linkages', showIf: tOn },
      { type: 'yesnona', key: 'rights', label: 'Student will turn 20 during this IEP: informed of transfer of rights at age of majority (21)', showIf: tOn },
    ],
  },
  {
    id: 'factors', title: 'Special Factors',
    fields: [
      ['bip', 'A. Behavior that requires a Behavior Intervention Plan?'],
      ['vis', 'B. Blind or visually impaired? (Learning Media Plan)'],
      ['hoh', 'C. Deaf or hard of hearing? (Communication Plan)'],
      ['db', 'D. Deaf-blind? (Learning Media & Communication Plan)'],
      ['comm', 'E. Unique communication needs?'],
      ['lep', 'F. Limited English Proficiency? (same answer as Student & Family Info)'],
      ['at', 'G. Assistive technology devices or services?'],
      ['transp', 'H. Special transportation?'],
      ['hcp', 'I. Health Care Plan? (indicate location of plan)'],
    ].flatMap(([k, label]) => [
      yn(k, label),
      { type: 'textarea', key: k + 'Text', label: 'Details', showIf: d => d[k] === 'y' || !!d[k + 'Text'] },
    ]),
  },
  {
    id: 'goals', title: 'Annual Goals',
    fields: [
      { type: 'repeat', key: 'goals', label: '', itemLabel: 'Goal', fields: [
        { type: 'bool', key: 'esy', label: 'Extended School Year goal' },
        { type: 'text', key: 'area', label: 'Area of need' },
        { type: 'textarea', key: 'goal', label: 'Measurable goal' },
        { type: 'textList', key: 'objectives', label: 'Objectives (if needed)', itemLabel: 'Objective', legacyKey: 'objective', help: 'Add as many as needed. They print together, numbered, in the goal’s “Objective” box.' },
        { type: 'text', key: 'unit', label: 'Unit of measurement' },
        { type: 'standardPicker', key: 'standard', label: 'Related Colorado Academic Standard / Extended Evidence Outcome' },
        { type: 'textarea', key: 'baseline', label: 'Baseline data point' },
        { type: 'checks', key: 'methods', label: 'Evaluation method', options: EVAL_METHODS },
        { type: 'text', key: 'methodOther', label: 'Other evaluation method', showIf: d => (d.methods || []).includes(3) },
        { type: 'textarea', key: 'progressReport', label: 'How and how often parents will be informed of progress' },
      ] },
    ],
  },
  {
    id: 'accom', title: 'Accommodations & Mods',
    fields: [
      { type: 'checks', key: 'accommodations', label: 'Accommodations', options: ACCOMMODATIONS, columns: 2 },
      { type: 'text', key: 'accOther', label: 'Other accommodations' },
      { type: 'checks', key: 'modifications', label: 'Modifications', options: MODIFICATIONS },
      { type: 'text', key: 'modOther', label: 'Other modifications' },
    ],
  },
  {
    id: 'esy', title: 'Extended School Year',
    fields: [
      { type: 'yesnoni', key: 'esyq1', label: 'Did the student experience severe regression on IEP goals and objectives?' },
      { type: 'yesnoni', key: 'esyq2', label: 'Did the student require an unreasonably long period of time to relearn previously learned skills?' },
      { type: 'yesnoni', key: 'esyq3', label: 'Do predictive factors indicate the need for ESY services?' },
      { type: 'radio', key: 'esyElig', label: 'Decision: eligible for ESY services?', options: [
        { value: 'y', label: 'Yes' }, { value: 'n', label: 'No' }, { value: 'tbd', label: 'To be determined' }] },
      { type: 'text', key: 'esyTbdBy', label: 'To be determined by', showIf: d => d.esyElig === 'tbd' },
      { type: 'textarea', key: 'esyGoals', label: 'Goals to be worked on during ESY',
        help: 'Annual goals marked Extended School Year are included automatically when ESY eligibility is Yes or To be determined. Add any details here.' },
    ],
  },
  {
    id: 'assess', title: 'State & District Assessments',
    fields: [
      { type: 'assessGrid', key: 'da', label: 'District assessments', rows: [
        { key: 'ela', label: 'English Language Arts' }, { key: 'math', label: 'Math' }, { key: 'sci', label: 'Science' },
        { key: 'ss', label: 'Social Studies' }, { key: 'o1', label: 'Other', otherKey: 'daOther1' }, { key: 'o2', label: 'Other', otherKey: 'daOther2' }] },
      { type: 'textarea', key: 'daAccommodations', label: 'District assessment accommodations' },
      { type: 'yesnona', key: 'daAlt', label: 'Meets requirements for alternate achievement standards (EEOs) & will take district alternate assessment', noN: true },
      { type: 'textarea', key: 'daAltJustification', label: 'District alternate assessment justification',
        default: 'The student does not take district assessments at this time due to separate school placement.' },
      { type: 'assessGrid', key: 'sa', label: 'Colorado state assessments', rows: [
        { key: 'ela', label: 'English Language Arts' }, { key: 'math', label: 'Math' }, { key: 'sci', label: 'Science' },
        { key: 'ss', label: 'Social Studies' }, { key: 'act', label: 'ACT' }, { key: 'o', label: 'Other', otherKey: 'saOther' }] },
      { type: 'textarea', key: 'saAccommodations', label: 'Accessibility features / accommodations for Colorado state assessment' },
      { type: 'yesnona', key: 'saAlt', label: 'Team concurs student meets requirements for alternate standards & will take state alternate assessment', noN: true },
      { type: 'textarea', key: 'saAltJustification', label: 'Colorado alternate assessment justification' },
      { type: 'textarea', key: 'saAltAccommodations', label: 'Accommodations for the Colorado Alternate Assessment' },
      { type: 'textarea', key: 'saUniqueAcc', label: 'Unique accommodations pending CDE approval' },
      { type: 'yesnona', key: 'saInformed', label: 'Parents informed about differences between regular and alternate assessments', noN: true },
    ],
  },
  {
    id: 'services', title: 'Services',
    fields: [
      { type: 'repeat', key: 'serviceDeliveryStatements', label: 'Service delivery statements', itemLabel: 'Statement', fields: [
        { type: 'text', key: 'serviceType', label: 'Type of service',
          placeholder: 'e.g., Mental health, speech-language, occupational therapy' },
        { type: 'textareaImages', key: 'statement', label: 'Service delivery statement',
          help: 'Describe the service and how it will be delivered. Pasted or uploaded images are included in the Word document.' },
      ] },
      { type: 'repeat', key: 'services', label: 'Special education & related services', itemLabel: 'Service', fields: [
        { type: 'text', key: 'sArea', label: 'Specialized instruction area / related service' },
        { type: 'text', key: 'sProvider', label: 'Service provider' },
        { type: 'date', key: 'sStart', label: 'Start date' },
        { type: 'date', key: 'sEnd', label: 'End date' },
        { type: 'radio', key: 'kind', label: 'Direct or indirect', options: [{ value: 'D', label: 'Direct' }, { value: 'I', label: 'Indirect (incl. case management)' }] },
        { type: 'radio', key: 'per', label: 'Frequency', options: [{ value: 'D', label: 'Per day' }, { value: 'W', label: 'Per week' }, { value: 'M', label: 'Per month' }] },
        { type: 'number', key: 'minutes', label: 'Minutes' },
      ] },
      { type: 'note', label: 'Each service fills one frequency column only, as the form requires. Totals are added up in hours automatically.' },
    ],
  },
  {
    id: 'placement', title: 'Placement (LRE)',
    fields: [
      yn('pl1', '1. Separate School — selected?'),
      yn('pl2', '2. General Education less than 40% of the time — selected?'),
      { type: 'text', key: 'pl3Name', label: '3. Other placement option considered' },
      yn('pl3', 'Other option — selected?', { showIf: d => !!d.pl3Name }),
      { type: 'textarea', key: 'placementSummary', label: 'Summary of placement discussion', help: 'Address advantages, disadvantages/potential harmful effects, and supplementary aids & services considered for each option.' },
      { type: 'heading', label: 'Educational environment' },
      { type: 'radio', key: 'envEC', label: 'Ages 3–5', showIf: showEarlyChildhoodEnvironment,
        options: [{ value: '', label: 'Not applicable' }, ...EC_ENVIRONMENTS.map((l, i) => ({ value: String(i), label: l }))] },
      { type: 'radio', key: 'envSchool', label: 'Ages 6–21', showIf: showSchoolAgeEnvironment,
        options: [{ value: '', label: 'Not applicable' }, ...SCHOOL_ENVIRONMENTS.map((l, i) => ({ value: String(i), label: l }))] },
    ],
  },
];

const YN_TYPES = ['yesno', 'yesnona', 'yesnoni'];
// Every Yes/No question and every dropdown is required (plus anything marked required: true)
export const isRequired = f => !!f.required || YN_TYPES.includes(f.type) || f.type === 'select' || f.key === 'esyElig';

// Required questions that are visible but unanswered, per section.
export function missingRequired(d) {
  const out = [];
  for (const s of SECTIONS) for (const f of s.fields) {
    if (f.showIf && !f.showIf(d)) continue;
    if (f.type === 'prepost') {
      for (const r of f.rows) for (const [suffix, when] of [['Pre', 'prior to meeting'], ['Post', 'after meeting']]) {
        if (r['options' + suffix] && !d[r.key + suffix]) out.push({ section: s.id, sectionTitle: s.title, key: r.key + suffix, label: `${r.label} (${when})` });
      }
      continue;
    }
    if (!f.key || !isRequired(f)) continue;
    if (f.type === 'select' && d[f.key] === 'Other' && !(d[f.key + 'Other'] || '').trim()) {
      out.push({ section: s.id, sectionTitle: s.title, key: f.key + 'Other', label: f.label + ' (Other — please specify)' });
      continue;
    }
    const v = d[f.key];
    if (v === undefined || v === null || v === '') out.push({ section: s.id, sectionTitle: s.title, key: f.key, label: f.label });
  }
  return out;
}

export function defaultData() {
  const d = { pronoun: 'their', others: [], prevGoals: [], goals: [], services: [], serviceDeliveryStatements: [] };
  for (const s of SECTIONS) for (const f of s.fields) if (f.default !== undefined) d[f.key] = f.default;
  return d;
}

export function newGoal() {
  return { methods: [0], objectives: [] };
}

export const STANDARD_AREAS = [
  { id: 'rwc', label: 'Reading, Writing and Communicating', cdeArea: '6', categories: [
    { id: '18', label: '1. Oral Expression and Listening' },
    { id: '19', label: '2. Reading for All Purposes' },
    { id: '20', label: '3. Writing and Composition' },
    { id: '21', label: '4. Research Inquiry and Design' },
  ], grades: [
    { id: '1', label: 'Preschool' }, { id: '2', label: 'Kindergarten' },
    ...['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth']
      .map((label, i) => ({ id: String(i + 3), label: `${label} Grade` })),
    { id: '30', label: 'High School (9th / 10th Grade Band)' },
    { id: '29', label: 'High School (11th / 12th Grade Band)' },
  ] },
  { id: 'math', label: 'Mathematics', cdeArea: '4', categories: [
    { id: '8', label: '1. Number and Quantity' },
    { id: '9', label: '2. Algebra and Functions' },
    { id: '10', label: '3. Data, Statistics, and Probability' },
    { id: '11', label: '4. Geometry' },
  ], grades: [
    { id: '1', label: 'Preschool' }, { id: '2', label: 'Kindergarten' },
    ...['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth']
      .map((label, i) => ({ id: String(i + 3), label: `${label} Grade` })),
    { id: '15', label: 'High School' },
  ] },
  { id: 'science', label: 'Science', cdeArea: '7', categories: [
    { id: '15', label: '1. Physical Science' },
    { id: '16', label: '2. Life Science' },
    { id: '17', label: '3. Earth and Space Science' },
  ], grades: [
    { id: '1', label: 'Preschool' }, { id: '2', label: 'Kindergarten' },
    ...['First', 'Second', 'Third', 'Fourth', 'Fifth']
      .map((label, i) => ({ id: String(i + 3), label: `${label} Grade` })),
    { id: '38', label: 'Middle School (6th–8th Grade)' },
    { id: '15', label: 'High School' },
  ] },
  { id: 'social-studies', label: 'Social Studies', cdeArea: '30008', categories: [
    { id: '30037', label: '1. History' },
    { id: '30038', label: '2. Geography' },
    { id: '30039', label: '3. Economics' },
    { id: '30040', label: '4. Civics' },
    { id: '30045', label: '5. Personal Financial Literacy' },
  ], grades: [
    { id: '30001', label: 'Preschool' }, { id: '30002', label: 'Kindergarten' },
    ...['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth']
      .map((label, i) => ({ id: String(30003 + i), label: `${label} Grade` })),
    { id: '30015', label: 'High School' },
  ] },
];

export function standardLookupUrl(type, area, grade, category) {
  if (type === 'eeo') return 'https://ed.cde.state.co.us/coextendedeo';
  if (!area || !grade) return 'https://www.cde.state.co.us/apps/standards/';
  return `https://www.cde.state.co.us/apps/standards/${area.cdeArea},${grade},${category?.id ?? category ?? 0}`;
}

export function standardFieldText(selection) {
  const { type, area, gradeLabel, category, gleCode, gleText, evidenceCode, evidenceText } = selection;
  const lines = [];
  if (type) lines.push(type === 'eeo' ? 'Extended Evidence Outcome (EEO)' : 'Colorado Academic Standard (CAS)');
  if (area) lines.push(`Content area: ${area.label}`);
  if (gradeLabel) lines.push(`Grade: ${gradeLabel}`);
  if (category) lines.push(`Standard: ${category.label}`);
  if (gleCode || gleText) lines.push(`Grade Level Expectation: ${[gleCode, gleText].filter(Boolean).join(' — ')}`);
  if (evidenceCode || evidenceText) lines.push(`Evidence Outcome: ${[evidenceCode, evidenceText].filter(Boolean).join(' — ')}`);
  return lines.join('\n');
}

const BEFORE_DUE = [
  { checkpoint: '60 days before due date', offset: -60, owner: 'T', title: 'Schedule the IEP meeting with the district and guardians' },
  { checkpoint: '60 days before due date', offset: -60, owner: 'T', title: 'Enter the agreed meeting date in the Evoke IEP app', action: 'open-iep' },
  { checkpoint: '6 weeks before', offset: -42, owner: 'T', title: 'Send Notice of Meeting and Procedural Safeguards to guardians' },
  { checkpoint: '6 weeks before', offset: -42, owner: 'T', title: 'Send the calendar invite for the IEP meeting' },
  { checkpoint: '6 weeks before', offset: -42, owner: 'B, M', title: 'Coordinate calendars to attend the IEP meeting' },
  { checkpoint: '4 weeks before', offset: -28, owner: 'T', title: 'Begin creating the IEP', action: 'open-iep' },
  { checkpoint: '4 weeks before', offset: -28, owner: 'T', title: 'Get guardian input on priorities for the upcoming IEP year' },
  { checkpoint: '4 weeks before', offset: -28, owner: 'T', title: 'Administer transition assessments (age 15+ only)', transitionOnly: true },
  { checkpoint: '4 weeks before', offset: -28, owner: 'T', title: 'Schedule the pre-IEP meeting with the team' },
  { checkpoint: '4 weeks before', offset: -28, owner: 'B', title: 'Update the FBA' },
  { checkpoint: '4 weeks before', offset: -28, owner: 'M', title: 'Review current goals with the BCBA and teacher; draft new mental-health goals' },
  { checkpoint: '2 weeks before', offset: -14, owner: 'B', title: 'Update the BIP as needed; complete the domain-level Vineland' },
  { checkpoint: '2 weeks before', offset: -14, owner: 'M', title: 'Review proposed mental-health goals with the MH Director' },
  { checkpoint: '2 weeks before', offset: -14, owner: 'T', title: 'Send the meeting reminder to guardians and the district' },
  { checkpoint: '2 weeks before', offset: -14, owner: 'T', title: 'Complete the IEP final draft', action: 'open-iep' },
  { checkpoint: '1 week before', offset: -7, owner: 'B', title: 'Give the final BIP, evaluations, and assessments to the teacher' },
  { checkpoint: '1 week before', offset: -7, owner: 'T', title: 'Send the IEP draft, BIP, evaluations, and assessments to the district and guardians' },
];

const AFTER_MEETING = [
  { checkpoint: '9 days after meeting', offset: 9, owner: 'T', title: 'Complete outstanding action items from the IEP meeting' },
  { checkpoint: '9 days after meeting', offset: 9, owner: 'T', title: 'Enter new goals into CR; archive last year’s CR IEP book' },
  { checkpoint: '9 days after meeting', offset: 9, owner: 'T', title: 'Send the finalized IEP for signatures' },
  { checkpoint: '14 days after meeting', offset: 14, owner: 'T', title: 'Send the finalized, signed IEP and final BIP to the district' },
  { checkpoint: '20 days after meeting', offset: 20, owner: 'T', title: 'Train the student’s academic team on the new IEP goals' },
];

const MEETING_DAY = [
  { checkpoint: 'Meeting day', owner: 'T', title: 'Lead the IEP meeting and document decisions and action items' },
  { checkpoint: 'Meeting day', owner: 'B', title: 'Attend the IEP meeting and present behavior updates' },
  { checkpoint: 'Meeting day', owner: 'M', title: 'Attend the IEP meeting and present mental-health updates' },
];

function shiftDate(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function iepMeetingDate(student) {
  return student.iepScheduled?.date || student.draft?.meetingDate || student.latestFinal?.meetingDate || '';
}

export function checklistTasks(student) {
  const tasks = [];
  const transitionAge = student.dob ? ageOn(student.dob, student.iepDue || localDate()) >= 15 : false;

  if (!student.listIepDue) {
    tasks.push({ id: 'missing-iep-due', owner: 'T', title: 'Enter the IEP due date in Current Clients', action: 'edit-dates', dateRequired: true });
  }
  if (!student.listReevalDue) {
    tasks.push({ id: 'missing-reeval-due', owner: 'T', title: 'Enter the reevaluation due date in Current Clients', action: 'edit-dates', dateRequired: true });
  }
  if (!student.iepScheduled) {
    tasks.push({ id: 'missing-iep-meeting', owner: 'T', title: 'Schedule the IEP meeting and enter its date in Current Clients', action: 'edit-dates', dateRequired: true });
  } else if (!iepMeetingDate(student)) {
    tasks.push({ id: 'missing-iep-meeting-date', owner: 'T', title: 'Enter the agreed IEP meeting date in the Evoke IEP app', action: 'open-iep', dateRequired: true });
  }
  if (!student.reevalScheduled) {
    tasks.push({ id: 'missing-reeval-meeting', owner: 'T', title: 'Schedule the reevaluation and enter its date in Current Clients', action: 'edit-dates', dateRequired: true });
  }

  for (const task of BEFORE_DUE) {
    if (task.transitionOnly && !transitionAge) continue;
    const targetDate = student.iepDue ? shiftDate(student.iepDue, task.offset) : '';
    const taskKey = task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    tasks.push({ ...task, id: `iep-${Math.abs(task.offset)}-${taskKey}`, targetDate });
  }
  MEETING_DAY.forEach((task, index) => {
    tasks.push({
      ...task,
      id: `meeting-${index}`,
      targetDate: iepMeetingDate(student),
    });
  });
  AFTER_MEETING.forEach((task, index) => {
    tasks.push({
      ...task,
      id: `after-${index}`,
      targetDate: iepMeetingDate(student) ? shiftDate(iepMeetingDate(student), task.offset) : '',
    });
  });
  return tasks;
}

export function activeTeacherTasks(student, today = new Date()) {
  const todayDate = localDate(today);
  const meetingDate = iepMeetingDate(student);
  if (!meetingDate || meetingDate < todayDate || meetingDate > shiftDate(todayDate, 60)) return [];

  const horizon = shiftDate(todayDate, 7);
  return checklistTasks(student).filter(task => task.dateRequired
    || (task.owner.split(',').map(owner => owner.trim()).includes('T')
      && task.targetDate
      && task.targetDate <= horizon));
}

function ageOn(dob, on) {
  const birth = new Date(`${dob}T00:00:00`);
  const date = new Date(`${on || new Date().toISOString().slice(0, 10)}T00:00:00`);
  let age = date.getFullYear() - birth.getFullYear();
  if (date.getMonth() < birth.getMonth() || (date.getMonth() === birth.getMonth() && date.getDate() < birth.getDate())) age--;
  return age;
}

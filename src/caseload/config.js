// ─────────────────────────────────────────────────────────────────────────────
// Caseload settings. Point these at your existing SharePoint student list.
// Column names are the INTERNAL names (List settings → click the column → the
// "Field=" part of the URL). Leave a column '' if the list doesn't have it.
// ─────────────────────────────────────────────────────────────────────────────
export const CASELOAD = {
  site: import.meta.env.VITE_CASELOAD_SITE || 'evokebehavioralhealthcom.sharepoint.com:/sites/EvokeIntake',
  list: import.meta.env.VITE_CASELOAD_LIST || 'Current Clients',

  activeFilter: student => (student.serviceType || '')
    .split(',').some(value => value.trim().toLowerCase() === 'school services'),

  columns: {
    legalName: 'Title',
    dob: 'ClientDOB',
    district: 'SchoolDistrict',      // choice
    classroom: 'Classroom',          // choice
    serviceType: 'Services',         // choice
    program: 'Program',              // choice
    mhServices: 'MentalHealthServices', // choice
    caseManager: 'Teacher',          // person: decides whose caseload a student is on
    bcba: 'BCBA',                    // person
    mhProvider: 'MHProvider',        // person
    iepDue: 'IEPDueDate',
    reevalDue: 'ReEvalDueDate',
    iepScheduled: 'IEPMeetingScheduled', // date or yes/no — both handled
    reevalScheduled: 'ReEvalScheduled',  // date or yes/no — both handled
    startDate: 'StartDate',
    parentName: 'ParentGuardianName',
    parentEmail: 'Email',
    checklistState: 'IEPChecklistState', // multiline text storing checklist completion state
    // Student identifier columns must exist in Current Clients and be editable.
    studentName: '', sasid: 'SASID', lasid: 'LASID', grade: '', disability: '', dischargeDate: '',
    parentPhone: '',
  },
  personColumns: ['caseManager', 'bcba', 'mhProvider'],

  // Who sees everyone's caseload (directors / coordinators). Everyone else sees only their own students.
  allAccessEmails: ['maddie@evokebehavioralhealth.com'],

  // Alert windows, in days before the due date. Reevaluations get more lead time
  // because testing has to be scheduled and completed before the meeting.
  windows: {
    iep: { urgent: 30, soon: 60, upcoming: 90 },
    reeval: { urgent: 60, soon: 90, upcoming: 120 },
  },
};

// Base names of the DynamoDB tables. Deployed names are `${TABLE_PREFIX}<name>`
// (for example stg_vistaq_Users); serverless.yml declares the same list.
export const TABLE_NAMES = [
  'Users',
  'Groups',
  'GroupTrainers',
  'AgentCodes',
  'Prospects',
  'UserStats',
  'PointTotals',
  'PointTransactions',
  'AwardGuards',
  'SalesAwards',
  'PointConfigs',
  'PointActivityTypes',
  'Events',
  'EventGroups',
  'EventAgents',
  'CoachingSessions',
  'CoachingSessionGroups',
  'CoachingSessionAgents',
  'CoachingAttendance',
  'SalesReportYtd',
  'SalesReportMtd',
  'UploadBatches',
  'ReportJobs',
  'Taxonomies',
  'Labels',
] as const;

export type TableName = (typeof TABLE_NAMES)[number];

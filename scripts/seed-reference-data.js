/**
 * Reference data seed
 *
 * Writes the point activity types the award and sales-points flows look up,
 * and the default sales point configs (30 points each) when a stage has none.
 * Activity types are owned by code and overwritten on every run; existing
 * point configs are left alone so admin changes survive. Run once per stage
 * after a deploy, and again whenever this list changes.
 *
 * Usage:
 *   npm run seed:reference
 *
 * Required environment (shell or .env): TABLE_PREFIX (for example dev_vistaq_)
 * and AWS_REGION, or COGNITO_USER_POOL_ID, whose prefix is the region.
 */

require('dotenv').config();
const { randomUUID } = require('crypto');

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const { TABLE_PREFIX, COGNITO_USER_POOL_ID } = process.env;
const AWS_REGION = process.env.AWS_REGION || COGNITO_USER_POOL_ID?.split('_')[0];

if (!TABLE_PREFIX || !AWS_REGION) {
  console.error('Missing TABLE_PREFIX, or AWS_REGION / COGNITO_USER_POOL_ID');
  process.exit(1);
}

// Ported from supabase/snippets/insert_points_config.sql and the sales
// completion migration.
const ACTIVITY_TYPES = [
  ['prospect_created', 'prospect', 'Added Prospect', 'prospect'],
  ['appointment_set', 'prospect', 'Appointment Set', 'prospect'],
  ['sales_meeting', 'prospect', 'Sales Meeting Completed', 'prospect'],
  ['sale_closed', 'prospect', 'Sale: Successful', 'prospect'],
  ['prospect_deleted', 'prospect', 'Prospect Deleted', 'prospect'],
  ['coaching_individual_attended', 'coaching', 'Individual Coaching Attended', 'coaching_session'],
  ['coaching_group_attended', 'coaching', 'Group Coaching Attended', 'coaching_session'],
  ['coaching_peer_circles_attended', 'coaching', 'Peer Circles Attended', 'coaching_session'],
  ['coaching_2_full_days_attended', 'coaching', '2 Full Days Seminar Attended', 'coaching_session'],
  ['coaching_2_hours_online_attended', 'coaching', '2 Hours Online Seminar Attended', 'coaching_session'],
  ['sales_noc', 'sales', 'Issuance Certificate', 'upload_batch'],
  ['sales_fyct', 'sales', 'FYCt (per RM1,000)', 'upload_batch'],
  ['sales_ace', 'sales', 'ACE (per RM1,000)', 'upload_batch'],
];

const DEFAULT_SALES_POINTS = 30;

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION }));

async function seed() {
  for (const [name, category, label, subject_type] of ACTIVITY_TYPES) {
    await dynamo.send(
      new PutCommand({
        TableName: `${TABLE_PREFIX}PointActivityTypes`,
        Item: { name, category, label, subject_type },
      }),
    );
  }
  console.log(`Wrote ${ACTIVITY_TYPES.length} point activity types.`);

  const now = new Date().toISOString();
  let created = 0;
  for (const activity of ['sales_noc', 'sales_fyct', 'sales_ace']) {
    try {
      await dynamo.send(
        new PutCommand({
          TableName: `${TABLE_PREFIX}PointConfigs`,
          Item: {
            id: randomUUID(),
            activity,
            category: 'sales',
            points: DEFAULT_SALES_POINTS,
            created_at: now,
            updated_at: now,
          },
          ConditionExpression: 'attribute_not_exists(activity)',
        }),
      );
      created++;
    } catch (error) {
      if (error.name !== 'ConditionalCheckFailedException') throw error;
    }
  }
  console.log(`Created ${created} default sales point configs (existing ones kept).`);
}

seed().catch((error) => {
  console.error('Failed to seed reference data:', error.message);
  process.exit(1);
});

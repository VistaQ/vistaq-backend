/**
 * Development data seed
 *
 * Fills a dev or staging stage with realistic data: a master trainer,
 * trainers, groups with a leader and agents, agent codes, prospects at every
 * stage, events and coaching sessions with attendance, plus default point
 * configs. It writes source records only; points and per-agent stats come from
 * the stream consumers, so a run also exercises that pipeline.
 *
 * A fixed faker seed gives the same ids on every run and each put is
 * conditional, so a rerun adds nothing. Users get no Cognito account (their
 * emails are fake); real sign-in accounts come from create-admin.
 *
 * Usage:
 *   npm run seed
 *
 * Required environment (shell or .env): TABLE_PREFIX (for example dev_vistaq_)
 * and AWS_REGION, or COGNITO_USER_POOL_ID, whose prefix is the region. Refuses
 * a production prefix. Run `npm run seed:reference` first, or awards are
 * skipped for lack of activity types.
 */

import 'dotenv/config';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { faker } from '@faker-js/faker';

import type { TableName } from '@src/constants/tables';
import type { IAgentCodeItem } from '@src/repositories/agentCode.repository';
import type {
  IAttendanceItem,
  ISessionGroupItem,
  ISessionItem,
} from '@src/repositories/coachingSession.repository';
import type {
  IEventGroupItem,
  IEventItem,
} from '@src/repositories/event.repository';
import type { IGroupItem } from '@src/repositories/group.repository';
import type { IGroupTrainerItem } from '@src/repositories/groupTrainer.repository';
import type { IPointConfigItem } from '@src/repositories/pointConfig.repository';
import type { IProspectItem } from '@src/repositories/prospect.repository';
import type { IUserItem } from '@src/repositories/user.repository';
import { toUtc } from '@src/utils/period';

/******************************************************************************
                                Settings
******************************************************************************/

const SEED = 20261106;
const TRAINERS = 3;
const GROUPS = 5;
const AGENTS_PER_GROUP = 6;
const PROSPECTS_PER_AGENT = { min: 6, max: 14 };
const UNUSED_AGENT_CODES = 10;
const EVENTS = 8;
const SESSIONS = 8;
const HISTORY_MONTHS = 6;
const CONCURRENCY = 16;

const DEV_POINT_CONFIGS: [string, string, number][] = [
  ['prospect_created', 'prospect', 10],
  ['appointment_set', 'prospect', 20],
  ['sales_meeting', 'prospect', 30],
  ['sale_closed', 'prospect', 50],
  ['prospect_deleted', 'prospect', 0],
  ['coaching_individual_attended', 'coaching', 15],
  ['coaching_group_attended', 'coaching', 10],
  ['coaching_peer_circles_attended', 'coaching', 10],
];

const COACHING_TYPES = [
  'individual_coaching',
  'group_coaching',
  'peer_circles',
  'seminar_attended',
];

/******************************************************************************
                                Setup
******************************************************************************/

const { TABLE_PREFIX = '', COGNITO_USER_POOL_ID } = process.env;
const AWS_REGION = process.env.AWS_REGION || COGNITO_USER_POOL_ID?.split('_')[0];

if (!TABLE_PREFIX || !AWS_REGION) {
  console.error('Missing TABLE_PREFIX, or AWS_REGION / COGNITO_USER_POOL_ID');
  process.exit(1);
}
if (TABLE_PREFIX.startsWith('prod')) {
  console.error(`Refusing to seed a production stage (${TABLE_PREFIX})`);
  process.exit(1);
}

const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: AWS_REGION }),
  { marshallOptions: { removeUndefinedValues: true } },
);

const table = (name: TableName) => `${TABLE_PREFIX}${name}`;
const created: Record<string, number> = {};
const skipped: Record<string, number> = {};

/** Puts the item unless its key exists; returns whether it was written. */
async function putNew<T extends object>(
  name: TableName,
  item: T,
  keyAttribute: string,
): Promise<boolean> {
  try {
    await dynamo.send(
      new PutCommand({
        TableName: table(name),
        Item: item as Record<string, unknown>,
        ConditionExpression: 'attribute_not_exists(#key)',
        ExpressionAttributeNames: { '#key': keyAttribute },
      }),
    );
    created[name] = (created[name] ?? 0) + 1;
    return true;
  } catch (error) {
    if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') {
      throw error;
    }
    skipped[name] = (skipped[name] ?? 0) + 1;
    return false;
  }
}

async function setFields(
  name: TableName,
  key: Record<string, string>,
  fields: Record<string, unknown>,
): Promise<void> {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  await dynamo.send(
    new UpdateCommand({
      TableName: table(name),
      Key: key,
      UpdateExpression: `SET ${entries.map((_, i) => `#f${i} = :v${i}`).join(', ')}`,
      ExpressionAttributeNames: Object.fromEntries(
        entries.map(([field], i) => [`#f${i}`, field]),
      ),
      ExpressionAttributeValues: Object.fromEntries(
        entries.map(([, value], i) => [`:v${i}`, value]),
      ),
    }),
  );
}

async function pool<T>(items: T[], run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        await run(items[next++]);
      }
    }),
  );
}

const dayOf = (date: Date) => toUtc(date).slice(0, 10);
const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
const addHours = (date: Date, hours: number) =>
  new Date(date.getTime() + hours * 60 * 60 * 1000);
const earlier = (a: Date, b: Date) => (a < b ? a : b);

/******************************************************************************
                                People
******************************************************************************/

interface ISeedUser extends IUserItem {
  role: 'master_trainer' | 'trainer' | 'group_leader' | 'agent';
}

let agentCodeNumber = 1;
const nextAgentCode = () => `AG${String(agentCodeNumber++).padStart(5, '0')}`;

function person(
  role: ISeedUser['role'],
  index: number,
  now: Date,
  groupId?: string,
): ISeedUser {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const joined = toUtc(faker.date.past({ years: 1, refDate: now }));
  const sells = role === 'agent' || role === 'group_leader';
  return {
    id: faker.string.uuid(),
    email: `${firstName}.${lastName}.${role}${index}@seed.vistaq.test`
      .toLowerCase()
      .replace(/[^a-z0-9.@]/g, ''),
    name: `${firstName} ${lastName}`,
    role,
    status: 'active',
    ...(groupId && { group_id: groupId }),
    ...(sells && {
      agent_code: nextAgentCode(),
      sales_target: faker.number.int({ min: 50, max: 200 }) * 1000,
      fyct_target: faker.number.int({ min: 20, max: 80 }) * 1000,
      fyc_target: faker.number.int({ min: 20, max: 80 }) * 1000,
    }),
    location: faker.location.city(),
    phone: faker.phone.number({ style: 'international' }),
    agency: `${faker.company.name()} Agency`,
    created_at: joined,
    updated_at: joined,
  };
}

/******************************************************************************
                                Prospects
******************************************************************************/

interface IProspectPlan {
  item: IProspectItem;
  steps: Record<string, unknown>[];
}

// The prospect is inserted at its first stage and then moved through the
// rest with updates, so the stream sees each transition and awards for it.
function planProspect(agentId: string, now: Date): IProspectPlan {
  const createdAt = faker.date.between({
    from: addDays(now, -HISTORY_MONTHS * 30),
    to: now,
  });
  const id = faker.string.uuid();
  const history = [{ stage: 'prospect', enteredAt: toUtc(createdAt) }];
  const item: IProspectItem = {
    id,
    agent_id: agentId,
    prospect_name: faker.person.fullName(),
    prospect_email: faker.internet.email().toLowerCase(),
    prospect_phone: faker.phone.number({ style: 'international' }),
    current_stage: 'prospect',
    prospect_entered_at: toUtc(createdAt),
    stage_history: [...history],
    sales_parts_completed: [],
    products_sold: [],
    created_at: toUtc(createdAt),
    updated_at: toUtc(createdAt),
  };

  const path = faker.helpers.weightedArrayElement([
    { weight: 45, value: 'prospect' },
    { weight: 30, value: 'appointment' },
    { weight: 25, value: 'sales' },
  ]);
  const steps: Record<string, unknown>[] = [];
  if (path === 'prospect') return { item, steps };

  const bookedAt = earlier(addDays(createdAt, faker.number.int({ min: 1, max: 7 })), now);
  const appointmentDay = addDays(bookedAt, faker.number.int({ min: 1, max: 21 }));
  history.push({ stage: 'appointment', enteredAt: toUtc(bookedAt) });
  steps.push({
    current_stage: 'appointment',
    stage_history: [...history],
    appointment_date: dayOf(appointmentDay),
    appointment_start_time: '10:00',
    appointment_end_time: '11:00',
    appointment_location: faker.location.streetAddress(),
    appointment_status: 'scheduled',
    updated_at: toUtc(bookedAt),
  });

  const meetingHappened = appointmentDay < now;
  if (path === 'appointment' || !meetingHappened) {
    if (meetingHappened) {
      const status = faker.helpers.arrayElement(['done', 'rescheduled', 'declined', 'kiv']);
      steps.push({
        appointment_status: status,
        ...(status === 'done' && { appointment_completed_at: toUtc(appointmentDay) }),
        updated_at: toUtc(appointmentDay),
      });
    }
    return { item, steps };
  }

  history.push({ stage: 'sales', enteredAt: toUtc(appointmentDay) });
  steps.push({
    current_stage: 'sales',
    stage_history: [...history],
    appointment_status: 'done',
    appointment_completed_at: toUtc(appointmentDay),
    updated_at: toUtc(appointmentDay),
  });

  const outcome = faker.helpers.weightedArrayElement([
    { weight: 60, value: 'successful' },
    { weight: 25, value: 'kiv' },
    { weight: 15, value: 'unsuccessful' },
  ]);
  const decidedAt = earlier(addDays(appointmentDay, faker.number.int({ min: 1, max: 10 })), now);
  steps.push({
    sales_parts_completed: faker.helpers.arrayElements(
      ['social', 'factFind', 'presentation'],
      { min: 1, max: 3 },
    ),
    sales_outcome: outcome,
    ...(outcome === 'successful' && {
      products_sold: Array.from(
        { length: faker.number.int({ min: 1, max: 3 }) },
        () => ({
          productName: faker.commerce.productName(),
          amount: faker.number.int({ min: 1, max: 50 }) * 1000,
        }),
      ),
      sales_completed_at: toUtc(decidedAt),
    }),
    ...(outcome === 'unsuccessful' && {
      unsuccessful_reason: faker.helpers.arrayElement([
        'Budget constraints',
        'Went with a competitor',
        'Not interested',
      ]),
    }),
    updated_at: toUtc(decidedAt),
  });
  return { item, steps };
}

/******************************************************************************
                                Run
******************************************************************************/

async function main(): Promise<void> {
  faker.seed(SEED);
  const now = new Date();

  const reference = await dynamo.send(
    new GetCommand({
      TableName: table('PointActivityTypes'),
      Key: { name: 'prospect_created' },
    }),
  );
  if (!reference.Item) {
    console.warn('No point activity types found: run `npm run seed:reference` first, or no points will be awarded.');
  }

  console.log(`Seeding ${TABLE_PREFIX}* in ${AWS_REGION}...`);

  for (const [activity, category, points] of DEV_POINT_CONFIGS) {
    const item: IPointConfigItem = {
      id: faker.string.uuid(),
      activity,
      category,
      points,
      created_at: toUtc(now),
      updated_at: toUtc(now),
    };
    await putNew('PointConfigs', item, 'activity');
  }

  const masterTrainer = person('master_trainer', 0, now);
  const trainers = Array.from({ length: TRAINERS }, (_, i) => person('trainer', i, now));
  const groups: IGroupItem[] = [];
  const members: ISeedUser[] = [];
  const groupTrainers: IGroupTrainerItem[] = [];

  for (let g = 0; g < GROUPS; g++) {
    const groupId = faker.string.uuid();
    const leader = person('group_leader', g, now, groupId);
    const agents = Array.from({ length: AGENTS_PER_GROUP }, (_, i) =>
      person('agent', g * AGENTS_PER_GROUP + i, now, groupId),
    );
    members.push(leader, ...agents);
    const since = toUtc(faker.date.past({ years: 1, refDate: now }));
    groups.push({
      id: groupId,
      name: `${faker.location.city()} ${faker.helpers.arrayElement(['Stars', 'Achievers', 'Legends', 'Champions', 'Power'])}`,
      status: g === GROUPS - 1 ? 'inactive' : 'active',
      leader_id: leader.id,
      created_at: since,
      updated_at: since,
    });
    groupTrainers.push({
      group_id: groupId,
      trainer_id: trainers[g % TRAINERS].id,
      created_at: since,
    });
  }
  // One inactive agent, so screens that hide inactive users have something to hide.
  members[1].status = 'inactive';

  const users = [masterTrainer, ...trainers, ...members];
  await pool(users, async (user) => {
    await putNew('Users', user, 'id');
  });
  await pool(groups, async (group) => {
    await putNew('Groups', group, 'id');
  });
  await pool(groupTrainers, async (link) => {
    await putNew('GroupTrainers', link, 'group_id');
  });

  const codes: IAgentCodeItem[] = [
    ...members.map((member) => ({
      agent_code: member.agent_code!,
      used_flag: 1 as const,
      user_id: member.id,
      created_at: member.created_at,
      updated_at: member.created_at,
    })),
    ...Array.from({ length: UNUSED_AGENT_CODES }, () => ({
      agent_code: nextAgentCode(),
      used_flag: 0 as const,
      created_at: toUtc(now),
      updated_at: toUtc(now),
    })),
  ];
  await pool(codes, async (code) => {
    await putNew('AgentCodes', code, 'agent_code');
  });

  const plans = members.flatMap((member) =>
    Array.from(
      { length: faker.number.int(PROSPECTS_PER_AGENT) },
      () => planProspect(member.id, now),
    ),
  );
  await pool(plans, async ({ item, steps }) => {
    if (!(await putNew('Prospects', item, 'id'))) return;
    for (const step of steps) {
      await setFields('Prospects', { id: item.id }, step);
    }
  });

  const organisers = [masterTrainer, ...trainers];
  const events = Array.from({ length: EVENTS }, () => {
    const start = faker.date.between({ from: addDays(now, -60), to: addDays(now, 45) });
    const organiser = faker.helpers.arrayElement(organisers);
    const targets = faker.helpers.arrayElements(groups, { min: 1, max: 2 }).map((g) => g.id);
    const online = faker.datatype.boolean();
    const event: IEventItem = {
      id: faker.string.uuid(),
      event_title: `${faker.company.buzzNoun()} ${faker.helpers.arrayElement(['Workshop', 'Bootcamp', 'Townhall', 'Briefing'])}`,
      start_date: toUtc(start),
      end_date: toUtc(addHours(start, faker.number.int({ min: 1, max: 4 }))),
      description: faker.lorem.sentence(),
      ...(online
        ? { meeting_link: `https://meet.example.com/${faker.string.alphanumeric(10)}` }
        : { venue: faker.location.streetAddress() }),
      status: start < now ? 'completed' : 'upcoming',
      type: online ? 'Online' : 'Face to Face',
      created_by: organiser.id,
      created_by_role: organiser.role,
      visibility: faker.helpers.arrayElement(['private', 'public']),
      group_ids: targets,
      agent_ids: [],
      created_at: toUtc(addDays(start, -14)),
      updated_at: toUtc(addDays(start, -14)),
    };
    return event;
  });
  await pool(events, async (event) => {
    if (!(await putNew('Events', event, 'id'))) return;
    for (const groupId of event.group_ids) {
      const link: IEventGroupItem = {
        event_id: event.id,
        group_id: groupId,
        status: event.status,
        start_date: event.start_date,
      };
      await putNew('EventGroups', link, 'event_id');
    }
  });

  const activeMembers = members.filter((member) => member.status === 'active');
  const sessions = Array.from({ length: SESSIONS }, () => {
    const start = faker.date.between({ from: addDays(now, -90), to: addDays(now, 30) });
    const host = faker.helpers.arrayElement(trainers);
    const group = faker.helpers.arrayElement(groups);
    const attendees = activeMembers.filter((member) => member.group_id === group.id);
    const past = start < now;
    const attendance: IAttendanceItem[] = attendees.map((member) => {
      const joined = past && faker.number.int({ min: 1, max: 10 }) <= 7;
      const at = toUtc(past ? start : now);
      return {
        id: faker.string.uuid(),
        session_id: '',
        agent_key: member.id,
        agent_id: member.id,
        agent_name: member.name,
        agent_email: member.email,
        group_id: group.id,
        group_name: group.name,
        status: past ? (joined ? 'joined' : 'did_not_attend') : 'pending',
        ...(joined && { joined_at: at }),
        created_at: at,
        updated_at: at,
      };
    });
    const session: ISessionItem = {
      id: faker.string.uuid(),
      coaching_type: faker.helpers.arrayElement(COACHING_TYPES),
      title: `${faker.word.adjective()} ${faker.helpers.arrayElement(['Coaching', 'Circle', 'Clinic', 'Seminar'])}`,
      description: faker.lorem.sentence(),
      start_date: toUtc(start),
      end_date: toUtc(addHours(start, faker.number.float({ min: 1, max: 3, fractionDigits: 1 }))),
      training_mode: faker.helpers.arrayElement(['online', 'face_to_face']),
      status: past ? 'completed' : 'upcoming',
      created_by: host.id,
      created_by_name: host.name,
      created_by_role: host.role,
      group_ids: [group.id],
      agent_ids: [],
      attendance_total: attendance.length,
      attendance_joined: attendance.filter((row) => row.status === 'joined').length,
      created_at: toUtc(addDays(start, -10)),
      updated_at: toUtc(addDays(start, -10)),
    };
    attendance.forEach((row) => (row.session_id = session.id));
    return { session, attendance };
  });
  await pool(sessions, async ({ session, attendance }) => {
    if (!(await putNew('CoachingSessions', session, 'id'))) return;
    const link: ISessionGroupItem = {
      session_id: session.id,
      group_id: session.group_ids[0],
      start_date: session.start_date,
    };
    await putNew('CoachingSessionGroups', link, 'session_id');
    for (const row of attendance) {
      await putNew('CoachingAttendance', row, 'session_id');
    }
  });

  console.log('Created:', created);
  if (Object.keys(skipped).length) console.log('Already present:', skipped);
  console.log('Points and stats follow from the streams within a few seconds.');
}

main().catch((error: unknown) => {
  console.error('Seeding failed:', (error as Error).message);
  process.exit(1);
});

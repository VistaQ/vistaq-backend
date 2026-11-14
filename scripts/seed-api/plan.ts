import { base, en, Faker } from '@faker-js/faker';

import type { components, paths } from './api';

type JsonBody<Operation> = Operation extends {
  requestBody?: { content: { 'application/json': infer Body } };
}
  ? Body
  : never;

export type CreateUserBody = JsonBody<paths['/users']['post']>;
export type UpdateUserBody = JsonBody<paths['/users/{userId}']['put']>;
export type CreateProspectBody = JsonBody<paths['/prospects']['post']>;
export type UpdateProspectBody = JsonBody<
  paths['/prospects/{prospectId}']['put']
>;
export type CreateEventBody = JsonBody<paths['/events']['post']>;
export type CreateSessionBody = JsonBody<paths['/coaching-sessions']['post']>;
export type UploadReportBody = JsonBody<paths['/reports/upload']['post']>;
type MonthName = UploadReportBody['etlResult']['months_detected'][number];

export const SEED = 20261115;
const TRAINERS = 3;
const GROUPS = 5;
const AGENTS_PER_GROUP = 6;
const UNUSED_AGENT_CODES = 10;
const PROSPECTS_PER_AGENT = { min: 6, max: 14 };
const EVENTS = 8;
const SESSIONS = 8;
const FIRST_DAY_AHEAD = 7;
const LAST_DAY_AHEAD = 56;
const MDRT_FYCT = 120_000;
const MDRT_FYC = 60_000;

const GROUP_SUFFIXES = ['Stars', 'Achievers', 'Legends', 'Champions', 'Power'];
const MONTHS: MonthName[] = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
];

export const SEED_EMAIL = /^seed-[a-z0-9-]+@example\.com$/;
export const SEED_AGENT_CODE = /^SEED\d{4}$/;
export const SEED_GROUP_PREFIX = 'Seed ';
export const SEED_TITLE_PREFIX = 'Seed: ';
export const SEED_SOURCE_PREFIX = 'seed-';

export type SeedRole = 'master_trainer' | 'trainer' | 'agent';

export interface IPlanUser {
  email: string;
  name: string;
  role: SeedRole;
  profile: UpdateUserBody;
  group?: number;
  agentCode?: string;
  leader?: boolean;
}

export interface IPlanGroup {
  name: string;
  trainers: string[];
}

export interface IPlanProspect {
  owner: string;
  create: CreateProspectBody;
  steps: UpdateProspectBody[];
}

export interface IPlanEvent {
  organiser: string;
  groups: number[];
  body: Omit<CreateEventBody, 'groupIds' | 'agentIds'>;
}

export interface IPlanSession {
  host: string;
  group: number;
  joiners: string[];
  body: Omit<CreateSessionBody, 'groupIds' | 'agentIds'>;
}

export interface IPlanReport {
  year: number;
  month: number;
  body: UploadReportBody;
}

export interface IPlan {
  users: IPlanUser[];
  groups: IPlanGroup[];
  agentCodes: string[];
  prospects: IPlanProspect[];
  events: IPlanEvent[];
  sessions: IPlanSession[];
  reports: IPlanReport[];
}

export const seedEmail = (role: SeedRole, n: number): string =>
  `seed-${role.replace('_', '-')}-${String(n).padStart(2, '0')}@example.com`;

const agentCode = (n: number) => `SEED${String(n).padStart(4, '0')}`;
const DAY_MS = 24 * 60 * 60 * 1000;
const dayOf = (date: Date) => date.toISOString().slice(0, 10);

export function buildPlan(now: Date): IPlan {
  const faker = new Faker({ locale: [en, base], seed: SEED });

  const person = (role: SeedRole, n: number): IPlanUser => {
    const name = faker.person.fullName();
    const sells = role === 'agent';
    return {
      email: seedEmail(role, n),
      name,
      role,
      profile: {
        location: faker.location.city(),
        phone: faker.phone.number({ style: 'international' }),
        agency: `${faker.company.name()} Agency`,
        ...(sells && {
          sales_target: faker.number.int({ min: 50, max: 200 }) * 1000,
          fyct_target: faker.number.int({ min: 20, max: 80 }) * 1000,
          fyc_target: faker.number.int({ min: 20, max: 80 }) * 1000,
        }),
      },
    };
  };

  const masterTrainer = person('master_trainer', 1);
  const trainers = Array.from({ length: TRAINERS }, (_, i) =>
    person('trainer', i + 1),
  );
  const groups: IPlanGroup[] = Array.from({ length: GROUPS }, (_, g) => ({
    name: `${SEED_GROUP_PREFIX}${faker.location.city()} ${GROUP_SUFFIXES[g]}`,
    trainers: [trainers[g % TRAINERS].email],
  }));
  const agents = Array.from({ length: GROUPS * AGENTS_PER_GROUP }, (_, i) => ({
    ...person('agent', i + 1),
    group: Math.floor(i / AGENTS_PER_GROUP),
    agentCode: agentCode(i + 1),
    leader: i % AGENTS_PER_GROUP === 0,
  }));
  const agentCodes = Array.from(
    { length: agents.length + UNUSED_AGENT_CODES },
    (_, i) => agentCode(i + 1),
  );

  const prospects = agents.flatMap((agent) =>
    Array.from({ length: faker.number.int(PROSPECTS_PER_AGENT) }, () =>
      planProspect(faker, agent.email, now),
    ),
  );

  const groupsOf = (email: string) =>
    groups.flatMap((group, g) => (group.trainers.includes(email) ? [g] : []));
  const allGroups = groups.map((_, g) => g);
  const membersOf = (g: number) =>
    agents.filter((agent) => agent.group === g).map((agent) => agent.email);

  const upcoming = () => {
    const day = faker.number.int({ min: FIRST_DAY_AHEAD, max: LAST_DAY_AHEAD });
    const start = new Date(now.getTime() + day * DAY_MS);
    start.setUTCHours(faker.number.int({ min: 1, max: 9 }), 0, 0, 0);
    const end = new Date(
      start.getTime() + faker.number.int({ min: 1, max: 3 }) * 60 * 60 * 1000,
    );
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  };

  const organisers = [masterTrainer, ...trainers];
  const events: IPlanEvent[] = Array.from({ length: EVENTS }, () => {
    const organiser = faker.helpers.arrayElement(organisers);
    const options =
      organiser.role === 'trainer' ? groupsOf(organiser.email) : allGroups;
    const online = faker.datatype.boolean();
    return {
      organiser: organiser.email,
      groups: faker.helpers.arrayElements(options, {
        min: 1,
        max: Math.min(2, options.length),
      }),
      body: {
        title: `${SEED_TITLE_PREFIX}${faker.company.buzzNoun()} ${faker.helpers.arrayElement(['Workshop', 'Bootcamp', 'Townhall', 'Briefing'])}`,
        ...upcoming(),
        type: online ? 'Online' : 'Face to Face',
        ...(online
          ? {
              link: `https://meet.example.com/${faker.string.alphanumeric(10)}`,
            }
          : { venue: faker.location.streetAddress() }),
        description: faker.lorem.sentence(),
        visibility: faker.helpers.arrayElement(['private', 'public'] as const),
      },
    };
  });

  const coachingTypes: components['schemas']['CoachingTypeEnum'][] = [
    'individual_coaching',
    'group_coaching',
    'peer_circles',
    'seminar',
  ];
  const sessions: IPlanSession[] = Array.from({ length: SESSIONS }, () => {
    const host = faker.helpers.arrayElement(trainers);
    const group = faker.helpers.arrayElement(groupsOf(host.email));
    const members = membersOf(group);
    const online = faker.datatype.boolean();
    return {
      host: host.email,
      group,
      joiners: faker.helpers.arrayElements(members, {
        min: 2,
        max: Math.ceil(members.length / 2),
      }),
      body: {
        coachingType: faker.helpers.arrayElement(coachingTypes),
        title: `${SEED_TITLE_PREFIX}${faker.word.adjective()} ${faker.helpers.arrayElement(['Coaching', 'Circle', 'Clinic', 'Seminar'])}`,
        description: faker.lorem.sentence(),
        ...upcoming(),
        trainingMode: online ? 'online' : 'face_to_face',
        ...(online && {
          link: `https://meet.example.com/${faker.string.alphanumeric(10)}`,
        }),
      },
    };
  });

  return {
    users: [masterTrainer, ...trainers, ...agents],
    groups,
    agentCodes,
    prospects,
    events,
    sessions,
    reports: planReports(faker, agents, now),
  };
}

function planProspect(faker: Faker, owner: string, now: Date): IPlanProspect {
  const create: CreateProspectBody = {
    fullName: faker.person.fullName(),
    phoneNum: faker.phone.number({ style: 'international' }),
    email: faker.internet.email({ provider: 'example.com' }).toLowerCase(),
  };
  const path = faker.helpers.weightedArrayElement([
    { weight: 45, value: 'prospect' },
    { weight: 30, value: 'appointment' },
    { weight: 25, value: 'sales' },
  ]);
  if (path === 'prospect') return { owner, create, steps: [] };

  const dayOffset =
    path === 'sales'
      ? faker.number.int({ min: -21, max: -1 })
      : faker.number.int({ min: -21, max: 21 });
  const steps: UpdateProspectBody[] = [
    {
      currentStage: 'appointment',
      appointmentDate: dayOf(new Date(now.getTime() + dayOffset * DAY_MS)),
      appointmentStartTime: '10:00',
      appointmentEndTime: '11:00',
      appointmentLocation: faker.location.streetAddress(),
      appointmentStatus: 'scheduled',
    },
  ];

  if (path === 'appointment') {
    if (dayOffset < 0) {
      steps.push({
        appointmentStatus: faker.helpers.arrayElement([
          'done',
          'rescheduled',
          'declined',
          'kiv',
        ] as const),
      });
    }
    return { owner, create, steps };
  }

  steps.push({ currentStage: 'sales', appointmentStatus: 'done' });
  const outcome = faker.helpers.weightedArrayElement([
    { weight: 60, value: 'successful' as const },
    { weight: 25, value: 'kiv' as const },
    { weight: 15, value: 'unsuccessful' as const },
  ]);
  steps.push({
    salesMeetingStages: faker.helpers.arrayElements(
      ['social', 'factFind', 'presentation'] as const,
      { min: 1, max: 3 },
    ),
    salesOutcome: outcome,
    ...(outcome === 'successful' && {
      products: Array.from(
        { length: faker.number.int({ min: 1, max: 3 }) },
        () => ({
          productName: faker.commerce.productName(),
          amount: faker.number.int({ min: 1, max: 50 }) * 1000,
        }),
      ),
    }),
    ...(outcome === 'unsuccessful' && {
      unsuccessfulReason: faker.helpers.arrayElement([
        'Budget constraints',
        'Went with a competitor',
        'Not interested',
      ]),
    }),
  });
  return { owner, create, steps };
}

function planReports(
  faker: Faker,
  agents: IPlanUser[],
  now: Date,
): IPlanReport[] {
  const year = now.getUTCFullYear();
  const lastMonth = now.getUTCMonth();
  const monthly = agents.map(() =>
    MONTHS.map(() => ({
      ace: faker.number.int({ min: 0, max: 30 }) * 500,
      noc: faker.number.int({ min: 0, max: 4 }),
      acs: faker.number.int({ min: 0, max: 30 }) * 500,
      fyct: faker.number.int({ min: 0, max: 12 }) * 500,
      fyc: faker.number.int({ min: 0, max: 10 }) * 500,
    })),
  );
  const percent = (value: number, target: number | null | undefined) =>
    target ? Math.round((value / target) * 1000) / 10 : 0;

  return Array.from({ length: lastMonth }, (_, m) => {
    const month = m + 1;
    const records = agents.map((agent, a) => {
      const months = monthly[a].slice(0, month);
      const sum = (key: keyof (typeof months)[number]) =>
        months.reduce((total, row) => total + row[key], 0);
      const fyct = sum('fyct');
      const fyc = sum('fyc');
      const rowData: Record<string, unknown> = {
        'AGENT CODE': agent.agentCode,
        'AGENT NAME': agent.name,
        'ACE (YTD)': sum('ace'),
        'NOC (YTD)': sum('noc'),
        'ACS (YTD)': sum('acs'),
        'FYCT (YTD)': fyct,
        '% FYCT (YTD)': percent(fyct, agent.profile.fyct_target),
        'MDRT SHORTAGE FYCT': Math.max(0, MDRT_FYCT - fyct),
        'FYC (YTD)': fyc,
        '% FYC (YTD)': percent(fyc, agent.profile.fyc_target),
        'MDRT SHORTAGE FYC': Math.max(0, MDRT_FYC - fyc),
      };
      months.forEach((row, i) => {
        rowData[`${MONTHS[i]} ACE`] = row.ace;
        rowData[`${MONTHS[i]} NOC`] = row.noc;
        rowData[`${MONTHS[i]} ACS`] = row.acs;
      });
      return { agentCode: agent.agentCode!, rowData };
    });
    return {
      year,
      month,
      body: {
        report_year: year,
        report_month: month,
        etlResult: {
          source: `${SEED_SOURCE_PREFIX}sales-${year}-${String(month).padStart(2, '0')}.xlsx`,
          created_at: now.toISOString(),
          rows_loaded: records.length,
          months_detected: MONTHS.slice(0, month),
          records,
        },
      },
    };
  });
}

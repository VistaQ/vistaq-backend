import { describe, expect, it } from 'vitest';

import {
  buildPlan,
  SEED_AGENT_CODE,
  SEED_EMAIL,
  SEED_GROUP_PREFIX,
  SEED_SOURCE_PREFIX,
  SEED_TITLE_PREFIX,
} from '../../../scripts/seed-api/plan';

const now = new Date('2026-11-15T08:30:00.000Z');
const plan = buildPlan(now);

describe('buildPlan', () => {
  it('gives the same plan for the same seed and time', () => {
    expect(buildPlan(now)).toEqual(plan);
  });

  it('marks every user, group, agent code, title and report source', () => {
    for (const user of plan.users) expect(user.email).toMatch(SEED_EMAIL);
    for (const group of plan.groups) {
      expect(group.name.startsWith(SEED_GROUP_PREFIX)).toBe(true);
    }
    for (const code of plan.agentCodes) expect(code).toMatch(SEED_AGENT_CODE);
    for (const { body } of [...plan.events, ...plan.sessions]) {
      expect(body.title.startsWith(SEED_TITLE_PREFIX)).toBe(true);
    }
    for (const { body } of plan.reports) {
      expect(body.etlResult.source.startsWith(SEED_SOURCE_PREFIX)).toBe(true);
    }
  });

  it('starts every event and session in the future', () => {
    for (const { body } of [...plan.events, ...plan.sessions]) {
      expect(new Date(body.startDate).getTime()).toBeGreaterThan(now.getTime());
      expect(body.endDate > body.startDate).toBe(true);
    }
  });

  it('gives each group one leader and uses only planned agent codes', () => {
    const agents = plan.users.filter((user) => user.role === 'agent');
    plan.groups.forEach((_, g) => {
      const leaders = agents.filter((a) => a.group === g && a.leader);
      expect(leaders).toHaveLength(1);
    });
    const used = agents.map((agent) => agent.agentCode);
    expect(new Set(used).size).toBe(agents.length);
    for (const code of used) expect(plan.agentCodes).toContain(code);
    expect(plan.agentCodes.length).toBeGreaterThan(agents.length);
  });

  it('acts only as owners the API allows', () => {
    const emails = new Set(plan.users.map((user) => user.email));
    const roleOf = (email: string) =>
      plan.users.find((user) => user.email === email)?.role;
    const trainerGroups = (email: string) =>
      plan.groups.flatMap((group, g) => (group.trainers.includes(email) ? [g] : []));

    for (const prospect of plan.prospects) {
      expect(roleOf(prospect.owner)).toBe('agent');
    }
    for (const event of plan.events) {
      if (roleOf(event.organiser) === 'trainer') {
        for (const g of event.groups) {
          expect(trainerGroups(event.organiser)).toContain(g);
        }
      }
    }
    for (const session of plan.sessions) {
      expect(trainerGroups(session.host)).toContain(session.group);
      for (const joiner of session.joiners) {
        expect(emails.has(joiner)).toBe(true);
        expect(plan.users.find((u) => u.email === joiner)?.group).toBe(
          session.group,
        );
      }
    }
  });

  it('uploads one report per finished month, in order', () => {
    expect(plan.reports.map((report) => report.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    const october = plan.reports[9].body.etlResult;
    expect(october.months_detected).toHaveLength(10);
    const row = october.records[0].rowData;
    const monthlyAce = october.months_detected.reduce(
      (total, month) => total + (row[`${month} ACE`] as number),
      0,
    );
    expect(row['ACE (YTD)']).toBe(monthlyAce);
  });
});

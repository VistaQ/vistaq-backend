import { describe, expect, it } from 'vitest';

import {
  updateCoachingSessionSchema,
} from '@src/routes/coachingSession.routes';
import { updateEventSchema } from '@src/routes/event.routes';
import {
  createGroupSchema,
  updateGroupSchema,
} from '@src/routes/group.routes';

// A real sub from the dev user pool: hex in 8-4-4-4-12 groups, but its variant
// nibble (3) is not one RFC 4122 allows.
const COGNITO_SUB = '552df5a8-4051-7069-30ad-629029c1d313';

describe('user id fields accept Cognito subs', () => {
  it('accepts a sub as group leader, trainer and member', () => {
    expect(
      createGroupSchema.safeParse({
        name: 'Kuala Lumpur Stars',
        leader_id: COGNITO_SUB,
        trainer_ids: [COGNITO_SUB],
      }).success,
    ).toBe(true);
    expect(
      updateGroupSchema.safeParse({
        leader_id: COGNITO_SUB,
        trainer_ids: [COGNITO_SUB],
        member_ids: [COGNITO_SUB],
      }).success,
    ).toBe(true);
  });

  it('accepts a sub among event and coaching session agents', () => {
    expect(updateEventSchema.safeParse({ agentIds: [COGNITO_SUB] }).success).toBe(
      true,
    );
    expect(
      updateCoachingSessionSchema.safeParse({ agentIds: [COGNITO_SUB] }).success,
    ).toBe(true);
  });

  it('still rejects a value that is not an id', () => {
    expect(
      createGroupSchema.safeParse({ name: 'G', trainer_ids: ['trainer-1'] })
        .success,
    ).toBe(false);
    expect(updateEventSchema.safeParse({ agentIds: ['agent-1'] }).success).toBe(
      false,
    );
  });
});

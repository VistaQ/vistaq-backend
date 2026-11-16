import coachingSessionRepository from '@src/repositories/coachingSession.repository';
import pointActivityTypeRepository from '@src/repositories/pointActivityType.repository';
import pointConfigRepository from '@src/repositories/pointConfig.repository';
import pointTransactionRepository from '@src/repositories/pointTransaction.repository';
import type { PointCategory } from '@src/types/agentPoints.types';
import type { IStreamChange } from '@src/types/stream.types';
import { handleServiceError } from '@src/utils/errorHandlers';

/******************************************************************************
                            Types
******************************************************************************/

interface IPendingAward {
  activity: string;
  userId: string;
  subjectId: string;
  subjectLabel?: string;
  hours?: number;
}

const COACHING_TYPE_ACTIVITY: Record<string, string> = {
  individual_coaching: 'coaching_individual_attended',
  group_coaching: 'coaching_group_attended',
  peer_circles: 'coaching_peer_circles_attended',
  seminar_attended: 'seminar_attended',
};

const HOUR_MS = 60 * 60 * 1000;

/******************************************************************************
                            Activity detection
******************************************************************************/

// Ported from the award-points edge function: one activity per change, in
// this order, so an update that sets an appointment and closes a sale at once
// awards only the appointment, as before.
export function detectProspectActivity(change: IStreamChange): string | null {
  if (change.eventName === 'REMOVE') return 'prospect_deleted';
  if (change.eventName === 'INSERT') return 'prospect_created';

  const before = change.oldImage ?? {};
  const after = change.newImage ?? {};
  if (
    before.appointment_status !== 'scheduled' &&
    after.appointment_status === 'scheduled'
  ) {
    return 'appointment_set';
  }
  if (
    before.appointment_status !== 'done' &&
    after.appointment_status === 'done'
  ) {
    return 'sales_meeting';
  }
  if (!before.sales_completed_at && after.sales_completed_at) {
    return 'sale_closed';
  }
  return null;
}

export function isAttendanceJoin(change: IStreamChange): boolean {
  if (change.newImage?.status !== 'joined') return false;
  return (
    change.eventName === 'INSERT' ||
    (change.eventName === 'MODIFY' && change.oldImage?.status !== 'joined')
  );
}

/** Whole hours, rounded up; null when the dates are unusable or not increasing. */
export function sessionHours(
  startDate: string,
  endDate: string,
): number | null {
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return Math.ceil((end - start) / HOUR_MS);
}

/******************************************************************************
                            AwardPointsService
******************************************************************************/

class AwardPointsService {
  async handleProspectChange(change: IStreamChange): Promise<void> {
    try {
      const activity = detectProspectActivity(change);
      if (!activity) return;

      const row =
        (change.eventName === 'REMOVE' ? change.oldImage : change.newImage) ??
        {};
      if (typeof row.agent_id !== 'string' || typeof row.id !== 'string')
        return;

      await this.award({
        activity,
        userId: row.agent_id,
        subjectId: row.id,
        subjectLabel:
          typeof row.prospect_name === 'string' ? row.prospect_name : undefined,
      });
    } catch (error) {
      return handleServiceError(
        'AwardPointsService.handleProspectChange',
        error,
      );
    }
  }

  async handleAttendanceChange(change: IStreamChange): Promise<void> {
    try {
      if (!isAttendanceJoin(change)) return;
      const row = change.newImage ?? {};
      if (
        typeof row.agent_id !== 'string' ||
        typeof row.id !== 'string' ||
        typeof row.session_id !== 'string'
      ) {
        return;
      }

      const session = await coachingSessionRepository.findById(row.session_id);
      if (!session) return;
      const activity = COACHING_TYPE_ACTIVITY[session.coaching_type];
      const hours = sessionHours(session.start_date, session.end_date);
      // Unknown coaching types and invalid durations award nothing; the spec's
      // warning for them waits for the logging replacement (see logging.md).
      if (!activity || hours === null) return;

      // The attendance row is the subject, so each attendee of a session gets
      // their own award.
      await this.award({
        activity,
        userId: row.agent_id,
        subjectId: row.id,
        subjectLabel: session.title,
        hours,
      });
    } catch (error) {
      return handleServiceError(
        'AwardPointsService.handleAttendanceChange',
        error,
      );
    }
  }

  private async award(pending: IPendingAward): Promise<void> {
    try {
      const [activityType, config] = await Promise.all([
        pointActivityTypeRepository.findByName(pending.activity),
        pointConfigRepository.findByActivity(pending.activity),
      ]);
      // A missing type or config awards nothing (the spec's error log for it
      // waits for the logging replacement).
      if (!activityType || !config) return;

      let points = config.points * (pending.hours ?? 1);
      if (pending.activity === 'prospect_deleted') {
        const guards = await pointTransactionRepository.findGuards(
          pending.subjectId,
        );
        const awarded = guards
          .filter((guard) => guard.subject_type === 'prospect')
          .reduce((sum, guard) => sum + guard.points, 0);
        if (awarded <= 0) return;
        points = -awarded;
      }

      await pointTransactionRepository.awardOnce({
        user_id: pending.userId,
        activity: pending.activity,
        category: config.category as PointCategory,
        points,
        subject_type: activityType.subject_type,
        subject_id: pending.subjectId,
        subject_label: pending.subjectLabel,
      });
    } catch (error) {
      return handleServiceError('AwardPointsService.award', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const awardPointsService = new AwardPointsService();
export default awardPointsService;

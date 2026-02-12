/**
 * Event Controller - Handle event/meetup CRUD operations
 *
 * Events are training-related meetups (coffee hangouts, training sessions, etc.)
 * assigned to one or more groups.
 *
 * Permission summary:
 *   Create  — Admin, Master Trainer, Trainer (own managed groups only), Group Leader (own group only)
 *   Read    — Admin (all), Trainer (managed groups), Group Leader/Agent (own group)
 *   Update  — Admin (any), Creator (own event)
 *   Delete  — Admin (any), Creator (own event)
 */
import { Request, Response } from 'express';
import * as admin from 'firebase-admin';

import HttpStatusCodes from '@src/common/constants/HttpStatusCodes';
import { db } from '@src/config/firebase';
import {
  CreateEventRequest,
  CreateEventResponse,
  DeleteEventResponse,
  Event,
  EventCreatorRole,
  GetAllEventsQuery,
  GetEventResponse,
  GetEventsResponse,
  UpdateEventRequest,
  UpdateEventResponse,
} from '@src/types/events.types';

const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

const EVENTS_COLLECTION = 'events';
const GROUPS_COLLECTION = 'groups';

// Roles that are permitted to create events
const EVENT_CREATOR_ROLES: EventCreatorRole[] = [
  'admin',
  'master_trainer',
  'trainer',
  'group_leader',
];

/******************************************************************************
                            Helper Functions
******************************************************************************/

/**
 * Validate a URL string (used for optional meetingLink field).
 * Returns true for null/undefined (field is optional).
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch multiple group documents and return a map of { id → name }.
 * Returns null for the first groupId that does not exist.
 */
async function fetchGroupNames(
  groupIds: string[],
): Promise<Map<string, string> | null> {
  const nameMap = new Map<string, string>();

  for (const groupId of groupIds) {
    const groupDoc = await db.collection(GROUPS_COLLECTION).doc(groupId).get();

    if (!groupDoc.exists) {
      return null; // Signal that a group was not found
    }

    nameMap.set(groupId, (groupDoc.data()?.name as string) || groupId);
  }

  return nameMap;
}

/**
 * Determine whether the authenticated user can view a given event.
 */
function canViewEvent(
  user: admin.firestore.DocumentData,
  eventGroupIds: string[],
): boolean {
  // Admin and Master Trainer can view any event
  if (user.role === 'admin' || user.role === 'master_trainer') return true;

  // Trainers can view events for any of their managed groups
  if (user.role === 'trainer') {
    const managedIds: string[] = user.managedGroupIds || [];
    return eventGroupIds.some((gid) => managedIds.includes(gid));
  }

  // Group Leaders and Agents can view events that include their group
  if (user.groupId) {
    return eventGroupIds.includes(user.groupId as string);
  }

  return false;
}

/******************************************************************************
                            Controller Functions
******************************************************************************/

/**
 * Create a new event
 * POST /events
 * Accessible by: Admin, Master Trainer, Trainer, Group Leader
 */
export async function createEvent(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Not authenticated',
      });
      return;
    }

    // Only designated roles can create events
    if (!EVENT_CREATOR_ROLES.includes(req.user.role as EventCreatorRole)) {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'Only admins, master trainers, trainers, and group leaders can create events',
      });
      return;
    }

    const { eventTitle, date, venue, meetingLink, description, groupIds } =
      req.body as CreateEventRequest;

    // -------------------------------------------------------------------------
    // Validate required fields
    // -------------------------------------------------------------------------

    if (!eventTitle || eventTitle.trim().length < 3) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'eventTitle is required and must be at least 3 characters',
      });
      return;
    }

    if (!date) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'date is required',
      });
      return;
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'date must be a valid ISO 8601 date string',
      });
      return;
    }

    if (!venue || venue.trim().length < 3) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'venue is required and must be at least 3 characters',
      });
      return;
    }

    if (!description || description.trim().length < 10) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'description is required and must be at least 10 characters',
      });
      return;
    }

    if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'groupIds is required and must be a non-empty array',
      });
      return;
    }

    if (meetingLink && !isValidUrl(meetingLink)) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'meetingLink must be a valid URL',
      });
      return;
    }

    // -------------------------------------------------------------------------
    // Trainers can only create events for their own managed groups
    // -------------------------------------------------------------------------

    if (req.user.role === 'trainer' || req.user.role === 'master_trainer') {
      const managedIds: string[] = req.user.managedGroupIds || [];
      const unauthorizedGroup = groupIds.find(
        (gid) => !managedIds.includes(gid),
      );

      if (unauthorizedGroup) {
        res.status(HttpStatusCodes.FORBIDDEN).json({
          error: `You do not manage group "${unauthorizedGroup}". Trainers can only create events for their managed groups.`,
        });
        return;
      }
    }

    // -------------------------------------------------------------------------
    // Group Leaders can only create events for their own group
    // -------------------------------------------------------------------------

    if (req.user.role === 'group_leader') {
      const unauthorizedGroup = groupIds.find(
        (gid) => gid !== req.user!.groupId,
      );

      if (unauthorizedGroup) {
        res.status(HttpStatusCodes.FORBIDDEN).json({
          error: 'Group leaders can only create events for their own group.',
        });
        return;
      }
    }

    // -------------------------------------------------------------------------
    // Verify all groups exist and collect their names (denormalization)
    // -------------------------------------------------------------------------

    console.log(`[CreateEvent] Verifying ${groupIds.length} group(s)...`);

    const groupNameMap = await fetchGroupNames(groupIds);

    if (!groupNameMap) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'One or more groups not found',
      });
      return;
    }

    const groupNames = groupIds.map((gid) => groupNameMap.get(gid)!);

    // -------------------------------------------------------------------------
    // Build and persist the event document
    // -------------------------------------------------------------------------

    const eventData = {
      eventTitle: eventTitle.trim(),
      date: Timestamp.fromDate(parsedDate),
      venue: venue.trim(),
      meetingLink: meetingLink?.trim() || null,
      description: description.trim(),

      groupIds,
      groupNames,

      createdBy: req.user.uid,
      createdByName: req.user.name,
      createdByRole: req.user.role as EventCreatorRole,

      status: 'upcoming' as const,

      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const eventRef = await db.collection(EVENTS_COLLECTION).add(eventData);

    console.log(
      `[CreateEvent] Event ${eventRef.id} created by ${req.user.uid} for groups: ${groupIds.join(', ')}`,
    );

    const response: CreateEventResponse = {
      success: true,
      eventId: eventRef.id,
      message: 'Event created successfully',
    };

    res.status(HttpStatusCodes.CREATED).json(response);
  } catch (error) {
    console.error('[CreateEvent] Error:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to create event',
    });
  }
}

/**
 * Get upcoming events for the authenticated user's groups
 * GET /events/my-events
 * Accessible by: All authenticated users
 *
 * NOTE: This route must be registered BEFORE /events/:eventId in the router
 * to prevent Express from treating "my-events" as an eventId parameter.
 */
export async function getMyEvents(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Not authenticated',
      });
      return;
    }

    const { uid, role, groupId } = req.user;
    const managedGroupIds: string[] = req.user.managedGroupIds || [];

    console.log(
      `[GetMyEvents] Fetching upcoming events for user ${uid} (${role})...`,
    );

    let query: admin.firestore.Query = db.collection(EVENTS_COLLECTION);

    if (role === 'admin' || role === 'master_trainer') {
      // Admin and Master Trainer see all upcoming events across the system
      query = query.where('status', '==', 'upcoming');
    } else if (role === 'trainer') {
      if (managedGroupIds.length === 0) {
        // Trainer has no managed groups — return empty list
        const response: GetEventsResponse = { events: [] };
        res.status(HttpStatusCodes.OK).json(response);
        return;
      }

      // Firestore array-contains-any supports up to 10 values
      const queryGroupIds = managedGroupIds.slice(0, 10);

      if (managedGroupIds.length > 10) {
        console.warn(
          `[GetMyEvents] Trainer ${uid} manages ${managedGroupIds.length} groups; querying first 10 only`,
        );
      }

      query = query
        .where('groupIds', 'array-contains-any', queryGroupIds)
        .where('status', '==', 'upcoming');
    } else {
      // Group Leader, Agent — filter by their own groupId
      if (!groupId) {
        // User has no group assignment
        const response: GetEventsResponse = { events: [] };
        res.status(HttpStatusCodes.OK).json(response);
        return;
      }

      query = query
        .where('groupIds', 'array-contains', groupId)
        .where('status', '==', 'upcoming');
    }

    // Return events in chronological order (earliest first)
    query = query.orderBy('date', 'asc');

    const snapshot = await query.get();

    const events: Event[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Event[];

    console.log(`[GetMyEvents] Found ${events.length} upcoming event(s)`);

    const response: GetEventsResponse = { events };
    res.status(HttpStatusCodes.OK).json(response);
  } catch (error) {
    console.error('[GetMyEvents] Error:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch events',
    });
  }
}

/**
 * Get all events (with optional filters)
 * GET /events
 * Accessible by: Admin only
 *
 * Query params:
 *   status  — "upcoming" | "completed" | "cancelled"
 *   groupId — Firestore group document ID
 */
export async function getAllEvents(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Not authenticated',
      });
      return;
    }

    if (req.user.role !== 'admin') {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'Only administrators can access all events',
      });
      return;
    }

    const { status, groupId } = req.query as GetAllEventsQuery;

    console.log(
      `[GetAllEvents] Admin ${req.user.uid} querying events (status=${status ?? 'any'}, groupId=${groupId ?? 'any'})...`,
    );

    let query: admin.firestore.Query = db.collection(EVENTS_COLLECTION);

    if (status) {
      query = query.where('status', '==', status);
    }

    if (groupId) {
      query = query.where('groupIds', 'array-contains', groupId);
    }

    // Most recent events first
    query = query.orderBy('date', 'desc');

    const snapshot = await query.get();

    const events: Event[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Event[];

    console.log(`[GetAllEvents] Found ${events.length} event(s)`);

    const response: GetEventsResponse = { events };
    res.status(HttpStatusCodes.OK).json(response);
  } catch (error) {
    console.error('[GetAllEvents] Error:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch events',
    });
  }
}

/**
 * Get a specific event by ID
 * GET /events/:eventId
 * Accessible by: All authenticated users (with role-based restrictions)
 */
export async function getEvent(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Not authenticated',
      });
      return;
    }

    const eventId = Array.isArray(req.params.eventId)
      ? req.params.eventId[0]
      : req.params.eventId;

    if (!eventId) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Event ID is required',
      });
      return;
    }

    console.log(
      `[GetEvent] User ${req.user.uid} requesting event ${eventId}...`,
    );

    const eventDoc = await db.collection(EVENTS_COLLECTION).doc(eventId).get();

    if (!eventDoc.exists) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'Event not found',
      });
      return;
    }

    const event = { id: eventDoc.id, ...eventDoc.data() } as Event;

    if (!canViewEvent(req.user, event.groupIds)) {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'You do not have permission to view this event',
      });
      return;
    }

    const response: GetEventResponse = { event };
    res.status(HttpStatusCodes.OK).json(response);
  } catch (error) {
    console.error('[GetEvent] Error:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch event',
    });
  }
}

/**
 * Update an event
 * PUT /events/:eventId
 * Accessible by: Admin (any event), Creator (own event)
 */
export async function updateEvent(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Not authenticated',
      });
      return;
    }

    const eventId = Array.isArray(req.params.eventId)
      ? req.params.eventId[0]
      : req.params.eventId;

    if (!eventId) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Event ID is required',
      });
      return;
    }

    console.log(
      `[UpdateEvent] User ${req.user.uid} updating event ${eventId}...`,
    );

    const eventDoc = await db.collection(EVENTS_COLLECTION).doc(eventId).get();

    if (!eventDoc.exists) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'Event not found',
      });
      return;
    }

    const existingEvent = { id: eventDoc.id, ...eventDoc.data() } as Event;

    // Permission check: admin can update any event; others only their own
    const isAdmin = req.user.role === 'admin';
    const isCreator = existingEvent.createdBy === req.user.uid;

    if (!isAdmin && !isCreator) {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'You do not have permission to update this event',
      });
      return;
    }

    const {
      eventTitle,
      date,
      venue,
      meetingLink,
      description,
      groupIds,
      status,
    } = req.body as UpdateEventRequest;

    // Ensure at least one field is provided
    if (
      eventTitle === undefined &&
      date === undefined &&
      venue === undefined &&
      meetingLink === undefined &&
      description === undefined &&
      groupIds === undefined &&
      status === undefined
    ) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'At least one field to update is required',
      });
      return;
    }

    const updates: Record<string, unknown> = {};

    // Validate and apply each provided field
    if (eventTitle !== undefined) {
      if (eventTitle.trim().length < 3) {
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          error: 'eventTitle must be at least 3 characters',
        });
        return;
      }
      updates.eventTitle = eventTitle.trim();
    }

    if (date !== undefined) {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          error: 'date must be a valid ISO 8601 date string',
        });
        return;
      }
      updates.date = Timestamp.fromDate(parsedDate);
    }

    if (venue !== undefined) {
      if (venue.trim().length < 3) {
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          error: 'venue must be at least 3 characters',
        });
        return;
      }
      updates.venue = venue.trim();
    }

    if (meetingLink !== undefined) {
      if (meetingLink && !isValidUrl(meetingLink)) {
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          error: 'meetingLink must be a valid URL',
        });
        return;
      }
      updates.meetingLink = meetingLink?.trim() || null;
    }

    if (description !== undefined) {
      if (description.trim().length < 10) {
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          error: 'description must be at least 10 characters',
        });
        return;
      }
      updates.description = description.trim();
    }

    if (status !== undefined) {
      const validStatuses = ['upcoming', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          error: 'status must be "upcoming", "completed", or "cancelled"',
        });
        return;
      }
      updates.status = status;
    }

    if (groupIds !== undefined) {
      if (!Array.isArray(groupIds) || groupIds.length === 0) {
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          error: 'groupIds must be a non-empty array',
        });
        return;
      }

      // Trainers can only reassign events to their own managed groups
      if (req.user.role === 'trainer' || req.user.role === 'master_trainer') {
        const managedIds: string[] = req.user.managedGroupIds || [];
        const unauthorizedGroup = groupIds.find(
          (gid) => !managedIds.includes(gid),
        );

        if (unauthorizedGroup) {
          res.status(HttpStatusCodes.FORBIDDEN).json({
            error: `You do not manage group "${unauthorizedGroup}"`,
          });
          return;
        }
      }

      // Verify all groups exist and collect names for denormalization
      const groupNameMap = await fetchGroupNames(groupIds);

      if (!groupNameMap) {
        res.status(HttpStatusCodes.NOT_FOUND).json({
          error: 'One or more groups not found',
        });
        return;
      }

      updates.groupIds = groupIds;
      updates.groupNames = groupIds.map((gid) => groupNameMap.get(gid)!);
    }

    updates.updatedAt = FieldValue.serverTimestamp();

    await db.collection(EVENTS_COLLECTION).doc(eventId).update(updates);

    console.log(`[UpdateEvent] Event ${eventId} updated by ${req.user.uid}`);

    const response: UpdateEventResponse = {
      success: true,
      message: 'Event updated successfully',
    };

    res.status(HttpStatusCodes.OK).json(response);
  } catch (error) {
    console.error('[UpdateEvent] Error:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to update event',
    });
  }
}

/**
 * Delete an event
 * DELETE /events/:eventId
 * Accessible by: Admin (any event), Creator (own event)
 */
export async function deleteEvent(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Not authenticated',
      });
      return;
    }

    const eventId = Array.isArray(req.params.eventId)
      ? req.params.eventId[0]
      : req.params.eventId;

    if (!eventId) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Event ID is required',
      });
      return;
    }

    console.log(
      `[DeleteEvent] User ${req.user.uid} deleting event ${eventId}...`,
    );

    const eventDoc = await db.collection(EVENTS_COLLECTION).doc(eventId).get();

    if (!eventDoc.exists) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'Event not found',
      });
      return;
    }

    const existingEvent = eventDoc.data() as Event;

    // Permission check: admin can delete any event; others only their own
    const isAdmin = req.user.role === 'admin';
    const isCreator = existingEvent.createdBy === req.user.uid;

    if (!isAdmin && !isCreator) {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'You do not have permission to delete this event',
      });
      return;
    }

    await db.collection(EVENTS_COLLECTION).doc(eventId).delete();

    console.log(`[DeleteEvent] Event ${eventId} deleted by ${req.user.uid}`);
    console.log(
      `[AUDIT] User ${req.user.uid} (${req.user.role}) deleted event ${eventId} ("${existingEvent.eventTitle}")`,
    );

    const response: DeleteEventResponse = {
      success: true,
      message: 'Event deleted successfully',
    };

    res.status(HttpStatusCodes.OK).json(response);
  } catch (error) {
    console.error('[DeleteEvent] Error:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to delete event',
    });
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export default {
  createEvent,
  getMyEvents,
  getAllEvents,
  getEvent,
  updateEvent,
  deleteEvent,
};

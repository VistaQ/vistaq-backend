/**
 * Event/Meetup-related TypeScript types
 */
import { Timestamp } from 'firebase-admin/firestore';

export type EventStatus = 'upcoming' | 'completed' | 'cancelled';
export type EventCreatorRole = 'admin' | 'master_trainer' | 'trainer' | 'group_leader';

export interface Event {
  id: string;

  // Event details
  eventTitle: string;
  date: Timestamp;
  venue: string;
  meetingLink: string | null;
  description: string;

  // Groups this event is assigned to
  groupIds: string[];
  groupNames: string[]; // Denormalized for quick display

  // Creator info (denormalized)
  createdBy: string;
  createdByName: string;
  createdByRole: EventCreatorRole;

  // Lifecycle
  status: EventStatus;

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateEventRequest {
  eventTitle: string;
  date: string; // ISO 8601 format
  venue: string;
  meetingLink?: string;
  description: string;
  groupIds: string[];
}

export interface UpdateEventRequest {
  eventTitle?: string;
  date?: string; // ISO 8601 format
  venue?: string;
  meetingLink?: string;
  description?: string;
  groupIds?: string[];
  status?: EventStatus;
}

export interface CreateEventResponse {
  success: boolean;
  eventId: string;
  message: string;
}

export interface UpdateEventResponse {
  success: boolean;
  message: string;
}

export interface DeleteEventResponse {
  success: boolean;
  message: string;
}

export interface GetEventResponse {
  event: Event;
}

export interface GetEventsResponse {
  events: Event[];
}

export interface GetAllEventsQuery {
  status?: EventStatus;
  groupId?: string;
}

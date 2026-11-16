import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export const RUNS_DIR = join(__dirname, '.runs');

export const runRecordPath = (stage: string): string =>
  join(RUNS_DIR, `${stage}.json`);

export interface IRunRecord {
  stage: string;
  startedAt: string;
  users: { email: string; id: string; role: string }[];
  groups: string[];
  prospects: string[];
  events: string[];
  sessions: string[];
  batches: string[];
}

type IdList = 'groups' | 'prospects' | 'events' | 'sessions' | 'batches';

/** Saved after every create, so a run that stops part way can be reset. */
export class RunRecord {
  private readonly data: IRunRecord;

  public constructor(
    private readonly path: string,
    stage: string,
    startedAt: string,
  ) {
    this.data = {
      stage,
      startedAt,
      users: [],
      groups: [],
      prospects: [],
      events: [],
      sessions: [],
      batches: [],
    };
    this.save();
  }

  public addUser(email: string, id: string, role: string): void {
    this.data.users.push({ email, id, role });
    this.save();
  }

  public add(list: IdList, id: string): void {
    this.data[list].push(id);
    this.save();
  }

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, `${JSON.stringify(this.data, null, 2)}\n`);
  }
}

export function readRunRecord(path: string): IRunRecord | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as IRunRecord;
}

export const recordedIds = (record: IRunRecord): string[] => [
  ...record.users.map((user) => user.id),
  ...record.groups,
  ...record.prospects,
  ...record.events,
  ...record.sessions,
  ...record.batches,
];

import path from 'path';
import request from 'supertest';

import app from '@src/app';
import salesReportYtdRepository from '@src/repositories/salesReportYtd.repository';
import supabaseService from '@src/services/supabase.service';

/******************************************************************************
  Integration — sales-points awarding + reversal
******************************************************************************/

// Credentials are sourced from the seed manifest written by scripts/bootstrap.js.
// Run `npx supabase db reset && node scripts/bootstrap.js` to regenerate.
const manifest = require(path.join(__dirname, '../../scripts/seed-manifest.json')) as {
  tenantId: string;
  tenantSlug: string;
  password: string;
  users: Record<
    string,
    { id: string; email: string; role: string; agentCode?: string; groupId?: string }
  >;
};

const TENANT_ID = manifest.tenantId;
const TENANT_SLUG = manifest.tenantSlug;
const GL_EMAIL = manifest.users.mdrt_stars_leader.email;
const GL_PASSWORD = manifest.password;

const AG009_ID = manifest.users.mdrt_stars_agent.id; // AG009
const AG010_ID = manifest.users.kpi_busters_agent.id; // AG010

let glToken: string | null = null;

/** Track every batch_id created during the suite so afterAll can clean up. */
const trackedBatchIds: string[] = [];

/******************************************************************************
  Fixture builder
******************************************************************************/

/**
 * Builds a minimal ETL payload for a given month and per-agent (ace, noc, fyct)
 * tuples. The MTD ACE/NOC for that month and the YTD totals are the only
 * fields the awarding service needs — everything else is filled with sane
 * defaults. FYCT here is the YTD value for the report month.
 */
function fixtureEtl(
  reportMonthName: string,
  reportMonthNum: number,
  rows: { agentCode: string; mtdAce: number; mtdNoc: number; ytdFyct: number }[],
) {
  return {
    source: `Integration_${reportMonthName}.xlsx`,
    created_at: '2026-06-01T00:00:00Z',
    rows_loaded: rows.length,
    months_detected: [reportMonthName],
    records: rows.map((r) => ({
      agentCode: r.agentCode,
      rowData: {
        'ACE (YTD)': r.mtdAce,
        'NOC (YTD)': r.mtdNoc,
        'FYCT (YTD)': r.ytdFyct,
        '% FYCT (YTD)': 0,
        'MDRT SHORTAGE FYCT': 0,
        'FYC (YTD)': 0,
        '% FYC (YTD)': 0,
        'MDRT SHORTAGE FYC': 0,
        // Per-month MTD ACE + NOC (the awarding service reads these).
        [`${reportMonthName} ACE`]: r.mtdAce,
        [`${reportMonthName} NOC`]: r.mtdNoc,
      },
    })),
  };
}

/******************************************************************************
  beforeAll — log in & guard against pre-existing data for May/June 2099
******************************************************************************/

const TEST_YEAR = 2099; // far-future year so we don't collide with real seed data

beforeAll(async () => {
  const loginRes = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email: GL_EMAIL, password: GL_PASSWORD });

  if (loginRes.status === 200 && loginRes.body?.data?.token) {
    glToken = loginRes.body.data.token as string;
  }

  // Force the consecutive-month guard to permit the May 2099 ingest regardless
  // of state — re-uploads of past months are allowed by the relaxed guard.
  jest
    .spyOn(salesReportYtdRepository, 'findLatestUploadedMonth')
    .mockResolvedValue(null);
}, 30000);

/******************************************************************************
  afterAll — delete every point_transaction + sales_report row + upload_batch
  this suite touched, leaving the DB in its starting state.
******************************************************************************/

afterAll(async () => {
  if (trackedBatchIds.length === 0) return;

  // 1. Delete point_transactions linked to our batches (subject_id IN ...).
  await (
    supabaseService as unknown as {
      adminClient: {
        from: (t: string) => {
          delete: () => {
            in: (c: string, v: unknown[]) => Promise<unknown>;
          };
        };
      };
    }
  ).adminClient
    .from('point_transactions')
    .delete()
    .in('subject_id', trackedBatchIds);

  // 2. Delete sales_report rows linked to our batches.
  await (
    supabaseService as unknown as {
      adminClient: {
        from: (t: string) => {
          delete: () => {
            in: (c: string, v: unknown[]) => Promise<unknown>;
          };
        };
      };
    }
  ).adminClient
    .from('sales_report_ytd')
    .delete()
    .in('batch_id', trackedBatchIds);

  await (
    supabaseService as unknown as {
      adminClient: {
        from: (t: string) => {
          delete: () => {
            in: (c: string, v: unknown[]) => Promise<unknown>;
          };
        };
      };
    }
  ).adminClient
    .from('sales_report_mtd')
    .delete()
    .in('batch_id', trackedBatchIds);

  // 3. Finally delete the upload_batches themselves.
  await (
    supabaseService as unknown as {
      adminClient: {
        from: (t: string) => {
          delete: () => {
            in: (c: string, v: unknown[]) => Promise<unknown>;
          };
        };
      };
    }
  ).adminClient
    .from('upload_batches')
    .delete()
    .in('id', trackedBatchIds);

  jest.restoreAllMocks();
}, 30000);

/******************************************************************************
  Helper: read all point_transactions for a batch (returns []) when empty
******************************************************************************/

async function readPointTxnsForBatch(
  batchId: string,
): Promise<
  Array<{
    user_id: string;
    activity: string;
    points: number;
    subject_id: string;
    subject_type: string;
  }>
> {
  const { data, error } = (await (
    supabaseService as unknown as {
      adminClient: {
        from: (t: string) => {
          select: (s: string) => {
            eq: (c: string, v: unknown) => Promise<{
              data: unknown[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    }
  ).adminClient
    .from('point_transactions')
    .select('user_id, activity, points, subject_id, subject_type')
    .eq('subject_id', batchId)) as {
    data: Array<{
      user_id: string;
      activity: string;
      points: number;
      subject_id: string;
      subject_type: string;
    }> | null;
    error: { message: string } | null;
  };
  if (error) throw new Error(error.message);
  return data ?? [];
}

/******************************************************************************
  Test
******************************************************************************/

describe('sales-points award + reversal — end-to-end', () => {
  let mayBatchId: string | null = null;
  let juneBatchOriginalId: string | null = null;
  let juneBatchRedoId: string | null = null;

  it('awards points to AG009 and AG010 after the May 2099 ingest', async () => {
    if (!glToken) throw new Error('Could not log in as group_leader');

    const res = await request(app)
      .post('/api/reports/upload')
      .set('Authorization', `Bearer ${glToken}`)
      .send({
        report_year: TEST_YEAR,
        report_month: 5,
        etlResult: fixtureEtl('MAY', 5, [
          { agentCode: 'AG009', mtdAce: 13000, mtdNoc: 4, ytdFyct: 14500 },
          { agentCode: 'AG010', mtdAce: 7500, mtdNoc: 3, ytdFyct: 12000 },
        ]),
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    mayBatchId = res.body.data.batchId as string;
    trackedBatchIds.push(mayBatchId);

    // Defaults are 30 pts per activity (seeded by migration). With those:
    //   AG009: noc 4×30=120, fyct floor(14500/1000)×30 = 14×30 = 420, ace floor(13000/1000)×30 = 13×30 = 390
    //   AG010: noc 3×30=90,  fyct floor(12000/1000)×30 = 12×30 = 360, ace floor(7500/1000)×30 = 7×30 = 210
    const txns = await readPointTxnsForBatch(mayBatchId);

    const byUser = new Map<string, Map<string, number>>();
    for (const t of txns) {
      if (!byUser.has(t.user_id)) byUser.set(t.user_id, new Map());
      byUser.get(t.user_id)!.set(t.activity, t.points);
      expect(t.subject_type).toBe('upload_batch');
    }

    expect(byUser.get(AG009_ID)?.get('sales_noc')).toBe(120);
    expect(byUser.get(AG009_ID)?.get('sales_fyct')).toBe(420);
    expect(byUser.get(AG009_ID)?.get('sales_ace')).toBe(390);
    expect(byUser.get(AG010_ID)?.get('sales_noc')).toBe(90);
    expect(byUser.get(AG010_ID)?.get('sales_fyct')).toBe(360);
    expect(byUser.get(AG010_ID)?.get('sales_ace')).toBe(210);
  });

  it('awards points after a clean June 2099 ingest using delta-based MTD FYCT', async () => {
    if (!glToken) throw new Error('Could not log in as group_leader');

    const res = await request(app)
      .post('/api/reports/upload')
      .set('Authorization', `Bearer ${glToken}`)
      .send({
        report_year: TEST_YEAR,
        report_month: 6,
        etlResult: fixtureEtl('JUNE', 6, [
          { agentCode: 'AG009', mtdAce: 14000, mtdNoc: 5, ytdFyct: 17000 }, // delta: 17000-14500 = 2500
          { agentCode: 'AG010', mtdAce: 8000, mtdNoc: 3, ytdFyct: 14500 }, // delta: 14500-12000 = 2500
        ]),
      });

    expect(res.status).toBe(200);
    juneBatchOriginalId = res.body.data.batchId as string;
    trackedBatchIds.push(juneBatchOriginalId);

    const txns = await readPointTxnsForBatch(juneBatchOriginalId);
    const byUser = new Map<string, Map<string, number>>();
    for (const t of txns) {
      if (!byUser.has(t.user_id)) byUser.set(t.user_id, new Map());
      byUser.get(t.user_id)!.set(t.activity, t.points);
    }

    // AG009: noc 5×30=150, fyct floor(2500/1000)=2 → 60, ace floor(14000/1000)=14 → 420
    expect(byUser.get(AG009_ID)?.get('sales_noc')).toBe(150);
    expect(byUser.get(AG009_ID)?.get('sales_fyct')).toBe(60);
    expect(byUser.get(AG009_ID)?.get('sales_ace')).toBe(420);
    // AG010: noc 3×30=90, fyct floor(2500/1000)=2 → 60, ace floor(8000/1000)=8 → 240
    expect(byUser.get(AG010_ID)?.get('sales_noc')).toBe(90);
    expect(byUser.get(AG010_ID)?.get('sales_fyct')).toBe(60);
    expect(byUser.get(AG010_ID)?.get('sales_ace')).toBe(240);
  });

  it('reverses prior June points and awards fresh ones on a June re-upload', async () => {
    if (!glToken) throw new Error('Could not log in as group_leader');
    if (!juneBatchOriginalId) {
      throw new Error('June original batch not created — prior test must run first');
    }

    // Re-upload June with corrected numbers — this should:
    //  1. Insert offsetting NEGATIVE entries for every original June txn
    //     (subject_id pointing at the ORIGINAL juneBatchOriginalId).
    //  2. Insert fresh POSITIVE entries linked to the new batch.
    const res = await request(app)
      .post('/api/reports/upload')
      .set('Authorization', `Bearer ${glToken}`)
      .send({
        report_year: TEST_YEAR,
        report_month: 6,
        etlResult: fixtureEtl('JUNE', 6, [
          // Corrected values for AG009 only — AG010 same as before.
          { agentCode: 'AG009', mtdAce: 16000, mtdNoc: 6, ytdFyct: 18000 }, // delta: 18000-14500 = 3500
          { agentCode: 'AG010', mtdAce: 8000, mtdNoc: 3, ytdFyct: 14500 },
        ]),
      });

    expect(res.status).toBe(200);
    juneBatchRedoId = res.body.data.batchId as string;
    trackedBatchIds.push(juneBatchRedoId);

    // Reversal entries: linked to the ORIGINAL june batch, with the ORIGINAL
    // (positive) amounts inverted.
    const reversalTxns = await readPointTxnsForBatch(juneBatchOriginalId);
    // Original June run produced 6 positive rows. Reversal adds 6 NEGATIVE rows.
    // Total rows for subject_id=juneBatchOriginalId is now 12.
    expect(reversalTxns).toHaveLength(12);

    const negativeRows = reversalTxns.filter((t) => t.points < 0);
    expect(negativeRows).toHaveLength(6);
    // For every negative row, there is a corresponding positive row with the
    // exact opposite amount on the same (user, activity).
    for (const neg of negativeRows) {
      const matching = reversalTxns.find(
        (t) =>
          t.user_id === neg.user_id &&
          t.activity === neg.activity &&
          t.points === -neg.points,
      );
      expect(matching).toBeDefined();
    }

    // Fresh awards: linked to juneBatchRedoId, with the corrected amounts.
    const freshTxns = await readPointTxnsForBatch(juneBatchRedoId);
    const byUser = new Map<string, Map<string, number>>();
    for (const t of freshTxns) {
      if (!byUser.has(t.user_id)) byUser.set(t.user_id, new Map());
      byUser.get(t.user_id)!.set(t.activity, t.points);
    }

    // AG009 corrected: noc 6×30=180, fyct floor(3500/1000)=3 → 90, ace floor(16000/1000)=16 → 480
    expect(byUser.get(AG009_ID)?.get('sales_noc')).toBe(180);
    expect(byUser.get(AG009_ID)?.get('sales_fyct')).toBe(90);
    expect(byUser.get(AG009_ID)?.get('sales_ace')).toBe(480);
    // AG010 unchanged values: 90 / 60 / 240
    expect(byUser.get(AG010_ID)?.get('sales_noc')).toBe(90);
    expect(byUser.get(AG010_ID)?.get('sales_fyct')).toBe(60);
    expect(byUser.get(AG010_ID)?.get('sales_ace')).toBe(240);

    // Net effect for the period: prior total - reversals + fresh = corrected total.
    // Sum across both batches for AG009/sales_noc:
    //   original: 150, reversal: -150, fresh: 180  →  net 180 ✓
    const allJuneAg009Noc = [
      ...reversalTxns.filter((t) => t.user_id === AG009_ID && t.activity === 'sales_noc'),
      ...freshTxns.filter((t) => t.user_id === AG009_ID && t.activity === 'sales_noc'),
    ].reduce((acc, t) => acc + t.points, 0);
    expect(allJuneAg009Noc).toBe(180);
  });

  it('keeps tenant_id scoped correctly on every inserted txn', async () => {
    if (!juneBatchRedoId) {
      throw new Error('June redo batch missing — prior tests must run first');
    }
    const { data, error } = (await (
      supabaseService as unknown as {
        adminClient: {
          from: (t: string) => {
            select: (s: string) => {
              eq: (c: string, v: unknown) => Promise<{
                data: { tenant_id: string }[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      }
    ).adminClient
      .from('point_transactions')
      .select('tenant_id')
      .eq('subject_id', juneBatchRedoId)) as {
      data: { tenant_id: string }[] | null;
      error: { message: string } | null;
    };

    expect(error).toBeNull();
    for (const row of data ?? []) {
      expect(row.tenant_id).toBe(TENANT_ID);
    }
  });
});

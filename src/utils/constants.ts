/******************************************************************************
                            Business Constants

  Hardcoded values that are not config-driven today but may move to
  a database table or env var in the future. Centralised here so the
  refactor is mechanical.
******************************************************************************/

/**
 * MDRT (Million Dollar Round Table) qualifying threshold for FYC.
 *
 * TODO: When MDRT targets become per-tier (COT/TOT), replace this with an
 * `mdrt_targets` table keyed by (year, tier).
 */
export const MDRT_TARGET_FYC = 400_000;

import type { IBaseReq } from '@src/models/interfaces/base.interface';
import type { ICaller } from '@src/types/auth.types';

export function callerOf(req: IBaseReq): ICaller {
  const { id, role, group_id } = req.user!;
  return { id, role, group_id };
}

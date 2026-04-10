import { IBaseRes } from '@src/models/interfaces/base.interface';

/******************************************************************************
                            Health Interfaces
******************************************************************************/

/**
 * Response shape for the GET /health endpoint.
 */
export interface IHealthRes extends IBaseRes {
  status: 'ok';
  timestamp: string;
}

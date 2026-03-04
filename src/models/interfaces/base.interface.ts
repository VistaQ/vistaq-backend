import { Request } from 'express';

/******************************************************************************
                            Base Interfaces
******************************************************************************/

/**
 * Base interface for all controller request objects.
 * Extends Express Request so controller request interfaces can add typed body/params.
 */
export interface IBaseReq extends Request {}

/**
 * Base interface for all controller response objects.
 * All response interfaces must extend this to ensure a consistent shape.
 */
export interface IBaseRes {
  message?: string;
}

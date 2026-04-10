import { Request } from 'express';

/******************************************************************************
                            Base Interfaces
******************************************************************************/

/**
 * Base type for all controller request objects.
 * Controller request interfaces extend this to add typed body/params.
 */
export type IBaseReq = Request;

/**
 * Base interface for all controller response objects.
 * All response interfaces must extend this to ensure a consistent shape.
 */
export interface IBaseRes {
  message?: string;
}

export type IImage = Record<string, unknown>;

export interface IStreamChange {
  eventName: 'INSERT' | 'MODIFY' | 'REMOVE';
  oldImage?: IImage;
  newImage?: IImage;
}

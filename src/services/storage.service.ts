import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { StorageServiceError } from '@src/models/errors/storage.error';
import EnvVars from '@src/utils/env';

const DELETE_LIMIT = 1000;

const client = new S3Client({});

/******************************************************************************
                            StorageService
******************************************************************************/

/** The reports bucket (`REPORTS_BUCKET`); keys are paths inside it. */
class StorageService {
  async upload(key: string, body: Buffer, contentType?: string): Promise<void> {
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: EnvVars.ReportsBucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      throw new StorageServiceError('StorageService.upload failed', error);
    }
  }

  async signedDownloadUrl(
    key: string,
    expiresInSeconds: number,
  ): Promise<string> {
    try {
      return await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: EnvVars.ReportsBucket, Key: key }),
        { expiresIn: expiresInSeconds },
      );
    } catch (error) {
      throw new StorageServiceError(
        'StorageService.signedDownloadUrl failed',
        error,
      );
    }
  }

  async remove(keys: string[]): Promise<void> {
    try {
      for (let i = 0; i < keys.length; i += DELETE_LIMIT) {
        const result = await client.send(
          new DeleteObjectsCommand({
            Bucket: EnvVars.ReportsBucket,
            Delete: {
              Objects: keys.slice(i, i + DELETE_LIMIT).map((Key) => ({ Key })),
              Quiet: true,
            },
          }),
        );
        if (result.Errors?.length) {
          throw new Error(`${result.Errors.length} objects were not deleted`);
        }
      }
    } catch (error) {
      throw new StorageServiceError('StorageService.remove failed', error);
    }
  }
}

export const storageService = new StorageService();
export default storageService;

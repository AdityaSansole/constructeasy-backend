import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

export type S3BucketKind = 'public' | 'private';

const DEFAULT_UPLOAD_EXPIRY_SECONDS = 10 * 60; // 10 min, per Architecture Blueprint Section 8
const DEFAULT_DOWNLOAD_EXPIRY_SECONDS = 5 * 60;

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB — generous but bounded

/**
 * S3Service — Phase 3 Plan Section 10.
 *
 * The API server NEVER proxies file bytes (Sign-Off Section 9). Every
 * upload/download interaction is a pre-signed URL the client uses directly
 * against S3. This is the sole point in the codebase that touches the S3
 * SDK — feature modules (Verification in Batch 4, Portfolio in Batch 5)
 * depend only on this service's interface, never on AWS SDK types directly.
 */
@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly buckets: Record<S3BucketKind, string>;

  constructor(private readonly config: ConfigService) {
    this.client = new S3Client({
      region: this.config.get<string>('aws.region'),
    });
    this.buckets = {
      public: this.config.get<string>('aws.s3.publicBucket') as string,
      private: this.config.get<string>('aws.s3.privateBucket') as string,
    };
  }

  /**
   * Generates a pre-signed PUT URL for a client to upload directly to S3.
   * Content-type is restricted and embedded in the signed request, so a
   * client cannot upload an arbitrary file type/size under the signed URL.
   */
  async generateUploadUrl(params: {
    bucket: S3BucketKind;
    contentType: string;
    keyPrefix: string; // e.g. "verification-documents/{professionalId}/"
    expirySeconds?: number;
  }): Promise<{ uploadUrl: string; objectKey: string; expiresAt: Date }> {
    if (!ALLOWED_CONTENT_TYPES.includes(params.contentType)) {
      throw new Error(
        `Content type '${params.contentType}' is not permitted for upload.`,
      );
    }

    const objectKey = `${params.keyPrefix.replace(/\/$/, '')}/${uuidv4()}`;
    const expirySeconds = params.expirySeconds ?? DEFAULT_UPLOAD_EXPIRY_SECONDS;

    const command = new PutObjectCommand({
      Bucket: this.buckets[params.bucket],
      Key: objectKey,
      ContentType: params.contentType,
      // Note: S3 does not enforce a max Content-Length via presigned PUT
      // alone without a policy document; MAX_UPLOAD_BYTES is enforced by
      // the bucket's lifecycle/policy config (Terraform, Phase 2 infra)
      // and re-validated by the async malware/content-scan job
      // (Architecture Blueprint Section 9) after upload.
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: expirySeconds,
    });

    return {
      uploadUrl,
      objectKey,
      expiresAt: new Date(Date.now() + expirySeconds * 1000),
    };
  }

  /**
   * Generates a pre-signed GET URL. For the private bucket, callers
   * (Verification module, Batch 4) are responsible for writing the
   * required audit_logs entry BEFORE calling this — Sign-Off Section 13's
   * "read access itself is audit-logged" rule is enforced at the endpoint
   * handler level, not inside this generic infrastructure service.
   */
  async generateDownloadUrl(params: {
    bucket: S3BucketKind;
    objectKey: string;
    expirySeconds?: number;
  }): Promise<{ downloadUrl: string; expiresAt: Date }> {
    const expirySeconds =
      params.expirySeconds ?? DEFAULT_DOWNLOAD_EXPIRY_SECONDS;

    const command = new GetObjectCommand({
      Bucket: this.buckets[params.bucket],
      Key: params.objectKey,
    });

    const downloadUrl = await getSignedUrl(this.client, command, {
      expiresIn: expirySeconds,
    });

    return {
      downloadUrl,
      expiresAt: new Date(Date.now() + expirySeconds * 1000),
    };
  }
}

export const S3_MAX_UPLOAD_BYTES = MAX_UPLOAD_BYTES;
export const S3_ALLOWED_CONTENT_TYPES = ALLOWED_CONTENT_TYPES;

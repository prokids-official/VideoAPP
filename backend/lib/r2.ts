import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env';

let client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: env.R2_ENDPOINT,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '',
      },
    });
  }

  return client;
}

function bucket(): string {
  return env.R2_BUCKET_NAME;
}

function stripQuotes(value?: string): string {
  return (value ?? '').replace(/^"|"$/g, '');
}

export async function putObject(opts: {
  key: string;
  body: Uint8Array | Buffer;
  contentType: string;
}): Promise<{ etag: string; version_id?: string }> {
  const out = await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
    }),
  );

  return { etag: stripQuotes(out.ETag), version_id: out.VersionId };
}

export async function getPresignedDownloadUrl(opts: {
  key: string;
  ttlSec: number;
}): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: bucket(), Key: opts.key });
  return getSignedUrl(getS3Client(), cmd, { expiresIn: opts.ttlSec });
}

export async function headObject(key: string): Promise<{
  size_bytes: number;
  etag: string;
} | null> {
  try {
    const out = await getS3Client().send(
      new HeadObjectCommand({ Bucket: bucket(), Key: key }),
    );

    return {
      size_bytes: out.ContentLength ?? 0,
      etag: stripQuotes(out.ETag),
    };
  } catch (error) {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };

    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }

    throw error;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

function encodeCopySource(key: string): string {
  return `${bucket()}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export async function moveObjectToTrash(key: string): Promise<string> {
  const trashKey = `trash/${key}`;

  await getS3Client().send(
    new CopyObjectCommand({
      Bucket: bucket(),
      CopySource: encodeCopySource(key),
      Key: trashKey,
    }),
  );
  await deleteObject(key);

  return trashKey;
}

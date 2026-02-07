import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3Client } from "@aws-sdk/client-s3";
import { env } from "../config/env.js";

const PRESIGNED_EXPIRES_IN_SECONDS = 900; // 15 min

let s3Client: S3Client | null = null;

function getS3Client(): S3Client | null {
  if (!env.LISTING_IMAGES_BUCKET || !env.AWS_REGION) return null;
  if (!s3Client) {
    s3Client = new S3Client({ region: env.AWS_REGION });
  }
  return s3Client;
}

/**
 * Returns a presigned PUT URL for uploading one listing image to S3.
 * storageKey should be e.g. "listings/{listingId}/{cuid}.jpg".
 * Returns null if LISTING_IMAGES_BUCKET or AWS_REGION is not configured.
 */
export async function getPresignedUploadUrl(
  storageKey: string,
  contentType?: string,
): Promise<{ uploadUrl: string; expiresIn: number } | null> {
  const client = getS3Client();
  const bucket = env.LISTING_IMAGES_BUCKET;
  if (!client || !bucket) return null;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    ContentType: contentType ?? "image/jpeg",
  });
  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: PRESIGNED_EXPIRES_IN_SECONDS,
  });
  return { uploadUrl, expiresIn: PRESIGNED_EXPIRES_IN_SECONDS };
}

export function isPresignedConfigured(): boolean {
  return Boolean(env.LISTING_IMAGES_BUCKET && env.AWS_REGION);
}

/**
 * Delete object from S3 if LISTING_IMAGES_BUCKET is configured. No-op otherwise.
 * Ignores errors (e.g. object already deleted) so DB delete can proceed.
 */
export async function deleteListingImageFromS3(storageKey: string): Promise<void> {
  const client = getS3Client();
  const bucket = env.LISTING_IMAGES_BUCKET;
  if (!client || !bucket) return;
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: storageKey,
      }),
    );
  } catch {
    // Ignore: object may already be missing; DB delete still succeeds
  }
}

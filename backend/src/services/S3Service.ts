import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

export class S3Service {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'eu-north-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
    this.bucketName = process.env.AWS_S3_BUCKET || 'visit-tracker-bucket';
  }

  async generatePresignedUrl(filename: string, fileSize: number, contentType: string = 'application/octet-stream'): Promise<{ url: string; s3Key: string }> {
    // Check if AWS credentials are configured
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS S3 is not configured. File upload is disabled.');
    }

    const fileExtension = filename.split('.').pop();
    const s3Key = `uploads/${uuidv4()}.${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
      ContentType: contentType,
    });

    try {
      const url = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
      return { url, s3Key };
    } catch (error) {
      throw new Error(`Failed to generate presigned URL: ${(error as Error).message}`);
    }
  }

  async uploadFile(s3Key: string, buffer: Buffer, contentType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
      Body: buffer,
      ContentType: contentType,
    });
    try {
      await this.s3Client.send(command);
    } catch (error) {
      throw new Error(`Failed to upload file to S3: ${(error as Error).message}`);
    }
  }

  async deleteFile(s3Key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
    });

    try {
      await this.s3Client.send(command);
    } catch (error) {
      throw new Error(`Failed to delete file from S3: ${(error as Error).message}`);
    }
  }

  /**
   * Download a file from S3 directly into memory.
   * Used when we need the bytes server-side (e.g. to embed in a generated PDF).
   *
   * @param maxBytes  Optional hard cap. If the object's ContentLength exceeds this
   *                  value the method throws an error with message 'FILE_TOO_LARGE'
   *                  (without streaming the body at all).
   */
  async getObjectBuffer(s3Key: string, maxBytes?: number): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
    });

    let response: GetObjectCommandOutput;
    try {
      response = await this.s3Client.send(command);
    } catch (error) {
      throw new Error(`Failed to download file from S3: ${(error as Error).message}`);
    }

    // Size guard – checked before streaming so we don't waste bandwidth
    if (
      maxBytes !== undefined &&
      response.ContentLength !== undefined &&
      response.ContentLength > maxBytes
    ) {
      // Drain / destroy the body stream so the connection is released cleanly
      const body = response.Body as any;
      if (typeof body?.destroy === 'function') body.destroy();
      throw new Error('FILE_TOO_LARGE');
    }

    const body = response.Body as any;
    if (!body) throw new Error('Empty body from S3');

    try {
      // AWS SDK v3 returns a ReadableStream; concat chunks
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error) {
      throw new Error(`Failed to stream file from S3: ${(error as Error).message}`);
    }
  }

  async getDownloadUrl(s3Key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
    });

    try {
      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error) {
      throw new Error(`Failed to generate download URL: ${(error as Error).message}`);
    }
  }
}

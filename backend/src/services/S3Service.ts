import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
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

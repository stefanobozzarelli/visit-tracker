import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

export class S3Service {
  private s3: AWS.S3;
  private bucketName: string;

  constructor() {
    this.s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'eu-west-1',
    });
    this.bucketName = process.env.AWS_S3_BUCKET || 'visit-tracker-bucket';
  }

  async generatePresignedUrl(filename: string, fileSize: number): Promise<{ url: string; s3Key: string }> {
    // Check if AWS credentials are configured
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS S3 is not configured. File upload is disabled.');
    }

    const fileExtension = filename.split('.').pop();
    const s3Key = `uploads/${uuidv4()}.${fileExtension}`;

    const params: any = {
      Bucket: this.bucketName,
      Key: s3Key,
      ContentType: 'application/octet-stream',
      Expires: 3600,
      ContentLength: fileSize,
    };

    try {
      const url = await this.s3.getSignedUrlPromise('putObject', params);
      return { url, s3Key };
    } catch (error) {
      throw new Error(`Failed to generate presigned URL: ${(error as Error).message}`);
    }
  }

  async deleteFile(s3Key: string): Promise<void> {
    const params = {
      Bucket: this.bucketName,
      Key: s3Key,
    };

    try {
      await this.s3.deleteObject(params).promise();
    } catch (error) {
      throw new Error(`Failed to delete file from S3: ${(error as Error).message}`);
    }
  }

  async getDownloadUrl(s3Key: string, expiresIn: number = 3600): Promise<string> {
    const params: any = {
      Bucket: this.bucketName,
      Key: s3Key,
      Expires: expiresIn,
    };

    try {
      return await this.s3.getSignedUrlPromise('getObject', params);
    } catch (error) {
      throw new Error(`Failed to generate download URL: ${(error as Error).message}`);
    }
  }
}

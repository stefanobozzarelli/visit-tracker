import { v2 as cloudinary } from 'cloudinary';
import { v4 as uuidv4 } from 'uuid';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export class CloudinaryService {
  async generatePresignedUrl(filename: string, fileSize: number): Promise<{ url: string; publicId: string; timestamp: number; signature: string; apiKey: string; cloudName: string }> {
    // Check if Cloudinary credentials are configured
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      throw new Error('Cloudinary is not configured. File upload is disabled.');
    }

    const publicId = `uploads/${uuidv4()}`;

    try {
      // Generate signature for direct upload from frontend
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = cloudinary.utils.api_sign_request(
        {
          timestamp,
          public_id: publicId,
          folder: 'visit-tracker',
        },
        process.env.CLOUDINARY_API_SECRET
      );

      return {
        url: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/auto/upload`,
        publicId,
        timestamp,
        signature,
        apiKey: process.env.CLOUDINARY_API_KEY,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      };
    } catch (error) {
      throw new Error(`Failed to generate upload signature: ${(error as Error).message}`);
    }
  }

  async deleteFile(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      throw new Error(`Failed to delete file from Cloudinary: ${(error as Error).message}`);
    }
  }

  async getDownloadUrl(publicId: string, expiresIn: number = 3600): Promise<string> {
    try {
      const url = cloudinary.url(publicId, {
        secure: true,
      });
      return url;
    } catch (error) {
      throw new Error(`Failed to generate download URL: ${(error as Error).message}`);
    }
  }
}

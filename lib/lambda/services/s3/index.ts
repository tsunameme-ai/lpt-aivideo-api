import { Upload } from '@aws-sdk/lib-storage';
import { PutObjectCommandInput, S3 } from '@aws-sdk/client-s3';
import fs from 'fs'
import axios, { AxiosHeaders } from 'axios'
import { PassThrough } from 'stream';

export class S3Client {
    private s3: S3
    constructor() {
        this.s3 = new S3()
    }
    public async s3toLocal(s3BucketId: string, s3Key: string, localFilePath: string): Promise<string> {
        const s3Data = await this.s3.getObject({ Bucket: s3BucketId, Key: s3Key });
        if (s3Data.Body) {
            const fdata = await s3Data.Body.transformToByteArray();
            await fs.writeFileSync(localFilePath, fdata);
        }
        return localFilePath
    }
    public async localToS3(s3BucketId: string, s3Key: string, localFile: string): Promise<string> {
        const body = await fs.readFileSync(localFile)
        return this.localDataToS3(s3BucketId, s3Key, body)
    }

    public async remoteToS3(s3BucketId: string, s3Key: string, url: string): Promise<string> {
        try {
            const response = await axios.get(url, { responseType: 'stream' });
            if (response.status != 200) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const downloadStream = response.data;
            const passThrough = new PassThrough();
            downloadStream.pipe(passThrough)
            return await this.upload({
                Bucket: s3BucketId,
                Key: s3Key,
                Body: passThrough,
                ContentLength: (response.headers as AxiosHeaders).get('Content-Length') as number | undefined
            })
        } catch (error) {
            console.error('Error downloading or uploading MP4:', error);
            throw error; // Re-throw the error to be handled outside the function
        }
    }

    public async localDataToS3(s3BucketId: string, s3Key: string, data: any): Promise<string> {
        return await this.upload({ Bucket: s3BucketId, Key: s3Key, Body: data })
    }

    public async upload(params: PutObjectCommandInput): Promise<string> {
        const upload = await new Upload({
            client: this.s3,
            params
        }).done()
        return upload.Location || `https://${params.Bucket}.s3.amazonaws.com/${params.Key}`
    }
}
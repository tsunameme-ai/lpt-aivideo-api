import ffmpeg from 'fluent-ffmpeg'
import { S3Client } from '../s3';
import fs from 'fs'

export class FFMPEGClient {
    public async imageOverVideo(s3: S3Client, s3BucketSrc: string, s3BucketDst: string, videoId: string, width: number): Promise<string> {
        const videoLocalFile = `/tmp/${videoId}.mp4`
        const imageLocalFile = `/tmp/${videoId}.png`
        const outputLocalFile = `/tmp/${videoId}-out.gif`
        let destUrl

        try {
            await Promise.all([
                s3.s3toLocal(s3BucketSrc, `${videoId}.mp4`, videoLocalFile),
                s3.s3toLocal(s3BucketSrc, `${videoId}.png`, imageLocalFile)
            ])

            await this.execImageOverVideo(videoLocalFile, imageLocalFile, width, outputLocalFile)
            destUrl = await s3.localToS3(s3BucketDst, `${videoId}.gif`, outputLocalFile)
        }
        catch (e: any) {
            console.error(e)
            throw e
        }
        finally {
            const files = [videoLocalFile, imageLocalFile, outputLocalFile]
            await Promise.all(files.map(f => {
                return fs.unlinkSync(f)
            }))
        }
        return destUrl
    };
    private async execImageOverVideo(videoFilePath: string, imageFilePath: string, width: number, outputFilePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            ffmpeg(videoFilePath)
                .input(imageFilePath)
                .complexFilter([
                    `[0:v]fps=6,scale=${width}:-1[bg];[bg][1:v]overlay=0:0`
                ])
                // .on('progress', function (progress: { percent?: number }) {
                //     if (progress.percent) {
                //         console.log(`Rendering: ${progress.percent}% done`)
                //     }
                // })
                .on('end', function () {
                    resolve(outputFilePath)
                })
                .on('error', function (err: any) {
                    reject(err)
                })
                .save(outputFilePath);
        })
    }
}
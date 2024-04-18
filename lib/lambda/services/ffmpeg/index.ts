import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import { ILogger } from '../metrics';
import { VideoProcessingParams, VideoProcessingOperation } from './types';


export class FFMPEGClient {
    private logger?: ILogger
    constructor(logger?: ILogger) {
        this.logger = logger
    }

    public async processVideo(params: VideoProcessingParams): Promise<string> {
        let destUrl
        let videoLocalFile = `/tmp/${params.videoId}.mp4`
        const hasOpOI = params.ops.includes(VideoProcessingOperation.OVERLAY_IMAGE)
        const hasOpGif = params.ops.includes(VideoProcessingOperation.TO_GIF)
        const ext = hasOpGif ? 'gif' : 'mp4'
        const outputLocalFile = `/tmp/${params.videoId}-out.${ext}`
        try {
            await params.s3.s3toLocal(params.s3BucketSrc, `${params.videoId}.mp4`, videoLocalFile)
            console.log(`ffmpeg processVideo videoLocalFile ${videoLocalFile} hasOpOI:${hasOpOI} hasOpGif:${hasOpGif}`)

            if (hasOpOI) {
                const imageLocalFile = `/tmp/${params.videoId}.png`
                const outputVideoLocalFile = `/tmp/${params.videoId}-out.mp4`
                await params.s3.s3toLocal(params.s3BucketSrc, `${params.videoId}.png`, imageLocalFile)
                await this.addImage(videoLocalFile, imageLocalFile, params.width, outputVideoLocalFile)
                await Promise.all([
                    this.removeFile(imageLocalFile),
                    this.removeFile(videoLocalFile)
                ])
                videoLocalFile = outputVideoLocalFile
            }
            if (hasOpGif) {
                await this.convertToGif(videoLocalFile, outputLocalFile, params.outputWidth)
            }
            const body = await fs.readFileSync(outputLocalFile)
            destUrl = await params.s3.upload({
                Bucket: params.s3BucketDst,
                Key: `${params.videoId}.${ext}`,
                Body: body,
                ContentType: ext === 'gif' ? 'image/gif' : 'video/mp4'
            })

            await this.removeFile(outputLocalFile)
            return destUrl
        }

        catch (e: any) {
            this.logger?.error(e)
            throw e
        }
    }
    private async removeFile(filePath: string) {
        try {
            await fs.unlinkSync(filePath)
        }
        catch (e) {
            this.logger?.error(e)
        }
    }
    private async addImage(videoFilePath: string, imageFilePath: string, width: number, outputFilePath: string): Promise<string> {
        this.logger?.info({ message: 'addImage', videoFilePath, imageFilePath, width, outputFilePath })
        return new Promise((resolve, reject) => {
            ffmpeg(videoFilePath)
                .input(imageFilePath)
                .complexFilter([
                    `[0:v]fps=6,scale=${width}:-1[bg];[bg][1:v]overlay=0:0`
                ])
                .on('end', function () {
                    resolve(outputFilePath)
                })
                .on('error', function (err: any) {
                    reject(err)
                })
                .save(outputFilePath);
        })
    }

    private async convertToGif(videoFilePath: string, outputFilePath: string, width: number): Promise<string> {
        this.logger?.info({ message: 'convertToGif', videoFilePath, outputFilePath })
        return new Promise((resolve, reject) => {
            ffmpeg(videoFilePath)
                .complexFilter([
                    `[0:v]scale=${width}:-1,split [a][b];[a] palettegen [p];[b][p] paletteuse,fps=6`
                ])
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
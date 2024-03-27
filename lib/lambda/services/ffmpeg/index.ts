import ffmpeg from 'fluent-ffmpeg'
import { S3Client } from '../s3';
import fs, { PathLike } from 'fs'
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
        const hasOpOI = [params.ops.includes(VideoProcessingOperation.OVERLAY_IMAGE)]
        const hasOpGif = [params.ops.includes(VideoProcessingOperation.TO_GIF)]
        const ext = hasOpGif ? 'gif' : 'mp4'
        const outputLocalFile = `/tmp/${params.videoId}-out.${ext}`
        try {
            await params.s3.s3toLocal(params.s3BucketSrc, `${params.videoId}.mp4`, videoLocalFile)

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
                await this.convertToGif(videoLocalFile, outputLocalFile)
            }

            destUrl = await params.s3.localToS3(params.s3BucketDst, `${params.videoId}.${ext}`, outputLocalFile)
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

    public async imageOverVideo(s3: S3Client, s3BucketSrc: string, s3BucketDst: string, videoId: string, width: number, ext: VideoExtension): Promise<string> {
        const videoLocalFile = `/tmp/${videoId}.mp4`
        const imageLocalFile = `/tmp/${videoId}.png`
        const outputVideoLocalFile = `/tmp/${videoId}-out.mp4`
        const outputLocalFile = ext === 'gif' ? `/tmp/${videoId}-out.gif` : outputVideoLocalFile
        let destUrl

        try {
            await Promise.all([
                s3.s3toLocal(s3BucketSrc, `${videoId}.mp4`, videoLocalFile),
                s3.s3toLocal(s3BucketSrc, `${videoId}.png`, imageLocalFile)
            ])

            await this.execImageOverVideo(videoLocalFile, imageLocalFile, width, outputVideoLocalFile, ext === 'gif' ? outputLocalFile : undefined)
            destUrl = await s3.localToS3(s3BucketDst, `${videoId}.${ext}`, outputLocalFile)
        }
        catch (e: any) {
            this.logger?.error(e)
            throw e
        }
        finally {
            const fileSet = new Set<PathLike>()
            fileSet.add(videoLocalFile)
            fileSet.add(imageLocalFile)
            fileSet.add(outputVideoLocalFile)
            fileSet.add(outputLocalFile)
            await Promise.all(Array.from(fileSet).map(f => {
                return fs.unlinkSync(f)
            }))
        }
        return destUrl
    };
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

    private async convertToGif(videoFilePath: string, outputFilePath: string): Promise<string> {
        this.logger?.info({ message: 'convertToGif', videoFilePath, outputFilePath })
        return new Promise((resolve, reject) => {
            ffmpeg(videoFilePath)
                .complexFilter([
                    `[0:v]split [a][b];[a] palettegen [p];[b][p] paletteuse,fps=6`
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


    private async execImageOverVideo(videoFilePath: string, imageFilePath: string, width: number, outputVideoFilePath: string, outputGifFilePath?: string): Promise<string> {
        this.logger?.info({ message: 'execImageOverVideo', videoFilePath, imageFilePath, width, outputVideoFilePath })
        let destUrl = await this.addImage(videoFilePath, imageFilePath, width, outputVideoFilePath)
        if (outputGifFilePath) {
            destUrl = await this.convertToGif(outputVideoFilePath, outputGifFilePath)
        }
        return destUrl
    }
}
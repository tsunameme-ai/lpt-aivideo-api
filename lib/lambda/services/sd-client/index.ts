
import axios from 'axios'
import { ILogger, IMetric, MetricLoggerUnit } from '../metrics'
import { S3Client } from '../s3'
import { FFMPEGClient } from '../ffmpeg'

export enum GenerationType {
    TXT2IMG = 'txt2img',
    IMG2VID = 'img2vid'
}
export type GenerationOutputItem = { url: string, seed: number | string }
export type GenerationOutput = { id: string, images: Array<GenerationOutputItem> }
export type Txt2imgInput = {
    'model_id': string,
    'prompt': string,
    'negative_prompt': string,
    'guidance_scale': number,
    'seed': number,
    'width': number,
    'height': number,
    'num_images_per_prompt': number
}

export type Img2vidInput = {
    id: string,
    'image_url': string,
    'model_id': string,
    width: number,
    height: number,
    motion_bucket_id: number,
    noise_aug_strength: number
    overlay_base64?: string
    overlay_text?: string
    image_generation_id?: string
}
export interface LoggerSDProviderError {
    errInfo: SDProviderErrorInfo
    err: SDProviderError
}

export interface SDProviderErrorInfo {
    path: string
    status?: number
    code?: string
    data?: string
}
export class SDProviderError extends Error {
    info: SDProviderErrorInfo

    constructor(message: string, info: SDProviderErrorInfo) {
        super(message)
        this.name = 'SDProviderError'
        this.info = info
    }

    public formatForLogger(): LoggerSDProviderError {
        return { errInfo: this.info, err: this }
    }
}

export interface SDClientProps {
    baseURL: string
    logger?: ILogger
    metric?: IMetric
}

export class SDClient {
    private baseURL: string
    private logger?: ILogger
    private metric?: IMetric
    constructor(props: SDClientProps) {
        this.baseURL = props.baseURL
        this.logger = props.logger
        this.metric = props.metric
    }

    public async txt2img(id: string, params: Txt2imgInput): Promise<GenerationOutput> {
        const output = await this.sendRequest('/text-to-image', JSON.stringify(params), { 'Content-Type': 'application/json' }, 30000)
        return {
            ...output,
            id
        }
    }

    private async downloadImageData(url: string) {
        const res = await fetch(url)
        if (res.ok) {
            return res.blob()
        }
        throw new SDProviderError(`Image cannot be downloaded ${url}`, {
            path: url,
            status: res.status,
        })
    }

    public async img2vid(id: string, params: Img2vidInput): Promise<GenerationOutput> {
        const imageData = await this.downloadImageData(params.image_url)
        const fd = new FormData()
        fd.append('image', imageData)
        fd.append('model_id', 'stabilityai/stable-video-diffusion-img2vid-xt')
        fd.append('width', params.width.toString())
        fd.append('height', params.height.toString())
        fd.append('motion_bucket_id', params.motion_bucket_id.toString())
        fd.append('noise_aug_strength', params.noise_aug_strength.toString())
        const data = await this.sendRequest('/image-to-video', fd, undefined, 600000) //10min
        const output0 = data.images[0]
        let videoUrl = output0.url
        const overlayImageBase64 = params.overlay_base64
        if (overlayImageBase64 && overlayImageBase64.length > 0) {
            try {
                videoUrl = await this.overlayImageOnVideo(id, videoUrl, overlayImageBase64, params.width)
            }
            catch (e) {
                this.logger?.error(e)
            }
        }
        return {
            id: id,
            images: [{ url: videoUrl, seed: output0.seed }]
        }
    }
    private async sendRequest(path: string, body: any, headers?: { [key: string]: string }, timeoutMs: number = 40000): Promise<GenerationOutput> {
        this.metric?.putMetrics({ keys: [`LPTReq`, `LPTReq:${path}`], value: 1, unit: MetricLoggerUnit.Count })
        const t = new Date().getTime()
        let resOutput = undefined
        let resError: SDProviderError | undefined = undefined

        try {
            const { status, data } = await axios.post(`${this.baseURL}${path}`, body, {
                ...headers,
                timeout: timeoutMs
            })
            if (data) {
                resOutput = data
            }
            else {
                resError = new SDProviderError('Generation failed.', {
                    path: path,
                    status: status,
                })
            }
        }
        catch (e: any) {
            resError = new SDProviderError(e.message, {
                path: path,
                status: e.status || e.response?.status || 500,
                code: e.code,
                data: JSON.stringify(e.response?.data) || undefined
            })
            resError.stack = e.stack
        }
        finally {
            const dur = new Date().getTime() - t
            if (resError) {
                this.metric?.putMetrics({ keys: [`LPTError`, `LPTError:${path}:${resError.info.status}`], value: 1, unit: MetricLoggerUnit.Count })
                this.logger?.error(resError.formatForLogger())
                throw resError
            }
            else {
                this.metric?.putMetrics({ keys: [`LPT`, `LPT:${path}`], value: 1, unit: MetricLoggerUnit.Count })
                this.metric?.putMetrics({ keys: ['LPTDuration', `LPTDuration:${path}`], value: dur, unit: MetricLoggerUnit.Milliseconds })
            }
            return resOutput
        }
    }


    public async overlayImageOnVideo(videoId: string, videoUrl: string, imgBase64Str: string, width: number): Promise<string> {
        const s3BucketSrc = 'lpt-aivideo-src'
        const s3BucketDst = 'lpt-aivideo-dst'
        const s3Client = new S3Client()
        const imgData = Buffer.from(imgBase64Str.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        const imgType = imgBase64Str.split(';')[0].split('/')[1];
        try {
            await Promise.all([
                s3Client.remoteToS3(s3BucketSrc, `${videoId}.mp4`, videoUrl),
                s3Client.upload({
                    Bucket: s3BucketSrc, Key: `${videoId}.png`, Body: imgData,
                    ContentEncoding: 'base64', // required
                    ContentType: `image/${imgType}` // required. Notice the back ticks
                })
            ])
        }
        catch (e) {
            console.error(e)
            throw new Error(`Failed to download video ${videoUrl}`)
        }
        return await new FFMPEGClient().imageOverVideo(s3Client, s3BucketSrc, s3BucketDst, videoId, width)
    }
}
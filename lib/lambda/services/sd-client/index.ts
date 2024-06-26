
import axios from 'axios'
import { ILogger, IMetric, MetricLoggerUnit } from '../metrics'
import { S3Client } from '../s3'
import { FFMPEGClient } from '../ffmpeg'
import { GenerationOutput, GenerationOutputItem, Img2imgInput, Img2vidInput, SDProviderError, Txt2imgInput } from './types'
import { FalAIClient } from './fallback'
import { VideoExtension, VideoProcessingOperation, VideoProcessingParams } from '../ffmpeg/types'
import { fixTruncatedImageURL } from './utils'
import { parseBase64Image } from '../../utils/processor'
import { DDBClient } from '../ddb-client'


interface SDClientProps {
    baseURL: string
    fallbackClient?: FalAIClient
    ddbClient?: DDBClient
    logger?: ILogger
    metric?: IMetric
}

export class SDClient {
    private s3Client: S3Client
    private ddbClient?: DDBClient
    private ffmpegClient: FFMPEGClient
    private baseURL: string
    private logger?: ILogger
    private metric?: IMetric
    private fallbackClient?: FalAIClient
    private s3BucketSrc = 'lpt-aivideo-src'
    private s3BucketDst = 'lpt-aivideo-dst'
    constructor(props: SDClientProps) {
        this.baseURL = props.baseURL
        this.logger = props.logger
        this.metric = props.metric
        this.fallbackClient = props.fallbackClient
        this.ddbClient = props.ddbClient
        this.s3Client = new S3Client()
        this.ffmpegClient = new FFMPEGClient(this.logger)
    }

    public async txt2img(id: string, timestamp: number, params: Txt2imgInput): Promise<GenerationOutput> {
        const timeoutMS = parseInt(process.env.LPT_TIMEOUTMS_TXT2IMG || '15000')
        let resError = undefined
        try {
            if (params.num_images_per_prompt > 1 && ['SG161222/RealVisXL_V4.0_Lightning', 'SG161222/RealVisXL_V4.0'].includes(params.model_id)) {
                return await this.txt2imgMultiRequest(id, timestamp, params, timeoutMS)
            }
            else {
                return await this.txt2imgSingleRequest(id, timestamp, params, timeoutMS)
            }
        }
        catch (e) {
            resError = e
        }
        if (this.fallbackClient) {
            return await this.fallbackClient?.txt2img(id, timestamp, params, 30000 - timeoutMS)
        }
        else {
            throw resError
        }
    }
    private async txt2imgSingleRequest(id: string, timestamp: number, params: Txt2imgInput, timeoutMS: number): Promise<GenerationOutput> {
        const output = await this.sendRequest('/text-to-image', JSON.stringify(params), { 'Content-Type': 'application/json' }, timeoutMS)
        return {
            ...output,
            status: 'success',
            timestamp,
            id
        }

    }
    private async txt2imgMultiRequest(id: string, timestamp: number, params: Txt2imgInput, timeoutMS: number): Promise<GenerationOutput> {
        const ps = []
        for (let i = 0; i < params.num_images_per_prompt; i++) {
            ps.push(this.txt2imgSingleRequest(id, timestamp, { ...params, num_images_per_prompt: 1 }, timeoutMS))
        }
        const outputs = await Promise.all(ps)
        return {
            id,
            timestamp,
            status: 'success',
            images: outputs.map((item: GenerationOutput) => {
                return item.images[0]
            })

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

    public async img2img(id: string, timestamp: number, params: Img2imgInput): Promise<GenerationOutput> {
        const imageData = await this.downloadImageData(params.image_url)
        const fd = new FormData()
        fd.append('image', imageData)
        fd.append('model_id', params.model_id)
        fd.append('prompt', params.prompt)
        fd.append('negative_prompt', params.negative_prompt)
        fd.append('guidance_scale', params.guidance_scale.toString())
        fd.append('num_images_per_prompt', params.num_images_per_prompt.toString())
        fd.append('strength', params.strength.toString())
        if (params.seed) {
            fd.append('seed', params.seed.toString())
        }
        const data = await this.sendRequest('/image-to-image', fd, undefined)
        return {
            id,
            timestamp,
            status: 'success',
            images: data.images.map(item => {
                return {
                    url: item.url,
                    seed: item.seed.toString(),
                    nsfw: item.nsfw || false
                }
            })
        }
    }

    public async img2vid(id: string, timestamp: number, params: Img2vidInput): Promise<GenerationOutput> {
        let resError = undefined
        const imgurl = fixTruncatedImageURL(params.image_url)
        const imageData = await this.downloadImageData(imgurl)
        const fd = new FormData()
        fd.append('image', imageData)
        fd.append('model_id', params.model_id)
        fd.append('width', params.width.toString())
        fd.append('height', params.height.toString())
        fd.append('motion_bucket_id', params.motion_bucket_id.toString())
        fd.append('noise_aug_strength', params.noise_aug_strength.toString())
        if (params.seed) {
            fd.append('seed', params.seed.toString())
        }
        let output: GenerationOutputItem | undefined = undefined
        try {
            const data = await this.sendRequest('/image-to-video', fd, undefined, 300000) //5min
            output = data.images[0]
        }
        catch (e) {
            resError = e

        }
        if (resError && this.fallbackClient) {
            const data = await this.fallbackClient?.img2vid(id, timestamp, params, 300000)
            if (data.images.length > 0) {
                output = {
                    url: data.images[0].url,
                    seed: data.images[0].seed.toString(),
                    nsfw: data.images[0].nsfw || false,
                }
            }
        }
        if (output) {
            output.url = await this.processVideo(id, params.width, output.url, params.output_type || 'gif', params.overlay_base64, params.output_width)

            if (params.image_generation_id && this.ddbClient) {
                const segs = params.image_generation_id.split(':')
                const imgGen = await this.ddbClient.readGeneration(segs[0])
                const imgIndex = segs.length > 1 ? parseInt(segs[1]) : 0
                const imgNSFW = imgGen.outputs?.[imgIndex].nsfw
                if (imgNSFW) {
                    output.nsfw = true
                }
            }

            return {
                id,
                timestamp,
                status: 'success',
                images: [output]
            }
        }
        if (!resError) {
            resError = new SDProviderError('No data', {
                path: '/image-to-video'
            })
        }
        throw resError
    }
    private async sendRequest(path: string, body: any, headers?: { [key: string]: string }, timeoutMs: number = 30000): Promise<GenerationOutput> {
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
                this.logger?.error(resError.toLogger())
                throw resError
            }
            else {
                this.metric?.putMetrics({ keys: [`LPT`, `LPT:${path}`], value: 1, unit: MetricLoggerUnit.Count })
                this.metric?.putMetrics({ keys: ['LPTDuration', `LPTDuration:${path}`], value: dur, unit: MetricLoggerUnit.Milliseconds })
            }
            return resOutput
        }
    }

    private async prepareForVideoProcessing(videoId: string, width: number, videoUrl: string, ext: VideoExtension, imgBase64Str?: string, outputWidth?: number): Promise<VideoProcessingParams> {
        this.logger?.info(`prepareForVideoProcessing ${videoId} ${width} ${videoUrl} ${ext}`)
        const ps = [this.s3Client.remoteToS3(this.s3BucketSrc, `${videoId}.mp4`, videoUrl)]
        const ops: VideoProcessingOperation[] = []
        if (imgBase64Str && imgBase64Str.length > 0) {
            ops.push(VideoProcessingOperation.OVERLAY_IMAGE)
            const { data: imgData, type: imgType } = parseBase64Image(imgBase64Str)
            ps.push(this.s3Client.upload({
                Bucket: this.s3BucketSrc, Key: `${videoId}.png`, Body: imgData,
                ContentEncoding: 'base64',
                ContentType: `image/${imgType}`
            }))
        }
        await Promise.all(ps)
        if (ext === 'gif') {
            ops.push(VideoProcessingOperation.TO_GIF)
        }

        return {
            s3: this.s3Client,
            s3BucketDst: this.s3BucketDst,
            s3BucketSrc: this.s3BucketSrc,
            videoId: videoId,
            width: width,
            outputWidth: outputWidth ?? width,
            ops: ops
        }

    }


    public async processVideo(id: string, width: number, videoUrl: string, ext: VideoExtension, imgBase64Str?: string, outputWidth?: number): Promise<string> {
        const vidParmas = await this.prepareForVideoProcessing(id, width, videoUrl, ext, imgBase64Str, outputWidth)
        if (vidParmas.ops.length > 0) {
            return await this.ffmpegClient.processVideo(vidParmas)
        }
        return videoUrl
    }
}
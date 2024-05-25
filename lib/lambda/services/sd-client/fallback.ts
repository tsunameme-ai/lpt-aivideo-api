
import axios from 'axios'
import { ILogger, IMetric, MetricLoggerUnit } from '../metrics'
import { GenerationOutput, GenerationOutputItem, Img2vidInput, SDProviderError, Txt2imgInput } from './types'
import { fixTruncatedImageURL } from './utils'

interface FalAIClientProps {
    baseURL: string
    apiKey: string
    logger?: ILogger
    metric?: IMetric
}

export class FalAIClient {
    private baseURL: string
    private apiKey: string
    private logger?: ILogger
    private metric?: IMetric
    constructor(props: FalAIClientProps) {
        this.baseURL = props.baseURL
        this.apiKey = props.apiKey
        this.logger = props.logger
        this.metric = props.metric
    }
    private lookUpModel(model: string): string {
        if (['stabilityai/sd-turbo', 'stabilityai/sdxl-turbo'].includes(model)) {
            return '/fast-turbo-diffusion'
        }
        if (['stabilityai/stable-diffusion-xl-base-1.0'].includes(model)) {
            return '/fast-sdxl'
        }
        if (['runwayml/stable-diffusion-v1-5'].includes(model)) {
            return '/lcm-sd15-i2i'
        }
        return '/fast-lightning-sdxl'
    }
    private lookupSize(width: number, height: number): "square_hd" | "square" | "portrait_4_3" | "portrait_16_9" | "landscape_4_3" | "landscape_16_9" {
        if (width < height) {
            return (width / height >= 0.75) ? 'portrait_4_3' : 'portrait_16_9'
        }
        if (width > height) {
            return (height / width >= 0.75) ? 'landscape_4_3' : 'landscape_16_9'
        }
        return width > 512 && height > 512 ? 'square_hd' : 'square'
    }

    public async txt2img(id: string, timestamp: number, params: Txt2imgInput, timeoutMS: number): Promise<GenerationOutput> {
        const size = this.lookupSize(params.width, params.height)
        const endpoint = this.lookUpModel(params.model_id)
        return await this.sendRequest(id, timestamp, endpoint, JSON.stringify({
            "prompt": params.prompt,
            "image_size": size,
            "num_inference_steps": 8,
            "num_images": params.num_images_per_prompt,
            "seed": params.seed
        }), timeoutMS)
    }

    public async img2vid(id: string, timestamp: number, params: Img2vidInput, timeoutMS: number): Promise<GenerationOutput> {
        const imgurl = fixTruncatedImageURL(params.image_url)
        return await this.sendRequest(id, timestamp, '/fast-svd', {
            image_url: imgurl,
            motion_bucket_id: params.motion_bucket_id,
            cond_aug: params.noise_aug_strength,
            fps: 6,
            seed: params.seed
        }, timeoutMS)
    }

    private async sendRequest(resId: string, resTimestamp: number, path: string, body: any, timeoutMs: number = 30000): Promise<GenerationOutput> {
        this.metric?.putMetrics({ keys: [`FALAIReq`, `FALAIReq:${path}`], value: 1, unit: MetricLoggerUnit.Count })
        const t = new Date().getTime()
        let resOutput: GenerationOutput | undefined = undefined
        let resError: SDProviderError | undefined = undefined

        try {
            const { status, data } = await axios.post(`${this.baseURL}${path}`, body, {
                headers: {
                    'Authorization': this.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: timeoutMs
            })
            if (data) {
                let images: GenerationOutputItem[] = []
                if (data.video) {
                    images = [{ url: data.video.url, seed: data.seed, nsfw: false }]
                }
                else if (data.images) {
                    images = data.images.map((item: { url: string, width: number, height: number, content_type: string }) => {
                        return {
                            url: item.url,
                            seed: data.seed.toString()
                        }
                    })
                }
                if (images && images.length > 0) {
                    resOutput = { images, id: resId, timestamp: resTimestamp, status: 'success' }
                }
                else {
                    resError = new SDProviderError('No assets', {
                        path: path,
                        status: status,
                    })
                }
            }
            else {
                resError = new SDProviderError('No data.', {
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
                this.metric?.putMetrics({ keys: [`FALAIError`, `FALAIError:${path}:${resError.info.status}`], value: 1, unit: MetricLoggerUnit.Count })
                this.logger?.error(resError.toLogger())
                throw resError
            }
            else {
                this.metric?.putMetrics({ keys: [`FALAI`, `FALAI:${path}`], value: 1, unit: MetricLoggerUnit.Count })
                this.metric?.putMetrics({ keys: ['FALAIDuration', `FALAIDuration:${path}`], value: dur, unit: MetricLoggerUnit.Milliseconds })
            }
            return resOutput!
        }
    }
}
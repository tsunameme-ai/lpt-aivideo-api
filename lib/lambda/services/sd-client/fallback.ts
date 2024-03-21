
import axios from 'axios'
import { ILogger, IMetric, MetricLoggerUnit } from '../metrics'
import { GenerationOutput, SDProviderError, Txt2imgInput } from './types'

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

    public async txt2img(id: string, params: Txt2imgInput): Promise<GenerationOutput> {
        const size = this.lookupSize(params.width, params.height)
        const endpoint = this.lookUpModel(params.model_id)
        const output = await this.sendRequest(endpoint, JSON.stringify({
            "prompt": params.prompt,
            "image_size": size,
            "num_inference_steps": 8,
            "num_images": params.num_images_per_prompt,
            "seed": params.seed
        }))
        return {
            ...output,
            id
        }
    }

    private async sendRequest(path: string, body: any, timeoutMs: number = 30000): Promise<GenerationOutput> {
        this.metric?.putMetrics({ keys: [`LPTReq`, `LPTReq:${path}`], value: 1, unit: MetricLoggerUnit.Count })
        const t = new Date().getTime()
        let resOutput = undefined
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
                this.metric?.putMetrics({ keys: [`FALAIError`, `FALAIError:${path}:${resError.info.status}`], value: 1, unit: MetricLoggerUnit.Count })
                this.logger?.error(resError.formatForLogger())
                throw resError
            }
            else {
                this.metric?.putMetrics({ keys: [`FALAI`, `FALAI:${path}`], value: 1, unit: MetricLoggerUnit.Count })
                this.metric?.putMetrics({ keys: ['FALAIDuration', `FALAIDuration:${path}`], value: dur, unit: MetricLoggerUnit.Milliseconds })
            }
            return resOutput
        }
    }
}
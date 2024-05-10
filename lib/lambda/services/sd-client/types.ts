import { VideoExtension } from "../ffmpeg/types"

export enum GenerationType {
    TXT2IMG = 'txt2img',
    IMG2IMG = 'img2img',
    IMG2VID = 'img2vid',
    IMG2VID_PENDING = 'img2vid-pending'
}
export type GenerationOutputItem = { url: string, seed: number | string }
export type GenerationOutput = {
    id: string,
    timestamp: number,
    status: 'pending' | 'success' | 'failed'
    images: Array<GenerationOutputItem>
}
export type Txt2imgInput = {
    'model_id': string,
    'prompt': string,
    'negative_prompt': string,
    'guidance_scale': number,
    'seed'?: number,
    'width': number,
    'height': number,
    'num_images_per_prompt': number
    'user_id': string
}

export type Img2imgInput = {
    'model_id': string,
    'prompt': string,
    'negative_prompt': string,
    'image_url': string,
    'strength': number
    'guidance_scale': number,
    'seed'?: number,
    'num_images_per_prompt': number
    'user_id': string
}

export type Img2vidInput = {
    id: string,
    'image_url': string,
    'model_id': string,
    width: number,
    height: number,
    seed?: number,
    motion_bucket_id: number,
    noise_aug_strength: number
    overlay_base64?: string
    overlay_text?: string
    image_generation_id?: string
    output_type?: VideoExtension
    output_width?: number
    'user_id': string,
    salt?: string
}
type DDBImg2vidInput = Omit<Img2vidInput, 'overlay_base64'>

export interface GenerationItem {
    id: string,
    timestamp: number,
    action: GenerationType,
    input: Txt2imgInput | Img2imgInput | DDBImg2vidInput,
    duration: number,
    outputs: Array<GenerationOutputItem>,
    userid?: string
    visibility?: string
}

export interface GenerationsPage {
    "next-page": string
    items: Array<GenerationItem>
}

interface LoggerSDProviderError {
    errInfo: SDProviderErrorInfo
    err: SDProviderError
}

interface SDProviderErrorInfo {
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

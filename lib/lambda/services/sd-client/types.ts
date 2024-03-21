
export enum GenerationType {
    TXT2IMG = 'txt2img',
    IMG2IMG = 'img2img',
    IMG2VID = 'img2vid'
}
export type GenerationOutputItem = { url: string, seed: number | string }
export type GenerationOutput = { id: string, images: Array<GenerationOutputItem> }
export type Txt2imgInput = {
    'model_id': string,
    'prompt': string,
    'negative_prompt': string,
    'guidance_scale': number,
    'seed'?: number,
    'width': number,
    'height': number,
    'num_images_per_prompt': number
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
}

export type VideoExtension = 'mp4' | 'gif'

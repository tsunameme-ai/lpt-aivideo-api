import { FFMPEGClient } from "../ffmpeg"
import { S3Client } from "../s3"

type GenerationOutput = { images: Array<{ url: string, seed: number | string }> }
type Txt2imgInput = {
    'model_id': string,
    'prompt': string,
    'negative_prompt': string,
    'guidance_scale': number,
    'seed': number,
    'width': number,
    'height': number,
    'num_images_per_prompt': number
}

type Img2vidInput = {
    'image_url': string,
    'model_id': string,
    width: number,
    height: number,
    motion_bucket_id: number,
    noise_aug_strength: number,
    'overlay_base64'?: string,
}

export class SDClient {
    private endpoint: string
    constructor(endpoint: string) {
        this.endpoint = endpoint
    }

    public async txt2img(params: Txt2imgInput): Promise<GenerationOutput> {
        const url = `${this.endpoint}/text-to-image`
        return await this.sendRequest(url, {
            method: 'POST',
            cache: 'no-cache',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(params)
        })
    }

    public async img2vid(params: Img2vidInput): Promise<GenerationOutput> {
        const imageData = await this.downloadImageData(params.image_url)
        const fd = new FormData()
        fd.append('image', imageData)
        fd.append('model_id', 'stabilityai/stable-video-diffusion-img2vid-xt')
        fd.append('width', params.width.toString())
        fd.append('height', params.height.toString())
        fd.append('motion_bucket_id', params.motion_bucket_id.toString())
        fd.append('noise_aug_strength', params.noise_aug_strength.toString())

        const url = `${this.endpoint}/image-to-video`
        const data = await this.sendRequest(url, {
            cache: 'no-cache',
            method: 'POST',
            body: fd,
        }, 600000)//10min

        const output0 = data.images[0]
        let videoUrl = output0.url
        const overlayImageBase64 = params.overlay_base64
        if (overlayImageBase64 && overlayImageBase64.length > 0) {
            try {
                videoUrl = await this.overlayImageOnVideo(videoUrl, overlayImageBase64, params.width)
            }
            catch (e) {

            }
        }
        return {
            images: [{ url: videoUrl, seed: output0.seed }]
        }
    }

    public async overlayImageOnVideo(videoUrl: string, imgBase64Str: string, width: number): Promise<string> {
        const s3BucketSrc = 'lpt-aivideo-src'
        const s3BucketDst = 'lpt-aivideo-dst'
        const videoId = Math.floor(new Date().getTime() / 1000).toString()
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

    private async downloadImageData(url: string) {
        const res = await fetch(url)
        if (res.ok) {
            return res.blob()
        }
        throw new Error(`Failed to download image from ${url}`)
    }

    private async sendRequest(url: string, init: RequestInit, timeoutMs: number = 40000): Promise<GenerationOutput> {
        const t = new Date().getTime()
        let resError
        let resOutput
        let status

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const res = await fetch(url, { ...init, signal: controller.signal })
            clearTimeout(timeoutId)
            status = res.status
            resOutput = await this.parseResponse(res)
        }
        catch (e: any) {
            console.error(e)
            resError = e
            status = e.status || 'ERROR'
        }
        finally {
            clearTimeout(timeoutId)
            const dur = (new Date().getTime() - t) / 1000
            const segs = url.split('/')
            console.log(`LIVEPEER REQ ${status} ${segs[segs.length - 1]} ${dur}`)
            if (resError) {
                throw resError
            }
            return resOutput!
        }
    }

    private async parseResponse(res: Response): Promise<{ images: Array<{ url: string, seed: number | string }> }> {
        if (res.ok) {
            const data = await res.json()
            const images = data.images.map((item: { url: string, seed?: number }) => {
                return {
                    url: item.url,
                    seed: item.seed
                }
            })
            return { images }
        }
        let errorMessage = ''
        try {
            const data = await res.json()
            errorMessage = data.error?.message || ''
        }
        catch (e) {
        }
        finally {
            throw new Error(`SD Provider Error: ${res.status} ${errorMessage}`)
        }
    }
}
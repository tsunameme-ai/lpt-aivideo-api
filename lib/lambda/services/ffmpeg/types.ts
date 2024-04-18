import { S3Client } from "../s3"

export type VideoExtension = 'mp4' | 'gif'
export enum VideoProcessingOperation {
    OVERLAY_IMAGE = 'overlay_image',
    TO_GIF = 'to_gif'
}

export interface VideoProcessingParams {
    s3: S3Client,
    s3BucketSrc: string,
    s3BucketDst: string,
    videoId: string,
    width: number,
    outputWidth: number
    ops: VideoProcessingOperation[]
}

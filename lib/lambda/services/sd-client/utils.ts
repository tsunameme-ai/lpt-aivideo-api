
//Use fixed image if url conains livepeer s3
export function fixTruncatedImageURL(url: string): string {
    return url.indexOf('https://storage.googleapis.com/livepeer-ai-video-dev') >= 0 ?
        `https://dca-fix-images.livepeer.fun/?image=${url}`
        : url
}
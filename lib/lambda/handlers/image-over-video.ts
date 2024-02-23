import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { SDClient } from '../services/stable-diffusion'

const composeResponse = (statusCode: number, body: any): APIGatewayProxyResult => {
    return {
        statusCode: statusCode,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    }
}

export const imageOverVideoHandler = async function (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const sdClient = new SDClient(process.env.SDPROVIDER_ENDPOINT!)
    const body = JSON.parse(event.body || '{}')
    const videoUrl = body.video_url
    const imgBase64Str = body.image_data
    const width = body.width
    try {
        const dest = sdClient.overlayImageOnVideo(videoUrl, imgBase64Str, width)
        return composeResponse(200, { url: dest })
    }
    catch (e: any) {
        return composeResponse(500, { error: e.message || 'Failed to overly image on video' })
    }
}

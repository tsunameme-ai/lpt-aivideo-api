import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { SDClient } from '../services/stable-diffusion'
import ShortUniqueId from 'short-unique-id'

const composeResponse = (statusCode: number, body: any): APIGatewayProxyResult => {
    return {
        statusCode: statusCode,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    }
}

export const imageOverVideoHandler = async function (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

    const sdClient = new SDClient({
        baseURL: process.env.SDPROVIDER_ENDPOINT!
    })
    const body = JSON.parse(event.body || '{}')
    const videoUrl = body.video_url
    const imgBase64Str = body.image_data
    const width = body.width
    const id = new ShortUniqueId({ length: 10 }).rnd()
    try {
        const dest = await sdClient.overlayImageOnVideo(id, videoUrl, imgBase64Str, width)
        return composeResponse(200, { url: dest })
    }
    catch (e: any) {
        return composeResponse(500, { error: e.message || 'Failed to overly image on video' })
    }
}

import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { SDClient } from "../services/stable-diffusion";

export const imageToVideoHandler = async function (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    console.log(`imageToVideo: ${JSON.stringify(event, null, 2)}`);
    const body = JSON.parse(event.body || '{}')
    const endpoint = process.env.SDPROVIDER_ENDPOINT!
    const sdClient = new SDClient(endpoint)
    try {
        const result = await sdClient.img2vid(body)
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(result)
        }
    }
    catch (e: any) {
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: e.message })
        }
    }
}
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { SDClient } from "../services/stable-diffusion";

export const textToImageHandler = async function (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const body = JSON.parse(event.body || '{}')
    const sdClient = new SDClient(process.env.SDPROVIDER_ENDPOINT!)
    try {
        const result = await sdClient.txt2img(body)
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
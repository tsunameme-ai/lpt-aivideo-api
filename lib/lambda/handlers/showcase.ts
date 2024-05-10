import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { default as bunyan, default as Logger } from 'bunyan'
import { DDBClient } from "../services/ddb-client";
import { composeApiResponse } from "../utils/apigateway";

const requestGenerationItem = async (ddbClient: DDBClient, id?: string): Promise<APIGatewayProxyResult> => {
    if (!id) {
        return composeApiResponse(400, { 'error': `id is required.` })
    }
    try {
        const result = await ddbClient.readGeneration(id)
        return composeApiResponse(200, result)
    }
    catch (e: any) {
        return composeApiResponse(e.status || e.info.status || 500, { 'error': `${e.message}` })
    }
}
const requestVideos = async (ddbClient: DDBClient, pageKey?: string, limit?: number): Promise<APIGatewayProxyResult> => {
    try {
        const result = await ddbClient.readVideos(pageKey, limit)
        return composeApiResponse(200, result)
    }
    catch (e: any) {
        return composeApiResponse(e.status || e.info.status || 500, { 'error': `${e.message}` })
    }
}
const requestVideosByUser = async (ddbClient: DDBClient, userId?: string, pageKey?: string, limit?: number): Promise<APIGatewayProxyResult> => {
    if (!userId) {
        return composeApiResponse(404, { 'error': `UserId is required.` })
    }
    try {
        const result = await ddbClient.readVideosByUser(userId, pageKey, limit)
        return composeApiResponse(200, result)
    }
    catch (e: any) {
        return composeApiResponse(e.status || e.info.status || 500, { 'error': `${e.message}` })
    }
}

export const showcaseHandler = async function (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    const logger: Logger = bunyan.createLogger({
        name: 'showcaseHandler',
        serializers: bunyan.stdSerializers,
        level: bunyan.INFO,
        requestId: context.awsRequestId,
    })
    logger.info(event)

    const ddbClient = new DDBClient({
        tableName: process.env.DDB_GENERATIONS_TABLENAME!,
        logger: logger
    })

    const pageKey = event.queryStringParameters?.page
    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters?.limit) : undefined
    if (event.path.startsWith('/v1/generations')) {
        //"GET /v1/generations"
        return await requestVideos(ddbClient, pageKey, limit)
    }
    else if (event.path.startsWith('/v1/generation')) {
        //"GET /v1/generation/{proxy+}"
        return await requestGenerationItem(ddbClient, event.pathParameters?.proxy)
    }
    else if (event.path.startsWith('/v1/usergens')) {
        //"GET /v1/usergens/{proxy+}"
        return await requestVideosByUser(ddbClient, event.pathParameters?.proxy, pageKey, limit)
    }
    return composeApiResponse(400, { error: `${event.path} is not supported` })
}
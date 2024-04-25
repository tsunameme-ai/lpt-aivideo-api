import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { default as bunyan, default as Logger } from 'bunyan'
import { DDBClient } from "../services/ddb-client";

const requestGenerationItem = async (ddbClient: DDBClient, id?: string): Promise<APIGatewayProxyResult> => {
    if (!id) {
        return {
            statusCode: 404,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 'error': `id is required.` })
        }
    }
    try {
        const result = await ddbClient.readGeneration(id)
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(result)
        }
    }
    catch (e: any) {
        return {
            statusCode: e.status || e.info.status || 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 'error': `${e.message}` })
        }
    }
}
const requestVideos = async (ddbClient: DDBClient, pageKey?: string, limit?: number): Promise<APIGatewayProxyResult> => {
    try {
        const result = await ddbClient.readVideos(pageKey, limit)
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(result)
        }
    }
    catch (e: any) {
        return {
            statusCode: e.status || e.info.status || 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 'error': `${e.message}` })
        }
    }
}
const requestVideosByUser = async (ddbClient: DDBClient, userId?: string, pageKey?: string, limit?: number): Promise<APIGatewayProxyResult> => {
    if (!userId) {
        return {
            statusCode: 404,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 'error': `UserId is required.` })
        }
    }
    try {
        const result = await ddbClient.readVideosByUser(userId, pageKey, limit)
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(result)
        }
    }
    catch (e: any) {
        return {
            statusCode: e.status || e.info.status || 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 'error': `${e.message}` })
        }
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

    const segs = event.requestContext.routeKey!.split('/')
    const pageKey = event.queryStringParameters?.page
    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters?.limit) : undefined
    if (segs.includes('generations') && segs.includes('user')) {
        //"GET /v1/user/{userId}/generations/"
        return await requestVideosByUser(ddbClient, event.pathParameters?.userId, pageKey, limit)
    }
    if (segs.includes('generations')) {
        //"GET /v1/generations"
        return await requestVideos(ddbClient, pageKey, limit)
    }
    if (segs.includes('generation')) {
        //"GET /v1/generation/{gid}"
        return await requestGenerationItem(ddbClient, event.pathParameters?.generationId)
    }
    return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: `${event.requestContext.routeKey} is not supported` })
    }
}
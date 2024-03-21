import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { default as bunyan, default as Logger } from 'bunyan'
import { DDBClient } from "../services/ddb-client";

const requestGenerationItem = async (ddbClient: DDBClient, id: string | undefined): Promise<APIGatewayProxyResult> => {
    if (!id) {
        return {
            statusCode: 404,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 'error': `${id} does not exist.` })
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
const requestVideos = async (ddbClient: DDBClient, pageKey: string | undefined): Promise<APIGatewayProxyResult> => {
    try {
        const result = await ddbClient.readVideos(pageKey)
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
    const segs = event.requestContext.routeKey!.split('/')
    const isGenerationItem = !segs.includes('generations')

    const ddbClient = new DDBClient({
        tableName: process.env.DDB_GENERATIONS_TABLENAME!,
        logger: logger
    })
    if (isGenerationItem) {
        return await requestGenerationItem(ddbClient, event.pathParameters?.generationId)
    }
    const pageKey = event.queryStringParameters?.page
    return await requestVideos(ddbClient, pageKey)
}
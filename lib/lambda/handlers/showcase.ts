import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { default as bunyan, default as Logger } from 'bunyan'
import { DDBClient } from "../services/ddb-client";


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
    const id = event.pathParameters?.generationId
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
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { SDClient } from "../services/sd-client";
import { AWSMetricsLogger, StackType } from "../services/metrics";
import { default as bunyan, default as Logger } from 'bunyan'
import { DDBClient } from "../services/ddb-client";
import ShortUniqueId from "short-unique-id";
import { GenerationType } from "../services/sd-client/types";
import { FalAIClient } from "../services/sd-client/fallback";
import { composeApiResponse } from "../utils/apigateway";


export const textToImageHandler = async function (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    const metric = new AWSMetricsLogger(StackType.LAMBDA)
    const logger: Logger = bunyan.createLogger({
        name: 'textToImageHandler',
        serializers: bunyan.stdSerializers,
        level: bunyan.INFO,
        requestId: context.awsRequestId,
    })
    logger.info(event)

    const sdClient = new SDClient({
        baseURL: process.env.SDPROVIDER_ENDPOINT!,
        logger,
        metric,
        fallbackClient: new FalAIClient({
            baseURL: process.env.FALAI_ENDPOINT!,
            apiKey: process.env.FALAI_APIKEY!,
            logger,
            metric
        })
    })
    const ddbClient = new DDBClient({
        tableName: process.env.DDB_GENERATIONS_TABLENAME!,
        logger: logger
    })
    try {
        const timestamp = new Date().getTime()
        const body = JSON.parse(event.body || '{}')
        const id = new ShortUniqueId({ length: 10 }).rnd()
        const result = await sdClient.txt2img(id, timestamp, body)
        if (body.width > 100 && body.height > 100) {
            await ddbClient.saveGeneration({
                id: id,
                action: GenerationType.TXT2IMG,
                input: body,
                outputs: result.images,
                timestamp: timestamp,
                duration: new Date().getTime() - timestamp
            })
        }
        return composeApiResponse(200, result)
    }
    catch (e: any) {
        logger.error(e)
        return composeApiResponse(e?.status || e?.info?.status || 500, { error: e.message })
    }
    finally {
        await metric.flush()
    }
}
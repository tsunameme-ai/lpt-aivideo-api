import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { SDClient } from "../services/sd-client";
import { AWSMetricsLogger, StackType } from "../services/metrics";
import { default as bunyan, default as Logger } from 'bunyan'
import { DDBClient } from "../services/ddb-client";
import ShortUniqueId from "short-unique-id";
import { GenerationType } from "../services/sd-client/types";


export const imageToImageHandler = async function (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {

    const metric = new AWSMetricsLogger(StackType.LAMBDA)
    const logger: Logger = bunyan.createLogger({
        name: 'imageToImageHandler',
        serializers: bunyan.stdSerializers,
        level: bunyan.INFO,
        requestId: context.awsRequestId,
    })
    logger.info(event)

    const sdClient = new SDClient({
        baseURL: process.env.SDPROVIDER_ENDPOINT!,
        logger,
        metric
    })
    const ddbClient = new DDBClient({
        tableName: process.env.DDB_GENERATIONS_TABLENAME!,
        logger: logger
    })
    try {
        const timestamp = new Date().getTime()
        const body = JSON.parse(event.body || '{}')
        const id = new ShortUniqueId({ length: 10 }).rnd()
        const result = await sdClient.img2img(id, body)
        await ddbClient.saveGeneration({
            id: id,
            action: GenerationType.IMG2IMG,
            input: body,
            outputs: result.images,
            timestamp: timestamp,
            duration: new Date().getTime() - timestamp
        })
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(result)
        }
    }
    catch (e: any) {
        logger.error(e)
        return {
            statusCode: e.status || e.info.status || 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: e.message })
        }
    }
    finally {
        await metric.flush()
    }
}
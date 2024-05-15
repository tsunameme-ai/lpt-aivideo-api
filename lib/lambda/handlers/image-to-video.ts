import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { SDClient } from "../services/sd-client";
import { AWSMetricsLogger, StackType } from "../services/metrics";
import { default as bunyan, default as Logger } from 'bunyan'
import ShortUniqueId from "short-unique-id";
import { DDBClient } from "../services/ddb-client";
import { GenerationType } from "../services/sd-client/types";
import { FalAIClient } from "../services/sd-client/fallback";
import { composeApiResponse } from "../utils/apigateway";
import { shareOnDiscord } from "../utils/processor";


export const imageToVideoHandler = async function (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    const metric = new AWSMetricsLogger(StackType.LAMBDA)
    const logger: Logger = bunyan.createLogger({
        name: 'imageToVideoHandler',
        serializers: bunyan.stdSerializers,
        level: bunyan.INFO,
        requestId: context.awsRequestId
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
        const result = await sdClient.img2vid(id, timestamp, body)
        const input = {
            ...body
        }
        delete input.overlay_base64
        const nsfw = result.images[0].nsfw
        await ddbClient.saveGeneration({
            id: id,
            action: GenerationType.IMG2VID,
            input,
            outputs: result.images,
            timestamp: timestamp,
            duration: new Date().getTime() - timestamp,
            userid: input.user_id,
            visibility: nsfw ? 'private' : 'community'
        })
        if (!nsfw) {
            await shareOnDiscord(result.images[0].url, logger)
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
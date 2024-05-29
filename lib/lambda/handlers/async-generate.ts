import { Context } from "aws-lambda"
import bunyan from "bunyan"
import { AWSMetricsLogger, ILogger, StackType } from "../services/metrics"
import Logger from "bunyan"
import { SDClient } from "../services/sd-client"
import { FalAIClient } from "../services/sd-client/fallback"
import { DDBClient } from "../services/ddb-client"
import { GenerationType, Img2vidInput } from "../services/sd-client/types"
import { shareOnDiscord } from "../utils/processor"

export type AsyncGenerateEventInfo = {
    id: string,
    timestamp: number,
    genpath: 'image-to-video'
    input: Img2vidInput

}
export const asyncGenerateHandler = async function (event: AsyncGenerateEventInfo, context: Context): Promise<void> {
    const metric = new AWSMetricsLogger(StackType.LAMBDA)
    const logger: Logger = bunyan.createLogger({
        name: 'asyncGenerateHandler',
        serializers: bunyan.stdSerializers,
        level: bunyan.INFO,
        requestId: context.awsRequestId
    })
    logger.info(event)

    const ddbClient = new DDBClient({
        tableName: process.env.DDB_GENERATIONS_TABLENAME!,
        logger: logger
    })

    const sdClient = new SDClient({
        baseURL: process.env.SDPROVIDER_ENDPOINT!,
        logger,
        metric,
        ddbClient: ddbClient,
        fallbackClient: new FalAIClient({
            baseURL: process.env.FALAI_ENDPOINT!,
            apiKey: process.env.FALAI_APIKEY!,
            logger,
            metric
        })
    })
    try {
        const result = await sdClient.img2vid(event.id, event.timestamp, event.input)
        const input = event.input
        delete input.overlay_base64

        const nsfw = result.images[0].nsfw
        await ddbClient.saveGeneration({
            id: event.id,
            action: GenerationType.IMG2VID,
            input,
            outputs: result.images,
            timestamp: event.timestamp,
            duration: new Date().getTime() - event.timestamp,
            userid: input.user_id,
            visibility: nsfw ? 'private' : 'community'
        })
        if (!nsfw) {
            await shareOnDiscord(result.images[0].url, logger)
        }
    }
    catch (e: any) {
        logger.error(e)
    }
    finally {
        await metric.flush()
    }
}
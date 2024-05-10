import { Context } from "aws-lambda"
import bunyan from "bunyan"
import { AWSMetricsLogger, StackType } from "../services/metrics"
import Logger from "bunyan"
import { SDClient } from "../services/sd-client"
import { FalAIClient } from "../services/sd-client/fallback"
import { DDBClient } from "../services/ddb-client"
import { GenerationType } from "../services/sd-client/types"

export type AsyncGenerateEventInfo = {
    id: string,
    timestamp: number,
    genpath: 'image-to-video'
    input: any

}
export const asyncGenerateHandler = async function (event: AsyncGenerateEventInfo, context: Context): Promise<void> {
    console.log(`??? asyncGenerateHandler triggered `)
    const metric = new AWSMetricsLogger(StackType.LAMBDA)
    const logger: Logger = bunyan.createLogger({
        name: 'asyncGenerateHandler',
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
        const body = JSON.parse(event.input || '{}')
        const result = await sdClient.img2vid(body.id, timestamp, body)
        const input = event.input
        delete input.overlay_base64
        await ddbClient.saveGeneration({
            id: event.input,
            action: GenerationType.IMG2VID,
            input,
            outputs: result.images,
            timestamp: timestamp,
            duration: new Date().getTime() - timestamp,
            userid: input.user_id,
            visibility: 'community'
        })
        // await shareOnDiscord(result.images[0].url, logger)
    }
    catch (e: any) {
        logger.error(e)
    }
    finally {
        await metric.flush()
    }
}
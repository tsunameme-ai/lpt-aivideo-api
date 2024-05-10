import { Context } from "aws-lambda"
import bunyan from "bunyan"
import { AWSMetricsLogger, ILogger, StackType } from "../services/metrics"
import Logger from "bunyan"
import { SDClient } from "../services/sd-client"
import { FalAIClient } from "../services/sd-client/fallback"
import { DDBClient } from "../services/ddb-client"
import { GenerationType, Img2vidInput } from "../services/sd-client/types"
import axios from "axios"

const shareOnDiscord = async (url: string, logger: ILogger) => {
    if (process.env.DISCORD_WEBHOOK) {
        try {
            const res = await axios.post(process.env.DISCORD_WEBHOOK, { content: url });
            if (![200, 201, 204].includes(res.status)) {
                logger.error(`Discord fail ${res.status}`)
            }
        }
        catch (e) {
            logger.error(e)
        }
    }
}
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
        console.log(`??? asyncGenerateHandler sd gen `)
        const result = await sdClient.img2vid(event.id, event.timestamp, event.input)
        console.log(`??? asyncGenerateHandler sd gen result `)
        console.log(result)
        const input = event.input
        delete input.overlay_base64
        await ddbClient.saveGeneration({
            id: event.id,
            action: GenerationType.IMG2VID,
            input,
            outputs: result.images,
            timestamp: event.timestamp,
            duration: new Date().getTime() - event.timestamp,
            userid: input.user_id,
            visibility: 'community'
        })
        console.log(`??? asyncGenerateHandler sd gen `)
        await shareOnDiscord(result.images[0].url, logger)
    }
    catch (e: any) {
        logger.error(e)
    }
    finally {
        await metric.flush()
    }
}
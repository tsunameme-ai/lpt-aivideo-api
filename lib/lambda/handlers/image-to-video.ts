import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { SDClient, SDProviderError } from "../services/stable-diffusion";
import axios from 'axios'
import { AWSMetricsLogger, ILogger, IMetric, StackType } from "../services/metrics";
import { default as bunyan, default as Logger } from 'bunyan'

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

export const imageToVideoHandler = async function (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    const metric = new AWSMetricsLogger(StackType.LAMBDA)
    const logger: Logger = bunyan.createLogger({
        name: 'imageToVideoHandler',
        serializers: bunyan.stdSerializers,
        level: bunyan.INFO,
        requestId: context.awsRequestId,
        // query: event.info.fieldName,
    })
    logger.info(event)

    const sdClient = new SDClient({
        baseURL: process.env.SDPROVIDER_ENDPOINT!,
        logger,
        metric
    })
    try {
        const body = JSON.parse(event.body || '{}')
        const result = await sdClient.img2vid(body)
        await shareOnDiscord(result.images[0].url, logger)
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(result)
        }
    }
    catch (e: any) {
        if (!(e instanceof SDProviderError)) {
            logger.error(e)
        }
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
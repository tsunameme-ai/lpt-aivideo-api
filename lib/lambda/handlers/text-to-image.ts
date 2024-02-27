import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { SDClient, SDProviderError } from "../services/stable-diffusion";
import { AWSMetricsLogger, StackType } from "../services/metrics";
import { default as bunyan, default as Logger } from 'bunyan'

export const textToImageHandler = async function (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {

    const metric = new AWSMetricsLogger(StackType.LAMBDA)
    const logger: Logger = bunyan.createLogger({
        name: 'textToImageHandler',
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
        const result = await sdClient.txt2img(body)
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
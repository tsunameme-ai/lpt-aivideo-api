import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { GenerationType, SDClient, SDProviderError } from "../services/stable-diffusion";
import { AWSMetricsLogger, StackType } from "../services/metrics";
import { default as bunyan, default as Logger } from 'bunyan'
// import DynamoDB from "aws-sdk/clients/dynamodb";
import { DynamoDB } from "aws-sdk";
import { DDBGenerationsClient } from "../services/ddb-generations-table";
import ShortUniqueId from "short-unique-id";


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
        metric
    })
    const ddbClient = new DDBGenerationsClient(process.env.DDB_GENERATIONS_TABLENAME!)
    try {
        const timestamp = new Date().getTime()
        const body = JSON.parse(event.body || '{}')
        const id = new ShortUniqueId({ length: 10 }).rnd()
        const result = await sdClient.txt2img(id, body)
        await ddbClient.saveGeneration({
            id: id,
            action: GenerationType.TXT2IMG,
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
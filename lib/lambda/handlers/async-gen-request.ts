import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { AWSMetricsLogger, ILogger, StackType } from "../services/metrics";
import { default as bunyan, default as Logger } from 'bunyan'
import ShortUniqueId from "short-unique-id";
import { DDBClient } from "../services/ddb-client";
import { GenerationType } from "../services/sd-client/types";
import { Lambda } from 'aws-sdk'
import { composeApiResponse } from "../utils/apigateway";
import { AsyncGenerateEventInfo } from "./async-generate";

const invokeAsyncProcessor = (event: AsyncGenerateEventInfo) => {
    const lambda = new Lambda()
    const lambdaParams = {
        FunctionName: process.env.ASYNC_GENERATE_LAMBDA!,
        InvocationType: 'Event',
        Payload: JSON.stringify(event),
    }
    return new Promise((resolve, reject) => {
        lambda.invoke(lambdaParams, (err, data) => {
            if (err) {
                reject(err)
            } else {
                resolve(data)
            }
        })
    })
}

const imageToVideo = async (event: APIGatewayProxyEvent, logger?: ILogger): Promise<APIGatewayProxyResult> => {
    const ddbClient = new DDBClient({
        tableName: process.env.DDB_GENERATIONS_TABLENAME!,
        logger: logger
    })
    const timestamp = new Date().getTime()
    const input = JSON.parse(event.body || '{}')
    const id = new ShortUniqueId({ length: 10 }).rnd()
    console.log(`??? invokeAsyncProcessor`)
    const result = await invokeAsyncProcessor({
        genpath: 'image-to-video',
        id,
        timestamp,
        input
    })
    console.log(`??? lambda invoke result`)
    console.log(result)

    delete input.overlay_base64
    await ddbClient.saveGeneration({
        id: id,
        action: GenerationType.IMG2VID_PENDING,
        input,
        outputs: [],
        timestamp: timestamp,
        duration: new Date().getTime() - timestamp,
        userid: input.user_id,
        visibility: 'community'
    })
    return composeApiResponse(200, {
        id: id,
        timestamp: timestamp,
        status: 'pending',
        images: []
    })
}

export const asyncGenRequestHandler = async function (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    const metric = new AWSMetricsLogger(StackType.LAMBDA)
    const logger: Logger = bunyan.createLogger({
        name: 'asyncGenRequestHandler',
        serializers: bunyan.stdSerializers,
        level: bunyan.INFO,
        requestId: context.awsRequestId
    })
    logger.info(event)

    if (event.path === '/v1/async/image-to-video') {
        //POST /v1/async/image-to-video
        try {
            await imageToVideo(event)
        }
        catch (e: any) {
            return composeApiResponse(e.status || e.info.status || 500, { error: e.message })
        }
        finally {
            await metric.flush()
        }
    }
    return composeApiResponse(400, { error: `${event.path} is not supported` })
}
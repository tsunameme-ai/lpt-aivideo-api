import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { default as bunyan, default as Logger } from 'bunyan'
import { DDBClient } from "../services/ddb-client";
import { AuthError, JwtAuthorizer } from "../services/auth/jwt";
import { composeApiResponse } from "../utils/apigateway";
import { S3Client } from "../services/s3";
import { ILogger } from "../services/metrics";
import { parseBase64Image } from "../utils/processor";
import ShortUniqueId from "short-unique-id";

const claim = async (event: APIGatewayProxyEvent, logger: ILogger): Promise<APIGatewayProxyResult> => {
    if (!event.queryStringParameters?.salt) {
        return composeApiResponse(401, { success: false, error: `Invalid salt` })
    }
    try {
        const { userId, assetId } = await authUser(event, logger)
        const ddbClient = new DDBClient({
            tableName: process.env.DDB_GENERATIONS_TABLENAME!,
            logger: logger
        })
        await ddbClient.claim(userId, assetId, event.queryStringParameters?.salt)
        return composeApiResponse(200, { success: true })
    }
    catch (error: any) {
        return composeApiResponse(error?.status || error?.info?.status || 500, { success: false, error })
    }
}

const togglePublish = async (event: APIGatewayProxyEvent, publishOn: boolean, logger: ILogger): Promise<APIGatewayProxyResult> => {
    try {
        const { userId, assetId } = await authUser(event, logger)
        const ddbClient = new DDBClient({
            tableName: process.env.DDB_GENERATIONS_TABLENAME!,
            logger: logger
        })
        await ddbClient.togglePublish(userId, assetId, publishOn)
        return composeApiResponse(200, { success: true })
    }
    catch (error: any) {
        return composeApiResponse(error?.status || error?.info?.status || 500, { success: false, error })
    }
}
const uploadImage = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const body = JSON.parse(event.body || '{}')
        const imgBase64Str = body.image
        if (!imgBase64Str || imgBase64Str.length === 0) {
            return composeApiResponse(400, { error: 'Invalid image data' })
        }

        const id = new ShortUniqueId({ length: 10 }).rnd()
        const s3Client = new S3Client()
        const { data: imgData, type: imgType } = parseBase64Image(imgBase64Str)
        const destUrl = await s3Client.upload({
            Bucket: 'lpt-aivideo-dst', Key: `tsunameme-${id}.png`, Body: imgData,
            // ContentEncoding: 'base64',
            ContentType: `image/${imgType}`
        })
        return composeApiResponse(200, { url: destUrl })
    }
    catch (error: any) {
        return composeApiResponse(error?.status || error?.info?.status || 500, { error })
    }
}

const authUser = async (event: APIGatewayProxyEvent, logger: ILogger): Promise<{ userId: string, assetId: string }> => {
    const accessToken = (event.headers.Authorization || '').replace('Bear ', '')
    if (!accessToken) {
        throw new AuthError(401, 'Access token is not present')
    }
    const authorizer = new JwtAuthorizer(process.env.PRIVY_APPID!, logger)
    const authResult = await authorizer.verify(accessToken)
    if (!authResult.isValid) {
        throw new AuthError(403, 'Invalid accessToken')
    }
    const assetId = event.pathParameters?.proxy
    const userId = event.queryStringParameters?.user
    if (!userId || !assetId) {
        throw new AuthError(403, 'userId and assetId are required.')
    }
    if (authResult.userId != userId) {
        throw new AuthError(403, 'Invalid userId.')
    }
    return {
        userId,
        assetId
    }
}

export const userAssetHandler = async function (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    const logger: Logger = bunyan.createLogger({
        name: 'userAssetHandler',
        serializers: bunyan.stdSerializers,
        level: bunyan.INFO,
        requestId: context.awsRequestId,
    })
    logger.info(event)

    if (event.path.startsWith('/v1/claim')) {
        // GET /v1/claim/{proxy|asset}?user={user}
        return await claim(event, logger)
    }
    else if (event.path.startsWith('/v1/publish')) {
        // GET /v1/publish/{proxy|asset}?user={user}
        if (event.httpMethod === 'GET') {
            return await togglePublish(event, true, logger)
        }
        if (event.httpMethod === 'DELETE') {
            return await togglePublish(event, false, logger)
        }
    }
    else if (event.path.startsWith('/v1/upload/image')) {
        // POST /v1/upload/image
        return await uploadImage(event)
    }
    return composeApiResponse(400, { error: `${event.path} is not supported` })
}
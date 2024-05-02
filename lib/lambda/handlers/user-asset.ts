import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { default as bunyan, default as Logger } from 'bunyan'
import { DDBClient } from "../services/ddb-client";
import { JwtAuthorizer } from "../services/auth/jwt";


const claim = async (ddbClient: DDBClient, userId: string, assetId: string, salt: string): Promise<APIGatewayProxyResult> => {
    try {
        await ddbClient.claim(userId, assetId, salt)
        return composeResponse(200)

    }
    catch (e: any) {
        return composeResponse(e.status || e.info.status || 500)
    }
}

const publish = async (ddbClient: DDBClient, userId: string, assetId: string): Promise<APIGatewayProxyResult> => {
    try {
        await ddbClient.publish(userId, assetId)
        return composeResponse(200)
    }
    catch (e: any) {
        return composeResponse(e.status || e.info.status || 500)
    }
}
const composeResponse = (status: number, error?: string): APIGatewayProxyResult => {
    if (status === 200) {
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ success: true })
        }
    }
    return {
        statusCode: status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error })
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
    const accessToken = (event.headers.Authorization || '').replace('Bear ', '')
    if (!accessToken) {
        return composeResponse(401)
    }
    const authorizer = new JwtAuthorizer(process.env.PRIVY_APPID!, logger)
    const authResult = await authorizer.verify(accessToken)
    if (!authResult.isValid) {
        return composeResponse(401, 'Invalid accessToken')
    }
    const assetId = event.pathParameters?.proxy
    const userId = event.queryStringParameters?.user
    if (!userId || !assetId) {
        return composeResponse(400, `userId and assetId are required.`)
    }
    if (authResult.userId != userId) {
        return composeResponse(401, 'Invalid accessToken')
    }
    const ddbClient = new DDBClient({
        tableName: process.env.DDB_GENERATIONS_TABLENAME!,
        logger: logger
    })

    if (event.path.startsWith('/v1/claim')) {
        // GET /v1/claim/{proxy|asset}?user={user}
        if (!event.queryStringParameters?.salt) {
            return composeResponse(401, 'Invalid salt')
        }
        return await claim(ddbClient, userId, assetId, event.queryStringParameters?.salt)
    }
    else if (event.path.startsWith('/v1/publish')) {
        // GET /v1/publish/{proxy|asset}?user={user}
        return await publish(ddbClient, userId, assetId)
    }
    return composeResponse(400, `${event.path} is not supported`)
}
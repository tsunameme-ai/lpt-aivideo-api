import { APIGatewayProxyResult } from "aws-lambda"

export const composeApiResponse = (status: number, body: any): APIGatewayProxyResult => {
    if (status === 200) {
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        }
    }
    return {
        statusCode: status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    }
}
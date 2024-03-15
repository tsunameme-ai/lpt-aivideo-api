import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { AttributeType } from 'aws-cdk-lib/aws-dynamodb'
import { DynamoDB } from 'aws-sdk'
import { GenerationOutputItem, GenerationType, Img2imgInput, Img2vidInput, Txt2imgInput } from '../sd-client'
import { ILogger } from '../metrics'

type DDBImg2vidInput = Omit<Img2vidInput, 'overlay_base64'>;
export interface LoggerDDBError {
    errInfo: DDBErrorInfo
    err: DDBError
}

export interface DDBErrorInfo {
    status: number,
    access: 'query' | 'scan' | 'batchwrite',
    filter?: { [key: string]: string }
}

export class DDBError extends Error {
    info: DDBErrorInfo

    constructor(message: string, info: DDBErrorInfo) {
        super(message)
        this.name = 'DDBError'
        this.info = info
    }

    public formatForLogger(): LoggerDDBError {
        return { errInfo: this.info, err: this }
    }
}

export class DDBClient {
    public static createTable(scope: Construct, tableName: string, type: 'pending-requests' | 'generations') {
        if (type === 'generations') {
            return new cdk.aws_dynamodb.Table(scope, tableName, {
                tableName: tableName,
                partitionKey: { name: 'id', type: AttributeType.STRING },
                sortKey: { name: 'timestamp', type: AttributeType.NUMBER },
                pointInTimeRecovery: true,
                billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
                removalPolicy: cdk.RemovalPolicy.RETAIN,
            })
        }
        else {
            return new cdk.aws_dynamodb.Table(scope, tableName, {
                tableName: tableName,
                partitionKey: { name: 'id', type: AttributeType.STRING },
                sortKey: { name: 'timestamp', type: AttributeType.NUMBER },
                pointInTimeRecovery: true,
                billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
                removalPolicy: cdk.RemovalPolicy.RETAIN,
            })
        }
    }
    private tableName: string
    private logger?: ILogger
    private ddb = new DynamoDB.DocumentClient()
    constructor(props: { tableName: string, logger?: ILogger }) {
        this.tableName = props.tableName
        this.logger = props.logger
    }
    public async saveGeneration(item: {
        id: string,
        action: GenerationType,
        input: Txt2imgInput | Img2imgInput | DDBImg2vidInput,
        outputs: Array<GenerationOutputItem>
        timestamp: number,
        duration: number
    }) {
        let itemToSave = item
        const putReqs = [{
            PutRequest: {
                Item: itemToSave,
            },
        }]
        const req = {
            RequestItems: {
                [this.tableName]: putReqs,
            },
        }
        try {
            return await this.ddb.batchWrite(req).promise()
        }
        catch (e: any) {
            const de = new DDBError(e.message, {
                status: 500,
                access: 'batchwrite',
            })
            de.stack = e.stack
            throw de
        }
    }
    public async readGeneration(id: string): Promise<any> {
        let ddbError = null
        try {
            const result = await this.ddb.query({
                TableName: this.tableName,
                KeyConditionExpression: "id = :id",
                ExpressionAttributeValues: { ":id": id }
            }).promise()

            if (result.Items && result.Items.length > 0) {
                return result.Items[0]
            }
            ddbError = new DDBError(`No result`, {
                status: 404,
                access: 'query',
                filter: { id: id }
            })
        }
        catch (e: any) {
            ddbError = new DDBError(e.message, {
                status: 500,
                access: 'query',
                filter: { id: id }
            })
            ddbError.stack = e.stack
        }
        finally {
            if (ddbError) {
                this.logger?.error(ddbError.formatForLogger())
                throw ddbError
            }
        }
    }
}
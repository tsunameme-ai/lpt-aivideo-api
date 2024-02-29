import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { AttributeType } from 'aws-cdk-lib/aws-dynamodb'
import { DynamoDB } from 'aws-sdk'
import { GenerationOutputItem, GenerationType, Txt2imgInput } from '../stable-diffusion'
import { ILogger } from '../metrics'

enum DDB_GENERATIONS_FIELD {
    ID = 'id',
    TIMESTAMP = 'timestamp'
}

export interface LoggerDDBError {
    errInfo: DDBErrorInfo
    err: DDBError
}

export interface DDBErrorInfo {
    status: number,
    access: 'query' | 'scan',
    filter: { [key: string]: string }
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

export class DDBGenerationsClient {
    public static createTable(scope: Construct, tableName: string) {
        return new cdk.aws_dynamodb.Table(scope, tableName, {
            tableName: tableName,
            partitionKey: { name: DDB_GENERATIONS_FIELD.ID, type: AttributeType.STRING },
            sortKey: { name: DDB_GENERATIONS_FIELD.TIMESTAMP, type: AttributeType.NUMBER },
            pointInTimeRecovery: true,
            billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        })
    }
    private tableName: string
    private logger?: ILogger
    private ddb = new DynamoDB.DocumentClient()
    constructor(props: { tableName: string, logger?: ILogger }) {
        this.tableName = props.tableName
        this.logger = props.logger
    }
    public async saveGeneration(params: {
        id: string,
        action: GenerationType,
        input: Txt2imgInput,
        outputs: Array<GenerationOutputItem>
        timestamp: number,
        duration: number
    }) {
        const item = params
        const putReqs = [{
            PutRequest: {
                Item: item,
            },
        }]
        const req = {
            RequestItems: {
                [this.tableName]: putReqs,
            },
        }
        try {
            await this.ddb.batchWrite(req).promise()
        }
        catch (e) {
            console.log(JSON.stringify(item))
            console.error(e)
        }
    }
    public async readRecord(id: string): Promise<any> {
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
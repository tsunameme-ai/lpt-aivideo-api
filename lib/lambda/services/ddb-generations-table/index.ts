import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { AttributeType } from 'aws-cdk-lib/aws-dynamodb'
import { DynamoDB } from 'aws-sdk'
import { GenerationOutputItem, GenerationType, Txt2imgInput } from '../stable-diffusion'

enum DDB_GENERATIONS_FIELD {
    ID = 'id',
    TIMESTAMP = 'timestamp'
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
    private ddb = new DynamoDB.DocumentClient()
    constructor(tableName: string) {
        this.tableName = tableName
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
}
import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { AttributeType } from 'aws-cdk-lib/aws-dynamodb'
import { DynamoDB } from 'aws-sdk'
import { ILogger } from '../metrics'
import { GenerationItem, GenerationType, GenerationsPage } from '../sd-client/types'

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

const GSI_ACTION_TIMESTAMP_INDEX = 'action-timestamp-index'
const GSI_USERID_TIMESTAMP_INDEX = 'userid-timestamp-index'

const GSI: { [key: string]: { partitionKey: string, partitionKeyType: AttributeType, sortKey: string, sortKeyType: AttributeType } } = {
    [GSI_ACTION_TIMESTAMP_INDEX]: { partitionKey: 'action', partitionKeyType: AttributeType.STRING, sortKey: 'timestamp', sortKeyType: AttributeType.NUMBER },
    [GSI_USERID_TIMESTAMP_INDEX]: { partitionKey: 'userid', partitionKeyType: AttributeType.STRING, sortKey: 'timestamp', sortKeyType: AttributeType.NUMBER },
}

export class DDBClient {
    public static createTable(scope: Construct, tableName: string, type: 'pending-requests' | 'generations') {
        if (type === 'generations') {
            const indexesToCreate = { ...GSI }
            const table = new cdk.aws_dynamodb.Table(scope, tableName, {
                tableName: tableName,
                partitionKey: { name: 'id', type: AttributeType.STRING },
                sortKey: { name: 'timestamp', type: AttributeType.NUMBER },
                pointInTimeRecovery: true,
                billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
                removalPolicy: cdk.RemovalPolicy.RETAIN,
            })
            const ddb = new DynamoDB()
            ddb.describeTable({ TableName: tableName }, (_, data: DynamoDB.Types.DescribeTableOutput) => {
                const indexes = data?.Table?.GlobalSecondaryIndexes || []
                const indexNames = indexes.map(item => {
                    return item.IndexName
                })
                const keys = Object.keys(indexesToCreate)
                for (let key of keys) {
                    if (indexNames.includes(key)) {
                        delete indexesToCreate[key]
                    }
                }
            })
            const ins = Object.keys(indexesToCreate)
            console.log(`indexes to create ${ins}`)
            if (ins.length > 0) {
                for (let iname of ins) {
                    const itc = indexesToCreate[iname]
                    table.addGlobalSecondaryIndex({
                        indexName: iname,
                        partitionKey: { name: itc.partitionKey, type: itc.partitionKeyType },
                        sortKey: { name: itc.sortKey, type: itc.sortKeyType }
                    })
                }
            }
            return table
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
    public async saveGeneration(item: GenerationItem) {
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
    public async readGeneration(id: string): Promise<GenerationItem> {
        let ddbError = null
        try {
            const result = await this.ddb.query({
                TableName: this.tableName,
                KeyConditionExpression: "id = :id",
                ExpressionAttributeValues: { ":id": id }
            }).promise()

            if (result.Items && result.Items.length > 0) {
                return result.Items[0] as GenerationItem
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
            this.logger?.error(ddbError?.formatForLogger())
            throw ddbError
        }
    }
    public async readVideos(pageKey?: string): Promise<GenerationsPage> {
        return await this.readGenerations(GenerationType.IMG2VID, pageKey)
    }
    private async readGenerations(generationType: string, pageKey?: string): Promise<GenerationsPage> {
        let ddbError = null
        try {
            let startKey = undefined
            if (pageKey) {
                const segs = pageKey.split('-')
                if (segs.length === 3) {
                    startKey = {
                        id: segs[0],
                        action: segs[1],
                        timestamp: parseInt(segs[2])
                    }
                }
            }
            const result = await this.ddb.query({
                TableName: this.tableName,
                IndexName: GSI_ACTION_TIMESTAMP_INDEX,
                KeyConditionExpression: '#action = :actionValue',
                ExpressionAttributeNames: { '#action': 'action' },
                ExpressionAttributeValues: { ":actionValue": generationType },
                ExclusiveStartKey: startKey,
                ScanIndexForward: false,
                Limit: 10
            }).promise()

            let nextPageKey = undefined
            if (result.LastEvaluatedKey) {
                nextPageKey = `${result.LastEvaluatedKey.id}-${result.LastEvaluatedKey.action}-${result.LastEvaluatedKey.timestamp}`
            }
            return {
                'next-page': nextPageKey,
                items: result.Items ?? []
            } as GenerationsPage
        }
        catch (e: any) {
            ddbError = new DDBError(e.message, {
                status: 500,
                access: 'query',
                filter: { type: generationType }
            })
            ddbError.stack = e.stack
        }
        finally {
            this.logger?.error(ddbError?.formatForLogger())
            throw ddbError
        }
    }
    public async readVideosByUser(userid: string, pageKey?: string): Promise<GenerationsPage> {
        let ddbError = null
        try {
            let startKey = undefined
            if (pageKey) {
                const segs = pageKey.split('-')
                if (segs.length === 3) {
                    startKey = {
                        id: segs[0],
                        userid: segs[1],
                        timestamp: parseInt(segs[2])
                    }
                }
            }
            const result = await this.ddb.query({
                TableName: this.tableName,
                IndexName: GSI_USERID_TIMESTAMP_INDEX,
                KeyConditionExpression: '#userid = :useridValue',
                ExpressionAttributeNames: { '#userid': 'userid' },
                ExpressionAttributeValues: { ":useridValue": userid },
                ExclusiveStartKey: startKey,
                ScanIndexForward: false,
                Limit: 10
            }).promise()

            let nextPageKey = undefined
            if (result.LastEvaluatedKey) {
                this.logger?.info(result.LastEvaluatedKey)
                nextPageKey = `${result.LastEvaluatedKey.id}-${result.LastEvaluatedKey.userid}-${result.LastEvaluatedKey.timestamp}`
            }
            return {
                'next-page': nextPageKey,
                items: result.Items ?? []
            } as GenerationsPage
        }
        catch (e: any) {
            ddbError = new DDBError(e.message, {
                status: 500,
                access: 'query',
                filter: { type: userid }
            })
            ddbError.stack = e.stack
        }
        finally {
            this.logger?.error(ddbError?.formatForLogger())
            throw ddbError
        }
    }
}
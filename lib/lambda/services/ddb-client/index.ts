import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { AttributeType } from 'aws-cdk-lib/aws-dynamodb'
import { DynamoDBDocument, NativeAttributeValue } from '@aws-sdk/lib-dynamodb';
import { DescribeTableCommandOutput, DynamoDB } from '@aws-sdk/client-dynamodb';
import { ILogger } from '../metrics'
import { GenerationItem, GenerationType, GenerationsPage } from '../sd-client/types'

export interface LoggerDDBError {
    errInfo: DDBErrorInfo
    err: DDBError
}

export interface DDBErrorInfo {
    status: number,
    access: string,
    filter?: { [key: string]: string }
}

export class DDBError extends Error {
    info: DDBErrorInfo

    constructor(message: string, info: DDBErrorInfo) {
        super(message)
        this.name = 'DDBError'
        this.info = info
    }

    public toLogger(): LoggerDDBError {
        return { errInfo: this.info, err: this }
    }
}

const GSI_ACTION_TIMESTAMP_INDEX = 'action-timestamp-index'
const GSI_USERID_TIMESTAMP_INDEX = 'userid-timestamp-index'
const GSI_VISIBILITY_TIMESTAMP_INDEX = 'visibility-timestamp-index'

const GSI: { [key: string]: { partitionKey: string, partitionKeyType: AttributeType, sortKey: string, sortKeyType: AttributeType } } = {
    [GSI_ACTION_TIMESTAMP_INDEX]: { partitionKey: 'action', partitionKeyType: AttributeType.STRING, sortKey: 'timestamp', sortKeyType: AttributeType.NUMBER },
    [GSI_USERID_TIMESTAMP_INDEX]: { partitionKey: 'userid', partitionKeyType: AttributeType.STRING, sortKey: 'timestamp', sortKeyType: AttributeType.NUMBER },
    [GSI_VISIBILITY_TIMESTAMP_INDEX]: { partitionKey: 'visibility', partitionKeyType: AttributeType.STRING, sortKey: 'timestamp', sortKeyType: AttributeType.NUMBER },
}

export class DDBClient {
    public static async createTableIfNotExist(scope: Construct, tableName: string) {
        const ddb = new DynamoDB()

        try {
            const response = await ddb.describeTable({ TableName: tableName })
            if (response.Table) {
                return
            }
        }
        catch (e: any) {

        }
        this.createTable(scope, tableName)
    }

    public static createTable(scope: Construct, tableName: string) {
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
        ddb.describeTable({ TableName: tableName }, (_, data?: DescribeTableCommandOutput) => {
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
    private tableName: string
    private logger?: ILogger
    private ddb = DynamoDBDocument.from(new DynamoDB())
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
            return await this.ddb.batchWrite(req);
        }
        catch (e: any) {
            const ddbError = new DDBError(e.message, {
                status: 500,
                access: 'saveGeneration',
            })
            ddbError.stack = e.stack
            this.logger?.error(ddbError?.toLogger())
            this.logger?.info(putReqs)
            throw ddbError
        }
    }
    public async readGeneration(id: string): Promise<GenerationItem> {
        let ddbError = null
        try {
            const result = await this.ddb.query({
                TableName: this.tableName,
                KeyConditionExpression: "id = :id",
                ExpressionAttributeValues: { ":id": id }
            })
            const items = this.formatGenerationItems(result.Items ?? [])

            if (items && items.length > 0) {
                return items[0]
            }
            ddbError = new DDBError(`No result`, {
                status: 404,
                access: 'readGeneration',
                filter: { id: id }
            })
            throw ddbError
        }
        catch (e: any) {
            ddbError = new DDBError(e.message, {
                status: 500,
                access: 'readGeneration',
                filter: { id: id }
            })
            ddbError.stack = e.stack
            this.logger?.error(ddbError?.toLogger())
            throw ddbError
        }
    }
    public async readVideos(pageKey?: string, limit?: number): Promise<any> {
        return await this.readGenerations(GenerationType.IMG2VID, pageKey, limit)
    }
    private async readGenerations(generationType: string, pageKey?: string, limit?: number): Promise<GenerationsPage> {
        try {
            let startKey = undefined
            if (pageKey) {
                const segs = pageKey.split('-')
                if (segs.length === 3) {
                    startKey = {
                        id: segs[0],
                        visibility: segs[1],
                        timestamp: parseInt(segs[2])
                    }
                }
            }
            const result = await this.ddb.query({
                TableName: this.tableName,
                IndexName: GSI_VISIBILITY_TIMESTAMP_INDEX,
                KeyConditionExpression: "visibility = :community",
                ExpressionAttributeValues: { ":community": "community" },
                ExclusiveStartKey: startKey,
                ScanIndexForward: false,
                Limit: limit ?? 12
            })

            let nextPageKey = undefined
            if (result.LastEvaluatedKey) {
                nextPageKey = `${result.LastEvaluatedKey.id}-${result.LastEvaluatedKey.visibility}-${result.LastEvaluatedKey.timestamp}`
            }
            return {
                'next-page': nextPageKey,
                items: this.formatGenerationItems(result.Items ?? [])
            } as GenerationsPage
        }
        catch (e: any) {
            const ddbError = new DDBError(e.message, {
                status: 500,
                access: 'readGenerations',
                filter: { type: generationType }
            })
            ddbError.stack = e.stack
            this.logger?.error(ddbError?.toLogger())
            throw ddbError
        }
    }
    private formatGenerationItems(items: Record<string, NativeAttributeValue>[]): GenerationItem[] {
        return items.map(item => {
            return {
                ...item,
                outputs: item.outputs.map((output: any) => {
                    return {
                        ...output,
                        seed: output.seed.toString()
                    }
                })
            } as GenerationItem
        })

    }
    public async readVideosByUser(userid: string, pageKey?: string, limit?: number): Promise<GenerationsPage> {
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
                Limit: limit ?? 12
            })

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
            const ddbError = new DDBError(e.message, {
                status: 500,
                access: 'readVideosByUser',
                filter: { type: userid }
            })
            ddbError.stack = e.stack
            this.logger?.error(ddbError?.toLogger())
            throw ddbError
        }
    }

    public async claim(userId: string, assetId: string, salt: string) {
        try {
            const record = await this.readGeneration(assetId)
            if (!record) {
                throw new DDBError(`${assetId} is not found.`, {
                    status: 404,
                    access: 'claim',
                })
            }
            if (record.userid === userId) {
                return
            }
            //Let anyone takeover static
            if (record.userid && assetId != 'static') {
                throw new DDBError(`${assetId} is not claimable.`, {
                    status: 403,
                    access: 'claim',
                })
            }
            // if ((record.input as any).salt != salt) {
            //     throw new DDBError(`${assetId} salt doesn't match ${(record.input as any).salt} vs ${salt}`, {
            //         status: 401,
            //         access: 'claim',
            //     })
            // }
            await this.ddb.update({
                TableName: this.tableName,
                Key: { id: assetId, timestamp: record.timestamp },
                UpdateExpression: `SET userid = :userid`,
                ExpressionAttributeValues: { ':userid': userId }
            })

        } catch (e: any) {
            const ddbError = new DDBError(e.message, {
                status: e.status || e.info.status || 500,
                access: 'claim',
                filter: { userId, assetId }
            })
            ddbError.stack = e.stack
            this.logger?.error(ddbError?.toLogger())
            throw ddbError
        }
    }

    public async togglePublish(userId: string, assetId: string, publishOn: boolean) {
        try {
            const record = await this.readGeneration(assetId)
            if (!record) {
                throw new DDBError(`${assetId} is not found.`, {
                    status: 404,
                    access: 'readGeneration',
                })
            }
            if (record.userid != userId) {
                throw new DDBError(`Not authorized to publish`, {
                    status: 403,
                    access: 'claim',
                })
            }
            const result = await this.ddb.update({
                TableName: this.tableName,
                Key: { id: assetId, timestamp: record.timestamp },
                UpdateExpression: `SET visibility = :newVisibility`,
                ExpressionAttributeValues: { ':newVisibility': publishOn ? 'community' : 'private' }
            })
        } catch (e: any) {
            const ddbError = new DDBError(e.message, {
                status: e.status || e.info.status || 500,
                access: 'claim',
                filter: { userId, assetId }
            })
            ddbError.stack = e.stack
            this.logger?.error(ddbError?.toLogger())
            throw ddbError
        }

    }
}
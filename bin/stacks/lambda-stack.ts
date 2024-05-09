import { Construct } from 'constructs';
import * as aws_iam from 'aws-cdk-lib/aws-iam'
import * as path from "path";
import * as cdk from 'aws-cdk-lib'
import {
    aws_lambda_nodejs,
    aws_lambda,
} from "aws-cdk-lib";

export enum LambdaType {
    FFMPEG = 'FFMPEG',
    TXT2IMG = 'TXT2IMG',
    IMG2VID = 'IMG2VID',
    SHOWCASE = 'SHOWCASE',
    USERASSET = 'USERASSET'
}

export interface LambdaStackProps extends cdk.StackProps {
    lambdaName: string,
    type: LambdaType,
    awsRegion: string,
    awsAccount: string,
    ddbGenerationsTableName?: string,
    sdProviderEndpoint?: string,
    ffmpegLambdaLayerArn?: string
    discordChannel?: string
    falAiEndpoint?: string
    falAiApiKey?: string
    privyAppId?: string
}

export class LambdaStack extends cdk.NestedStack {
    public readonly lambda: aws_lambda_nodejs.NodejsFunction
    constructor(scope: Construct, name: string, props: LambdaStackProps) {
        super(scope, name, props)
        const ddbPolicyR = this.createDDBReadOnlyPolicy(props)
        const ddbPolicyRW = this.createDDBReadWritePolicy(props)
        this.lambda = this.buildLambda(props, ddbPolicyR, ddbPolicyRW)
    }
    private createDDBReadWritePolicy(props: LambdaStackProps) {
        const doc = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": [
                        "dynamodb:BatchGetItem",
                        "dynamodb:BatchWriteItem",
                        "dynamodb:ConditionCheckItem",
                        "dynamodb:DeleteItem",
                        "dynamodb:DescribeTable",
                        "dynamodb:GetItem",
                        "dynamodb:GetRecords",
                        "dynamodb:GetShardIterator",
                        "dynamodb:PutItem",
                        "dynamodb:Query",
                        "dynamodb:Scan",
                        "dynamodb:UpdateItem"
                    ],
                    "Resource": [
                        `arn:aws:dynamodb:${props.awsRegion}:${props.awsAccount}:table/${props.ddbGenerationsTableName}/index/*`,
                        `arn:aws:dynamodb:${props.awsRegion}:${props.awsAccount}:table/${props.ddbGenerationsTableName}`
                    ],
                    "Effect": "Allow"
                }
            ]
        }

        return new aws_iam.Policy(this, 'ddb-readwritepolicy', {
            policyName: 'ddb-readwritepolicy',
            document: aws_iam.PolicyDocument.fromJson(doc)
        })
    }
    private createDDBReadOnlyPolicy(props: LambdaStackProps): aws_iam.Policy {
        const doc = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": [
                        "dynamodb:BatchGetItem",
                        "dynamodb:ConditionCheckItem",
                        "dynamodb:DescribeTable",
                        "dynamodb:GetItem",
                        "dynamodb:GetRecords",
                        "dynamodb:GetShardIterator",
                        "dynamodb:Query",
                        "dynamodb:Scan"
                    ],
                    "Resource": [
                        `arn:aws:dynamodb:${props.awsRegion}:${props.awsAccount}:table/${props.ddbGenerationsTableName}/index/*`,
                        `arn:aws:dynamodb:${props.awsRegion}:${props.awsAccount}:table/${props.ddbGenerationsTableName}`
                    ],
                    "Effect": "Allow"
                }
            ]
        }
        return new aws_iam.Policy(this, 'ddb-readonlypolicy', {
            policyName: 'ddb-readonlypolicy',
            document: aws_iam.PolicyDocument.fromJson(doc)
        })
    }
    private execBuildLambda(props: {
        lambdaName: string,
        lambdaRole: aws_iam.IRole,
        timeout: cdk.Duration,
        handlerName: string,
        env: { [key: string]: string },
        layers?: aws_lambda.ILayerVersion[]
    }): aws_lambda_nodejs.NodejsFunction {
        const keys = Object.keys(props.env)
        for (let key of keys) {
            if (!props.env[key]) {
                throw `ENV ${key} is not set for lambda ${props.lambdaName}`
            }
        }
        return new aws_lambda_nodejs.NodejsFunction(this, props.lambdaName, {
            role: props.lambdaRole,
            runtime: aws_lambda.Runtime.NODEJS_20_X,
            memorySize: 1024,
            timeout: props.timeout,
            handler: props.handlerName,
            entry: path.join(__dirname, '../../lib/lambda/index.ts'),
            environment: {
                ...props.env
            },
            layers: props.layers
        })
    }
    private buildLambda(props: LambdaStackProps, ddbPolicyR: aws_iam.Policy, ddbPolicyRW: aws_iam.Policy): aws_lambda_nodejs.NodejsFunction {
        switch (props.type) {
            case LambdaType.FFMPEG: {
                const lambdaRole = new aws_iam.Role(this, `${props.lambdaName}-Role`, {
                    assumedBy: new aws_iam.ServicePrincipal('lambda.amazonaws.com'),
                    managedPolicies: [
                        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
                        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaRole'),
                        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
                    ],
                })
                if (!props.ffmpegLambdaLayerArn) {
                    throw new Error(`ffmpegLambdaLayerArn is required`)
                }
                return this.execBuildLambda({
                    lambdaName: props.lambdaName,
                    lambdaRole: lambdaRole,
                    timeout: cdk.Duration.seconds(600),
                    handlerName: 'imageOverVideoHandler',
                    env: {
                        FFMPEG_PATH: '/opt/bin/ffmpeg',
                    },
                    layers: [
                        aws_lambda.LayerVersion.fromLayerVersionArn(this, 'ffmpeg-layer', props.ffmpegLambdaLayerArn!),
                    ]
                })
            }
            case LambdaType.TXT2IMG: {
                const lambdaRole = new aws_iam.Role(this, `${props.lambdaName}-Role`, {
                    assumedBy: new aws_iam.ServicePrincipal('lambda.amazonaws.com'),
                    managedPolicies: [
                        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
                        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaRole'),
                    ],
                })
                lambdaRole.attachInlinePolicy(ddbPolicyRW)
                return this.execBuildLambda({
                    lambdaName: props.lambdaName,
                    lambdaRole: lambdaRole,
                    timeout: cdk.Duration.seconds(30),
                    handlerName: 'textToImageHandler',
                    env: {
                        SDPROVIDER_ENDPOINT: props.sdProviderEndpoint!,
                        DISCORD_WEBHOOK: props.discordChannel!,
                        DDB_GENERATIONS_TABLENAME: props.ddbGenerationsTableName!,
                        FALAI_ENDPOINT: props.falAiEndpoint!,
                        FALAI_APIKEY: props.falAiApiKey!,
                        LPT_TIMEOUTMS_TXT2IMG: '20000'
                    }
                })
            }
            case LambdaType.IMG2VID: {
                if (!props.ffmpegLambdaLayerArn) {
                    throw new Error(`ffmpegLambdaLayerArn is required`)
                }

                const lambdaRole = new aws_iam.Role(this, `${props.lambdaName}-Role`, {
                    assumedBy: new aws_iam.ServicePrincipal('lambda.amazonaws.com'),
                    managedPolicies: [
                        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
                        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaRole'),
                        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
                    ],
                })
                lambdaRole.attachInlinePolicy(ddbPolicyRW)

                return this.execBuildLambda({
                    lambdaName: props.lambdaName,
                    lambdaRole: lambdaRole,
                    timeout: cdk.Duration.seconds(600),
                    handlerName: 'imageToVideoHandler',
                    env: {
                        FFMPEG_PATH: '/opt/bin/ffmpeg',
                        SDPROVIDER_ENDPOINT: props.sdProviderEndpoint!,
                        DISCORD_WEBHOOK: props.discordChannel!,
                        DDB_GENERATIONS_TABLENAME: props.ddbGenerationsTableName!,
                        FALAI_ENDPOINT: props.falAiEndpoint!,
                        FALAI_APIKEY: props.falAiApiKey!
                    },
                    layers: [
                        aws_lambda.LayerVersion.fromLayerVersionArn(this, 'ffmpeg-layer', props.ffmpegLambdaLayerArn!),
                    ]
                })
            }
            case LambdaType.SHOWCASE: {
                const lambdaRole = new aws_iam.Role(this, `${props.lambdaName}-Role`, {
                    assumedBy: new aws_iam.ServicePrincipal('lambda.amazonaws.com'),
                    managedPolicies: [
                        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
                        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaRole'),
                    ],
                })
                lambdaRole.attachInlinePolicy(ddbPolicyR)
                return this.execBuildLambda({
                    lambdaName: props.lambdaName,
                    lambdaRole: lambdaRole,
                    timeout: cdk.Duration.seconds(29),
                    handlerName: 'showcaseHandler',
                    env: {
                        DISCORD_WEBHOOK: props.discordChannel!,
                        DDB_GENERATIONS_TABLENAME: props.ddbGenerationsTableName!
                    }
                })

            }
            case LambdaType.USERASSET: {
                const lambdaRole = new aws_iam.Role(this, `${props.lambdaName}-Role`, {
                    assumedBy: new aws_iam.ServicePrincipal('lambda.amazonaws.com'),
                    managedPolicies: [
                        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
                        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaRole'),
                    ],
                })
                lambdaRole.attachInlinePolicy(ddbPolicyRW)
                return this.execBuildLambda({
                    lambdaName: props.lambdaName,
                    lambdaRole: lambdaRole,
                    timeout: cdk.Duration.seconds(29),
                    handlerName: 'userAssetHandler',
                    env: {
                        DDB_GENERATIONS_TABLENAME: props.ddbGenerationsTableName!,
                        PRIVY_APPID: props.privyAppId!
                    }
                })

            }
            default: {
                throw new Error(`Lambda type ${props.type} is not supported`)
            }
        }
    }
}
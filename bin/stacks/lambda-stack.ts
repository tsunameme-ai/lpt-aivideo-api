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
    IMG2VID = 'IMG2VID'
}

export interface LambdaStackProps extends cdk.StackProps {
    lambdaName: string,
    type: LambdaType,
    sdProviderEndpoint?: string,
    ffmpegLambdaLayerArn?: string
    discordChannel?: string
}

export class LambdaStack extends cdk.NestedStack {
    public readonly lambda: aws_lambda_nodejs.NodejsFunction
    constructor(scope: Construct, name: string, props: LambdaStackProps) {
        super(scope, name, props)
        this.lambda = LambdaStack.buildLambda(this, props)
    }
    private static buildLambda(scope: Construct, props: LambdaStackProps): aws_lambda_nodejs.NodejsFunction {
        switch (props.type) {
            case LambdaType.FFMPEG: {
                const lambdaRole = new aws_iam.Role(scope, `${props.lambdaName}-Role`, {
                    assumedBy: new aws_iam.ServicePrincipal('lambda.amazonaws.com'),
                    managedPolicies: [
                        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
                        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaRole'),
                        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
                    ],
                })
                if (!props.ffmpegLambdaLayerArn) {
                    throw new Error(`ffmpegLambdaLayerArn is required.`)
                }
                return new aws_lambda_nodejs.NodejsFunction(scope, props.lambdaName, {
                    role: lambdaRole,
                    runtime: aws_lambda.Runtime.NODEJS_20_X,
                    memorySize: 1024,
                    timeout: cdk.Duration.seconds(600),//10min
                    handler: 'imageOverVideoHandler',
                    entry: path.join(__dirname, '../../lib/lambda/index.ts'),
                    environment: {
                        FFMPEG_PATH: '/opt/bin/ffmpeg',
                    },
                    layers: [
                        aws_lambda.LayerVersion.fromLayerVersionArn(scope, 'ffmpeg-layer', props.ffmpegLambdaLayerArn),
                    ]
                })
            }
            case LambdaType.TXT2IMG: {
                const lambdaRole = new aws_iam.Role(scope, `${props.lambdaName}-Role`, {
                    assumedBy: new aws_iam.ServicePrincipal('lambda.amazonaws.com'),
                    managedPolicies: [
                        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
                        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaRole'),
                    ],
                })
                if (!props.sdProviderEndpoint) {
                    throw new Error(`sdProviderEndpoint layer is required.`)
                }
                if (!props.discordChannel) {
                    throw new Error(`discordChannel is required.`)
                }
                return new aws_lambda_nodejs.NodejsFunction(scope, props.lambdaName, {
                    role: lambdaRole,
                    runtime: aws_lambda.Runtime.NODEJS_20_X,
                    memorySize: 1024,
                    timeout: cdk.Duration.seconds(30),
                    handler: 'textToImageHandler',
                    entry: path.join(__dirname, '../../lib/lambda/index.ts'),
                    environment: {
                        SDPROVIDER_ENDPOINT: props.sdProviderEndpoint,
                        DISCORD_WEBHOOK: props.discordChannel
                    }
                })
            }
            case LambdaType.IMG2VID: {
                const lambdaRole = new aws_iam.Role(scope, `${props.lambdaName}-Role`, {
                    assumedBy: new aws_iam.ServicePrincipal('lambda.amazonaws.com'),
                    managedPolicies: [
                        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
                        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaRole'),
                        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
                    ],
                })
                if (!props.sdProviderEndpoint) {
                    throw new Error(`sdProviderEndpoint layer is required.`)
                }
                if (!props.ffmpegLambdaLayerArn) {
                    throw new Error(`ffmpegLambdaLayerArn is required.`)
                }
                if (!props.discordChannel) {
                    throw new Error(`discordChannel is required.`)
                }
                return new aws_lambda_nodejs.NodejsFunction(scope, props.lambdaName, {
                    role: lambdaRole,
                    runtime: aws_lambda.Runtime.NODEJS_20_X,
                    memorySize: 1024,
                    timeout: cdk.Duration.seconds(600),
                    handler: 'imageToVideoHandler',
                    entry: path.join(__dirname, '../../lib/lambda/index.ts'),
                    environment: {
                        SDPROVIDER_ENDPOINT: props.sdProviderEndpoint,
                        FFMPEG_PATH: '/opt/bin/ffmpeg',
                        DISCORD_WEBHOOK: props.discordChannel
                    },
                    layers: [
                        aws_lambda.LayerVersion.fromLayerVersionArn(scope, 'ffmpeg-layer', props.ffmpegLambdaLayerArn),
                    ]
                })
            }
            default: {
                throw new Error(`Lambda type ${props.type} is not supported`)
            }
        }
    }
}
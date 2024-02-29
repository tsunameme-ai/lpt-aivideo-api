#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as dotenv from 'dotenv'
import { ApiStack } from './stacks/api-stack';
dotenv.config()

const app = new cdk.App();
if (!process.env.FFMPEG_LAMBDA_LAYER_ARN) {
    throw new Error(`Missing env.FFMPEG_LAMBDA_LAYER_ARN`)
}
if (!process.env.SDPROVIDER_ENDPOINT) {
    throw new Error(`Missing env.SDPROVIDER_ENDPOINT`)
}
new ApiStack(app, `VideoServiceAPIStack`, {
    apiName: 'VideoServiceAPI',
    sdProviderEndpoint: process.env.SDPROVIDER_ENDPOINT!,
    ddbGenerationsTableName: 'generations',
    ffmpegLambdaLayerArn: process.env.FFMPEG_LAMBDA_LAYER_ARN!,
    discordChannel: process.env.DISCORD_WEBHOOK_DEV!
})

new ApiStack(app, 'VideoServiceDevAPIStack', {
    apiName: 'VideoServiceDevAPI',
    ddbGenerationsTableName: 'generations-dev1',
    sdProviderEndpoint: process.env.SDPROVIDER_ENDPOINT!,
    ffmpegLambdaLayerArn: process.env.FFMPEG_LAMBDA_LAYER_ARN!,
    discordChannel: process.env.DISCORD_WEBHOOK_DEV!
});
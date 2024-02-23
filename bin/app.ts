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
    ffmpegLambdaLayerArn: process.env.FFMPEG_LAMBDA_LAYER_ARN!
})

new ApiStack(app, 'VideoServiceDevAPIStack', {
    apiName: 'VideoServiceDevAPI',
    sdProviderEndpoint: process.env.SDPROVIDER_ENDPOINT!,
    ffmpegLambdaLayerArn: process.env.FFMPEG_LAMBDA_LAYER_ARN!
});
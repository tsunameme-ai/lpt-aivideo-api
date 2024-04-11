#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as dotenv from 'dotenv'
import { ApiStack } from './stacks/api-stack';
dotenv.config()

const app = new cdk.App();
const requiredKeys = ['FFMPEG_LAMBDA_LAYER_ARN', 'SDPROVIDER_ENDPOINT', 'FALAI_ENDPOINT', 'FALAI_APIKEY']
for (let key of requiredKeys) {
    if (!process.env[key]) {
        throw new Error(`Missing env.${key}`)
    }
}
new ApiStack(app, `VideoServiceAPIStack`, {
    apiName: 'VideoServiceAPI',
    sdProviderEndpoint: process.env.SDPROVIDER_ENDPOINT!,
    ddbGenerationsTableName: 'generations',
    ffmpegLambdaLayerArn: process.env.FFMPEG_LAMBDA_LAYER_ARN!,
    discordChannel: process.env.DISCORD_WEBHOOK_PROD!,
    falAiEndpoint: process.env.FALAI_ENDPOINT!,
    falAiApiKey: process.env.FALAI_APIKEY!
})

new ApiStack(app, 'VideoServiceDevAPIStack', {
    apiName: 'VideoServiceDevAPI',
    ddbGenerationsTableName: 'generations-dev1',
    sdProviderEndpoint: process.env.SDPROVIDER_ENDPOINT!,
    ffmpegLambdaLayerArn: process.env.FFMPEG_LAMBDA_LAYER_ARN!,
    discordChannel: process.env.DISCORD_WEBHOOK_DEV!,
    falAiEndpoint: process.env.FALAI_ENDPOINT!,
    falAiApiKey: process.env.FALAI_APIKEY!
});

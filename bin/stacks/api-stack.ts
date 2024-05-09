import * as apigw from 'aws-cdk-lib/aws-apigateway'
import * as cdk from 'aws-cdk-lib'
import * as aws_lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from 'constructs'
import { LambdaStack, LambdaType } from './lambda-stack';
import { DDBClient } from '../../lib/lambda/services/ddb-client';

export interface APIStackProps extends cdk.StackProps {
    apiName: string
    awsRegion: string
    awsAccount: string
    sdProviderEndpoint: string
    ddbGenerationsTableName: string
    ffmpegLambdaLayerArn: string
    discordChannel: string
    falAiEndpoint: string
    falAiApiKey: string
    privyAppId: string
}

export class ApiStack extends cdk.Stack {
    public readonly api: apigw.RestApi
    public readonly img2VidFuncUrl: aws_lambda.FunctionUrl
    constructor(scope: Construct, name: string, props: APIStackProps) {
        super(scope, name, props);
        this.api = new apigw.RestApi(this, props.apiName, {
            restApiName: props.apiName,
            cloudWatchRole: true,
            deployOptions: {
                loggingLevel: apigw.MethodLoggingLevel.INFO,
                dataTraceEnabled: true
            }
        });

        //FFMPEG
        const { lambda: iovHandler } = new LambdaStack(this, 'FFMPEGLambdaStack', {
            lambdaName: 'FFMPEGLambda',
            awsRegion: props.awsRegion,
            awsAccount: props.awsAccount,
            type: LambdaType.FFMPEG,
            ffmpegLambdaLayerArn: props.ffmpegLambdaLayerArn
        })
        this.api.root.addResource('image-over-video').addMethod('POST', new apigw.LambdaIntegration(iovHandler))

        //GENERATION
        DDBClient.createTableIfNotExist(this, props.ddbGenerationsTableName, 'generations')

        const { lambda: txt2imgHandler } = new LambdaStack(this, 'Txt2ImgLambdaStack', {
            lambdaName: 'Txt2ImgLambda',
            awsRegion: props.awsRegion,
            awsAccount: props.awsAccount,
            type: LambdaType.TXT2IMG,
            ddbGenerationsTableName: props.ddbGenerationsTableName,
            sdProviderEndpoint: props.sdProviderEndpoint,
            discordChannel: props.discordChannel,
            falAiEndpoint: props.falAiEndpoint,
            falAiApiKey: props.falAiApiKey,
            privyAppId: props.privyAppId
        })

        const { lambda: img2vidHandler } = new LambdaStack(this, 'Img2VidLambdaStack', {
            lambdaName: 'Img2VidLambda',
            awsRegion: props.awsRegion,
            awsAccount: props.awsAccount,
            type: LambdaType.IMG2VID,
            ddbGenerationsTableName: props.ddbGenerationsTableName,
            ffmpegLambdaLayerArn: props.ffmpegLambdaLayerArn,
            sdProviderEndpoint: props.sdProviderEndpoint,
            discordChannel: props.discordChannel,
            falAiEndpoint: props.falAiEndpoint,
            falAiApiKey: props.falAiApiKey,
            privyAppId: props.privyAppId
        })


        const { lambda: showcaseHandler } = new LambdaStack(this, 'ShowcaseLambdaStack', {
            lambdaName: 'ShowcaseLambda',
            awsRegion: props.awsRegion,
            awsAccount: props.awsAccount,
            type: LambdaType.SHOWCASE,
            ddbGenerationsTableName: props.ddbGenerationsTableName,
            discordChannel: props.discordChannel,
            privyAppId: props.privyAppId
        })

        const { lambda: userAssetHandler } = new LambdaStack(this, 'UserAssetLambdaStack', {
            lambdaName: 'UserAssetLambda',
            awsRegion: props.awsRegion,
            awsAccount: props.awsAccount,
            type: LambdaType.USERASSET,
            ddbGenerationsTableName: props.ddbGenerationsTableName,
            discordChannel: props.discordChannel,
            privyAppId: props.privyAppId
        })

        this.api.root.addResource('text-to-image').addMethod('POST', new apigw.LambdaIntegration(txt2imgHandler))
        this.api.root.addResource('image-to-video').addMethod('POST', new apigw.LambdaIntegration(img2vidHandler))

        const v1Res = this.api.root.addResource('v1')

        // v1/generations
        v1Res.addResource('generations').addMethod('GET', new apigw.LambdaIntegration(showcaseHandler))

        // v1/generation/{proxy+}
        v1Res.addResource('generation').addProxy({ anyMethod: false }).addMethod('GET', new apigw.LambdaIntegration(showcaseHandler))

        // v1/usergens/{proxy+}
        v1Res.addResource('usergens').addProxy({ anyMethod: false }).addMethod('GET', new apigw.LambdaIntegration(showcaseHandler))

        // v1/claim/{proxy+}
        v1Res.addResource('claim').addProxy({ anyMethod: false }).addMethod('GET', new apigw.LambdaIntegration(userAssetHandler))

        // v1/publish/{proxy+}
        const publishRes = v1Res.addResource('publish').addProxy({ anyMethod: false })
        publishRes.addMethod('GET', new apigw.LambdaIntegration(userAssetHandler))
        publishRes.addMethod('DELETE', new apigw.LambdaIntegration(userAssetHandler))


        this.img2VidFuncUrl = img2vidHandler.addFunctionUrl({
            authType: aws_lambda.FunctionUrlAuthType.NONE,
        });

        new cdk.CfnOutput(this, 'img2VidFuncUrl', {
            value: this.img2VidFuncUrl.url || 'null'
        })
        new cdk.CfnOutput(this, 'Url', {
            value: this.api.url || 'null',
        })
    }
}
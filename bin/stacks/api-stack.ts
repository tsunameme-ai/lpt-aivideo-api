import * as apigw from 'aws-cdk-lib/aws-apigateway'
import * as cdk from 'aws-cdk-lib'
import * as aws_lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from 'constructs'
import { LambdaStack, LambdaStackProps, LambdaType } from './lambda-stack';
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

        //GENERATION tables
        DDBClient.createTableIfNotExist(this, props.ddbGenerationsTableName, 'generations')

        const baseLambdaProps: LambdaStackProps = {
            lambdaName: '',
            type: LambdaType.undefined,
            awsRegion: props.awsRegion,
            awsAccount: props.awsAccount,
            ddbGenerationsTableName: props.ddbGenerationsTableName,
            ffmpegLambdaLayerArn: props.ffmpegLambdaLayerArn,
            sdProviderEndpoint: props.sdProviderEndpoint,
            discordChannel: props.discordChannel,
            falAiEndpoint: props.falAiEndpoint,
            falAiApiKey: props.falAiApiKey,
            privyAppId: props.privyAppId,
            asyncGenerateLambdaFuncName: ''
        }

        //LAMBDAs
        const { lambda: asycnGenerateLambda } = new LambdaStack(this, 'AsyncGenerateLambdaStack', {
            ...baseLambdaProps,
            lambdaName: 'AsyncGenerateLambda',
            type: LambdaType.ASYNC_GENERATE,
        })
        const { lambda: asycnRequestLambda } = new LambdaStack(this, 'AsyncRequestLambdaStack', {
            ...baseLambdaProps,
            lambdaName: 'AsyncRequestLambda',
            type: LambdaType.ASYNC_REQUEST,
            asyncGenerateLambdaFuncName: asycnGenerateLambda.functionName
        })

        const { lambda: txt2imgHandler } = new LambdaStack(this, 'Txt2ImgLambdaStack', {
            ...baseLambdaProps,
            lambdaName: 'Txt2ImgLambda',
            type: LambdaType.TXT2IMG,
        })

        const { lambda: img2vidHandler } = new LambdaStack(this, 'Img2VidLambdaStack', {
            ...baseLambdaProps,
            lambdaName: 'Img2VidLambda',
            type: LambdaType.IMG2VID,
        })


        const { lambda: showcaseHandler } = new LambdaStack(this, 'ShowcaseLambdaStack', {
            ...baseLambdaProps,
            lambdaName: 'ShowcaseLambda',
            type: LambdaType.SHOWCASE,
        })

        const { lambda: userAssetHandler } = new LambdaStack(this, 'UserAssetLambdaStack', {
            ...baseLambdaProps,
            lambdaName: 'UserAssetLambda',
            type: LambdaType.USERASSET,
        })

        this.api.root.addResource('text-to-image').addMethod('POST', new apigw.LambdaIntegration(txt2imgHandler))
        this.api.root.addResource('image-to-video').addMethod('POST', new apigw.LambdaIntegration(img2vidHandler))

        const v1Res = this.api.root.addResource('v1')

        // /v1/async/image-to-video
        v1Res.addResource('async').addResource('image-to-video').addMethod('POST', new apigw.LambdaIntegration(asycnRequestLambda))

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
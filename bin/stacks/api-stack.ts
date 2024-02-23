import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as cdk from 'aws-cdk-lib'
import * as aws_iam from 'aws-cdk-lib/aws-iam'
import * as logs from 'aws-cdk-lib/aws-logs'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import { Construct } from 'constructs'
import { LambdaStack, LambdaType } from './lambda-stack';

export interface APIStackProps extends cdk.StackProps {
    apiName: string
    sdProviderEndpoint: string
    ffmpegLambdaLayerArn: string
}

export class ApiStack extends cdk.Stack {
    public readonly api: apigwv2.HttpApi
    constructor(scope: Construct, name: string, props: APIStackProps) {
        super(scope, name, props);
        this.api = new apigwv2.HttpApi(this, props.apiName)

        const { lambda: iovHandler } = new LambdaStack(this, 'FFMPEGLambdaStack', {
            lambdaName: 'FFMPEGLambda',
            type: LambdaType.FFMPEG,
            ffmpegLambdaLayerArn: process.env.FFMPEG_LAMBDA_LAYER_ARN!
        })
        this.api.addRoutes({
            path: '/image-over-video',
            methods: [apigwv2.HttpMethod.POST],
            integration: new HttpLambdaIntegration('IOVIntegration', iovHandler)
        })


        const { lambda: txt2imgHandler } = new LambdaStack(this, 'Txt2ImgLambdaStack', {
            lambdaName: 'Txt2ImgLambda',
            type: LambdaType.TXT2IMG,
            sdProviderEndpoint: process.env.SDPROVIDER_ENDPOINT!
        })
        this.api.addRoutes({
            path: '/text-to-image',
            methods: [apigwv2.HttpMethod.POST],
            integration: new HttpLambdaIntegration('T2IIntegration', txt2imgHandler)
        })

        const { lambda: img2vidHandler } = new LambdaStack(this, 'Img2VidLambdaStack', {
            lambdaName: 'Img2VidLambda',
            type: LambdaType.IMG2VID,
            sdProviderEndpoint: process.env.SDPROVIDER_ENDPOINT!,
            ffmpegLambdaLayerArn: process.env.FFMPEG_LAMBDA_LAYER_ARN!
        })
        this.api.addRoutes({
            path: '/image-to-video',
            methods: [apigwv2.HttpMethod.POST],
            integration: new HttpLambdaIntegration('I2VIntegration', img2vidHandler)
        })



        this.enableLog(this.api)
        new cdk.CfnOutput(this, 'Url', {
            value: this.api.url || 'null',
        })

        // const imageOverVideoHandler = new integrations.LambdaProxyIntegration()
    }
    private enableLog(api: apigwv2.HttpApi) {

        const stage = api.defaultStage!.node.defaultChild as apigwv2.CfnStage;
        const logGroup = new logs.LogGroup(api, 'AccessLogs', {
            retention: 90, // Keep logs for 90 days
        });

        stage.accessLogSettings = {
            destinationArn: logGroup.logGroupArn,
            format: JSON.stringify({
                requestId: '$context.requestId',
                userAgent: '$context.identity.userAgent',
                sourceIp: '$context.identity.sourceIp',
                requestTime: '$context.requestTime',
                httpMethod: '$context.httpMethod',
                path: '$context.path',
                status: '$context.status',
                responseLength: '$context.responseLength',
            }),
        };

        logGroup.grantWrite(new aws_iam.ServicePrincipal('apigateway.amazonaws.com'));
    }
}
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as cdk from 'aws-cdk-lib'
import * as aws_iam from 'aws-cdk-lib/aws-iam'
import * as aws_logs from 'aws-cdk-lib/aws-logs'
import * as aws_lambda from "aws-cdk-lib/aws-lambda";
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import { Construct } from 'constructs'
import { LambdaStack, LambdaType } from './lambda-stack';

export interface APIStackProps extends cdk.StackProps {
    apiName: string
    sdProviderEndpoint: string
    ffmpegLambdaLayerArn: string
    discordChannel: string
}

export class ApiStack extends cdk.Stack {
    public readonly api: apigwv2.HttpApi
    public readonly img2VidFuncUrl: aws_lambda.FunctionUrl
    constructor(scope: Construct, name: string, props: APIStackProps) {
        super(scope, name, props);
        this.api = new apigwv2.HttpApi(this, props.apiName)

        const { lambda: iovHandler } = new LambdaStack(this, 'FFMPEGLambdaStack', {
            lambdaName: 'FFMPEGLambda',
            type: LambdaType.FFMPEG,
            ffmpegLambdaLayerArn: props.ffmpegLambdaLayerArn
        })
        this.api.addRoutes({
            path: '/image-over-video',
            methods: [apigwv2.HttpMethod.POST],
            integration: new HttpLambdaIntegration('IOVIntegration', iovHandler)
        })


        const { lambda: txt2imgHandler } = new LambdaStack(this, 'Txt2ImgLambdaStack', {
            lambdaName: 'Txt2ImgLambda',
            type: LambdaType.TXT2IMG,
            sdProviderEndpoint: props.sdProviderEndpoint,
            discordChannel: props.discordChannel
        })
        this.api.addRoutes({
            path: '/text-to-image',
            methods: [apigwv2.HttpMethod.POST],
            integration: new HttpLambdaIntegration('T2IIntegration', txt2imgHandler)
        })

        const { lambda: img2vidHandler } = new LambdaStack(this, 'Img2VidLambdaStack', {
            lambdaName: 'Img2VidLambda',
            type: LambdaType.IMG2VID,
            ffmpegLambdaLayerArn: props.ffmpegLambdaLayerArn,
            sdProviderEndpoint: props.sdProviderEndpoint,
            discordChannel: props.discordChannel
        })
        this.api.addRoutes({
            path: '/image-to-video',
            methods: [apigwv2.HttpMethod.POST],
            integration: new HttpLambdaIntegration('I2VIntegration', img2vidHandler)
        })
        this.img2VidFuncUrl = img2vidHandler.addFunctionUrl({
            authType: aws_lambda.FunctionUrlAuthType.NONE,
            // cors
        });
        new cdk.CfnOutput(this, 'img2VidFuncUrl', {
            value: this.img2VidFuncUrl.url || 'null'
        })



        this.enableLog(this.api)
        new cdk.CfnOutput(this, 'Url', {
            value: this.api.url || 'null',
        })

        // const imageOverVideoHandler = new integrations.LambdaProxyIntegration()
    }
    private enableLog(api: apigwv2.HttpApi) {

        const stage = api.defaultStage!.node.defaultChild as apigwv2.CfnStage;
        const logGroup = new aws_logs.LogGroup(api, 'AccessLogs', {
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
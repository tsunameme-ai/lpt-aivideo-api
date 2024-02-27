import { createMetricsLogger, MetricsLogger } from 'aws-embedded-metrics'
export enum MetricLoggerUnit {
    Seconds = 'Seconds',
    Milliseconds = 'Milliseconds',
    Bytes = 'Bytes',
    Kilobytes = 'Kilobytes',
    Megabytes = 'Megabytes',
    Gigabytes = 'Gigabytes',
    Terabytes = 'Terabytes',
    Bits = 'Bits',
    Kilobits = 'Kilobits',
    Megabits = 'Megabits',
    Gigabits = 'Gigabits',
    Terabits = 'Terabits',
    Percent = 'Percent',
    Count = 'Count',
    BytesPerSecond = 'Bytes/Second',
    KilobytesPerSecond = 'Kilobytes/Second',
    MegabytesPerSecond = 'Megabytes/Second',
    GigabytesPerSecond = 'Gigabytes/Second',
    TerabytesPerSecond = 'Terabytes/Second',
    BitsPerSecond = 'Bits/Second',
    KilobitsPerSecond = 'Kilobits/Second',
    MegabitsPerSecond = 'Megabits/Second',
    GigabitsPerSecond = 'Gigabits/Second',
    TerabitsPerSecond = 'Terabits/Second',
    CountPerSecond = 'Count/Second',
    None = 'None',
}

export enum StackType {
    LAMBDA = 'Lambda'
}
export interface MetricsProps {
    keys: string[]
    value: number
    unit?: MetricLoggerUnit
    properties?: Record<string, unknown>
}

export interface ILogger {
    info(obj: any, ...params: any[]): void
    error(obj: any, ...params: any[]): void
}


export abstract class IMetric {
    abstract putMetrics(props: MetricsProps): void
    abstract flush(): Promise<void>
    abstract stack: StackType
}
export enum MetricNamespace {
    VideoService = 'VideoService',
    Lambda = 'AWS/Lambda',
}
export class AWSMetricsLogger implements IMetric {
    private awsMetricLogger: MetricsLogger
    public stack: StackType
    constructor(stack: StackType) {
        this.awsMetricLogger = createMetricsLogger()
        this.awsMetricLogger.setNamespace(MetricNamespace.VideoService)
        // this.awsMetricLogger.setDimensions({ Service: SERVICE_NAME })
        this.stack = stack
    }

    public putMetrics(props: MetricsProps): void {
        const { keys, value, unit, properties } = props

        for (const key of keys) {
            this.putMetric(key, value, unit, properties)
        }
    }

    public async flush(): Promise<void> {
        await this.awsMetricLogger.flush()
    }

    private putMetric(key: string, value: number, unit?: string, properties?: Record<string, unknown>) {
        if (properties) {
            this.setProperties(properties)
        }
        this.awsMetricLogger.putMetric(key, value, unit)
    }

    private setProperties(properties: Record<string, unknown>): void {
        const keys = Object.keys(properties)
        for (const key of keys) {
            this.awsMetricLogger.setProperty(key, properties[key])
        }
    }

}
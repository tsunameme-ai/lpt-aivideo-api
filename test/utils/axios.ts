import axiosStatic from 'axios'

export default class AxiosUtils {
    static buildAxiosOption(method: string, url: string, body?: any, headers?: Record<string, string>) {
        const option: any = {
            method: method,
            url: url,
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
        }
        if (body) {
            option['data'] = body
        }
        return option
    }

    static async call(method: string, url: string, body?: any, headers?: Record<string, string>) {
        const axios = axiosStatic.create()

        const option = AxiosUtils.buildAxiosOption(method, url, body, headers)
        const { data, status } = await axios(option)
        return {
            data,
            status,
        }
    }

    public static delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

}

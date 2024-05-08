import AxiosUtils from "../utils/axios"

if (!process.env.TEST_API_ENDPOINT) {
    throw new Error('Must set TEST_API_ENDPOINT env variables for integ tests')
}
if (!process.env.TEST_USERID) {
    throw new Error('Must set TEST_USERID env variables for integ tests')
}

describe('test feeds', () => {
    it(`community feed`, async () => {
        const url = `${process.env.TEST_API_ENDPOINT}/v1/generations?limit=2`
        const { data, status } = await AxiosUtils.call('GET', url)
        expect(status).toEqual(200)
        expect(data.items.length).toEqual(2)
        expect(data.items[0].outputs.length).toEqual(1)
        expect(typeof (data.items[0].outputs[0].url)).toEqual(`string`)
        expect(typeof (data.items[0].outputs[0].seed)).toEqual(`number`)
        for (let item of data.items) {
            expect(item.visibility).toEqual(`community`)
            expect(item.action).toEqual(`img2vid`)
        }
        expect(typeof (data.nextPageKey)).toEqual(`string`)
    })
    it(`user feed`, async () => {
        const url = `${process.env.TEST_API_ENDPOINT}/v1/usergens/${process.env.TEST_USERID}?limit=2`
        const { data, status } = await AxiosUtils.call('GET', url)
        expect(status).toEqual(200)
        expect(data.items.length).toEqual(2)
        for (let item of data.items) {
            expect(item.userid).toEqual(process.env.TEST_USERID)
            expect(item.action).toEqual(`img2vid`)
        }
    })
    it(`feed item`, async () => {
        const url = `${process.env.TEST_API_ENDPOINT}/v1/generation/static`
        const { status } = await AxiosUtils.call('GET', url)
        expect(status).toEqual(200)
    })
})
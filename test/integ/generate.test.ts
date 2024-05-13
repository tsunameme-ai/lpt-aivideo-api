import AxiosUtils from "../utils/axios"
import CleanupUtils from "../utils/cleanup"

if (!process.env.TEST_API_ENDPOINT) {
    throw new Error('Must set TEST_API_ENDPOINT env variables for integ tests')
}
if (!process.env.TEST_API_I2V_ENDPOINT) {
    throw new Error('Must set TEST_API_I2V_ENDPOINT env variables for integ tests')
}
if (!process.env.TEST_DDBTABLE) {
    throw new Error('Must set TEST_DDBTABLE env variables for integ tests')
}

jest.setTimeout(60 * 1000)

describe('test generation', () => {
    it(`t2i`, async () => {
        const url = `${process.env.TEST_API_ENDPOINT}/text-to-image`
        const body = {
            "model_id": "ByteDance/SDXL-Lightning",
            "prompt": "A cinematic shot of a baby cat wearing an intricate italian priest robe",
            "negative_prompt": "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, artist name",
            "guidance_scale": 7,
            "width": 64,
            "height": 64,
            "num_images_per_prompt": 1,
            "num_inference_steps": 2
        }
        const { data, status } = await AxiosUtils.call('POST', url, body, { 'Content-Type': 'application/json' })
        expect(status).toEqual(200)
        expect(typeof (data.id)).toEqual(`string`)
        expect(data.images.length).toEqual(1)
        expect(typeof (data.images[0].url)).toEqual(`string`)
        expect(typeof (data.images[0].seed)).toEqual(`number`)
        await CleanupUtils.deleteVidGen(process.env.TEST_DDBTABLE!, data)
    })
    it(`i2v`, async () => {
        const url = `${process.env.TEST_API_I2V_ENDPOINT}`
        const body = {
            "image_url": "https://lpt-aivideo-src.s3.amazonaws.com/test-img64.png",
            "model_id": "stabilityai/stable-diffusion-xl-base-1.0",
            "width": 64,
            "height": 64,
            "motion_bucket_id": 127,
            "noise_aug_strength": 0.05,
            "overlay_base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAHJSURBVHgB7ZoBjcJAEEV/LwgABYADJIACcAAoICgABwQFgAJwACgAB62EOtjbvzkauPaSS+htL/nzktKyW0jnzXQ2hCYAHIRp8cU5TQdJkuAD4pgAiGMCII4JgDgmAOKYAIhjAiCOCYA4JgDimACIYwIgjgmAOCYA4rRQA9frFev1unJut9shz3Msl8vS3Pl8Dvssy7DdbnE6ndDr9TCbzTCdTsPcfD4P898ZDodYrVZ4l1oEdLvd4mIYCIMYj8fhPY8vl0uQsNlsKj8/Go1CwBTC8xg094vFohDxGD8ej8X31oWrE589t9/vX8Z8YM5nrPL82+3mfDClMR/oy1iapqXz3oWxN94DmElml5XDPRkMBphMJohBNAG8Dfr9frGxnEm73YbPOO73OzqdTrgdDocDYlFLD/gNbFpsiFWwCjjHjY2QDfPRA/6aaAJIVeNih2ewLHvC0mdVsEJiCGi8B1AAy/55qeOyyoqJQbQKYA/gExnP+M4eAmWm2Rd4zF7AavjpdqkbXtHXitA8rAKWP7cYMCH/SkBs7Bkh2I8hE2ACII4JgDgmAOKYAIhjAiCOCYA4JgDimACIYwIgjgmAOCYA4oR/hiDMJwcVelfLv9OtAAAAAElFTkSuQmCC"
        }
        const { data, status } = await AxiosUtils.call('POST', url, body, { 'Content-Type': 'application/json' })
        expect(status).toEqual(200)

        expect(typeof (data.id)).toEqual(`string`)
        expect(data.images.length).toEqual(1)
        expect(typeof (data.images[0].url)).toEqual(`string`)
        expect(typeof (data.images[0].seed)).toEqual(`number`)

        await CleanupUtils.deleteVidGen(process.env.TEST_DDBTABLE!, data)
    })


    it(`async i2v`, async () => {
        const url = `${process.env.TEST_API_ENDPOINT}/v1/async/image-to-video`
        const body = {
            "image_url": "https://lpt-aivideo-src.s3.amazonaws.com/test-img64.png",
            "model_id": "stabilityai/stable-diffusion-xl-base-1.0",
            "width": 64,
            "height": 64,
            "motion_bucket_id": 127,
            "noise_aug_strength": 0.05,
            "overlay_base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAHJSURBVHgB7ZoBjcJAEEV/LwgABYADJIACcAAoICgABwQFgAJwACgAB62EOtjbvzkauPaSS+htL/nzktKyW0jnzXQ2hCYAHIRp8cU5TQdJkuAD4pgAiGMCII4JgDgmAOKYAIhjAiCOCYA4JgDimACIYwIgjgmAOCYA4rRQA9frFev1unJut9shz3Msl8vS3Pl8Dvssy7DdbnE6ndDr9TCbzTCdTsPcfD4P898ZDodYrVZ4l1oEdLvd4mIYCIMYj8fhPY8vl0uQsNlsKj8/Go1CwBTC8xg094vFohDxGD8ej8X31oWrE589t9/vX8Z8YM5nrPL82+3mfDClMR/oy1iapqXz3oWxN94DmElml5XDPRkMBphMJohBNAG8Dfr9frGxnEm73YbPOO73OzqdTrgdDocDYlFLD/gNbFpsiFWwCjjHjY2QDfPRA/6aaAJIVeNih2ewLHvC0mdVsEJiCGi8B1AAy/55qeOyyoqJQbQKYA/gExnP+M4eAmWm2Rd4zF7AavjpdqkbXtHXitA8rAKWP7cYMCH/SkBs7Bkh2I8hE2ACII4JgDgmAOKYAIhjAiCOCYA4JgDimACIYwIgjgmAOCYA4oR/hiDMJwcVelfLv9OtAAAAAElFTkSuQmCC"
        }
        const { data, status } = await AxiosUtils.call('POST', url, body, { 'Content-Type': 'application/json' })
        console.log(data)
        expect(status).toEqual(200)
        expect(typeof (data.id)).toEqual(`string`)
        expect(data.status).toEqual(`pending`)

        let assetData = undefined

        const assetUrl = `${process.env.TEST_API_ENDPOINT}/v1/generation/${data.id}`
        const t = new Date().getTime()
        while (true) {
            await AxiosUtils.delay(10000)
            const { data, status } = await AxiosUtils.call('GET', assetUrl, undefined, undefined)
            console.log(`${data.id} ${data.action} ${data.outputs?.length}`)
            expect(status).toEqual(200)
            assetData = data
            if (data.action === 'img2vid') {
                break
            }
            if ((new Date().getTime() - t) > 60000) {
                break
            }
        }
        await CleanupUtils.deleteVidGen(process.env.TEST_DDBTABLE!, assetData ? {
            id: data.id,
            timestamp: data.timestamp,
            images: assetData.outputs,
            status: "success"
        } : data)
    })
})
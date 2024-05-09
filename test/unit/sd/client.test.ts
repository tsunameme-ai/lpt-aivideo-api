import { SDClient } from "../../../lib/lambda/services/sd-client";
import * as sinon from 'sinon'

describe('SD Client', function () {
    const sdClient = new SDClient({
        baseURL: 'https://mock.url'
    })
    const stubbedSendRequest = sinon.stub(sdClient, <any>'sendRequest')
    beforeEach(() => {
        stubbedSendRequest.reset()
    })
    test('text to image success', async () => {
        stubbedSendRequest.resolves({
            images: [{
                url: 'https://image1.url.png',
                seed: 0
            }, {
                url: 'https://image1.url.png',
                seed: 1
            }, {
                url: 'https://image1.url.png',
                seed: 2
            }]
        })

        const outputRes = await sdClient.txt2img('test_id', 12345, {
            'model_id': 'model_id',
            'prompt': 'prompt',
            'negative_prompt': '',
            'guidance_scale': 7,
            'width': 512,
            'height': 512,
            'num_images_per_prompt': 1,
            'user_id': 'userid'
        })
        expect(outputRes.id).toEqual('test_id')
        expect(outputRes.images.length).toEqual(3)
    })
    test('text to image: no fallback option. fails when sd provider returns error', async () => {
        stubbedSendRequest.rejects(new Error("SD Provider Error"))
        let resError = undefined
        try {
            await sdClient.txt2img('test_id', 1234, {
                'model_id': 'model_id',
                'prompt': 'prompt',
                'negative_prompt': '',
                'guidance_scale': 7,
                'width': 512,
                'height': 512,
                'num_images_per_prompt': 1,
                'user_id': 'userid'
            })
        } catch (e: any) {
            resError = e
        }
        expect(resError).not.toBe(undefined)
    })
    // test('image to video 1 video success', async () => {
    //     stubbedSendRequest.resolves([{
    //         url: 'https://video1.url.mp4',
    //         seed: 0
    //     }])
    //     const outputRes = await sdClient.img2vid('test_id', {
    //         id: 'mode_id',
    //         'image_url': 'https://test_image.url',
    //         'model_id': 'model_id',
    //         width: 512,
    //         height: 512,
    //         motion_bucket_id: 127,
    //         noise_aug_strength: 0.05,
    //         output_type: 'gif',
    //         'user_id': 'test_id'
    //     })
    //     expect(outputRes.id).toEqual('test_id')
    //     expect(outputRes.images.length).toEqual(3)
    // })
})
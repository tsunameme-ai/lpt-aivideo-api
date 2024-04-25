require('dotenv').config()

import { FFMPEGClient } from "../../../lib/lambda/services/ffmpeg";

describe('FFMPEG Client', function () {
    const ffmpegClient = new FFMPEGClient()
    test('video to gif', async () => {
        const inputPath = `${__dirname}/test.mp4`;
        const outputPath = `${__dirname}/test.gif`;
        const str = await ffmpegClient['convertToGif'](inputPath, outputPath, 512)
        await ffmpegClient['removeFile'](str)
        expect(str).toEqual(outputPath)
    });
    test('overlay image', async () => {
        const inputPath = `${__dirname}/test.mp4`;
        const outputPath = `${__dirname}/output.mp4`;
        const imagePath = `${__dirname}/test.png`;
        const str = await ffmpegClient['addImage'](inputPath, imagePath, 512, outputPath)
        await ffmpegClient['removeFile'](str)
        expect(str).toEqual(outputPath)
    });
})
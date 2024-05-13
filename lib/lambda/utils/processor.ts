import axios from "axios";
import { ILogger } from "../services/metrics";

export function parseBase64Image(imgBase64Str: string): { data: Buffer, type: string } {
    const imgData = Buffer.from(imgBase64Str.replace(/^data:image\/\w+;base64,/, ""), 'base64');
    const imgType = imgBase64Str.split(';')[0].split('/')[1];
    return { data: imgData, type: imgType }
}
export async function shareOnDiscord(url: string, logger: ILogger) {
    if (process.env.DISCORD_WEBHOOK) {
        try {
            const res = await axios.post(process.env.DISCORD_WEBHOOK, { content: url });
            if (![200, 201, 204].includes(res.status)) {
                logger.error(`Discord fail ${res.status}`)
            }
        }
        catch (e) {
            logger.error(e)
        }
    }
}
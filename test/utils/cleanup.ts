import { exec } from 'child_process';
import { GenerationOutput } from '../../lib/lambda/services/sd-client/types';
export default class CleanupUtils {
    private static async cmd(cmd: string) {
        return new Promise(function (resolve, reject) {
            exec(cmd, (err, stdout, stderr) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
    }
    public static async deleteVidGen(tableName: string, data: GenerationOutput) {
        const key = { "id": { "S": data.id }, "timestamp": { "N": data.timestamp.toString() } }
        // console.log(key)
        const deleteCmd = `aws dynamodb delete-item \
        --table-name ${tableName} \
        --key '${JSON.stringify(key)}'`
        const ps = [this.cmd(deleteCmd)]
        for (let img of data.images) {
            // https://lpt-aivideo-dst.s3.amazonaws.com/fgbFS5lIcd.gif
            const path = img.url.split('https://')[1]
            const bucketName = path.split('.s3.amazonaws.com/')[0]
            const segs = path.split('/')
            const objKey = segs[segs.length - 1]
            console.log(`??? ${bucketName} ${objKey}`)

            ps.push(this.cmd(`aws s3 rm s3://${bucketName}/${objKey}`))
        }
        await Promise.all(ps)
    }
}
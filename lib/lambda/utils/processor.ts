export function parseBase64Image(imgBase64Str: string): { data: Buffer, type: string } {
    const imgData = Buffer.from(imgBase64Str.replace(/^data:image\/\w+;base64,/, ""), 'base64');
    const imgType = imgBase64Str.split(';')[0].split('/')[1];
    return { data: imgData, type: imgType }
}
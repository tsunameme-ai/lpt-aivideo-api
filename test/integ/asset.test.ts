import AxiosUtils from "../utils/axios"
import CleanupUtils from "../utils/cleanup"

if (!process.env.TEST_API_ENDPOINT) {
    throw new Error('Must set TEST_API_ENDPOINT env variables for integ tests')
}
if (!process.env.TEST_USERID) {
    throw new Error('Must set TEST_USERID env variables for integ tests')
}

describe('user asset', () => {
    it(`upload image`, async () => {
        const url = `${process.env.TEST_API_ENDPOINT}/v1/upload/image`
        const { status, data } = await AxiosUtils.call('POST', url, {
            "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAHJSURBVHgB7ZoBjcJAEEV/LwgABYADJIACcAAoICgABwQFgAJwACgAB62EOtjbvzkauPaSS+htL/nzktKyW0jnzXQ2hCYAHIRp8cU5TQdJkuAD4pgAiGMCII4JgDgmAOKYAIhjAiCOCYA4JgDimACIYwIgjgmAOCYA4rRQA9frFev1unJut9shz3Msl8vS3Pl8Dvssy7DdbnE6ndDr9TCbzTCdTsPcfD4P898ZDodYrVZ4l1oEdLvd4mIYCIMYj8fhPY8vl0uQsNlsKj8/Go1CwBTC8xg094vFohDxGD8ej8X31oWrE589t9/vX8Z8YM5nrPL82+3mfDClMR/oy1iapqXz3oWxN94DmElml5XDPRkMBphMJohBNAG8Dfr9frGxnEm73YbPOO73OzqdTrgdDocDYlFLD/gNbFpsiFWwCjjHjY2QDfPRA/6aaAJIVeNih2ewLHvC0mdVsEJiCGi8B1AAy/55qeOyyoqJQbQKYA/gExnP+M4eAmWm2Rd4zF7AavjpdqkbXtHXitA8rAKWP7cYMCH/SkBs7Bkh2I8hE2ACII4JgDgmAOKYAIhjAiCOCYA4JgDimACIYwIgjgmAOCYA4oR/hiDMJwcVelfLv9OtAAAAAElFTkSuQmCC"
        })
        console.log(data)
        expect(status).toEqual(200)
        CleanupUtils.deleteS3Gen(data.url)
    })
})
import jwksClient from 'jwks-rsa';
import jwt, { Algorithm } from 'jsonwebtoken';
import { ILogger } from '../metrics';

export class JwtAuthorizer {
    private privyAppId: string
    private logger: ILogger
    constructor(privyAppId: string, logger: ILogger) {
        this.privyAppId = privyAppId
        this.logger = logger
    }
    public async verify(accessToken: string): Promise<{ isValid: boolean, userId?: string | undefined, expiry?: number }> {
        try {
            const decoded = jwt.decode(accessToken, { complete: true })
            if (!decoded) {
                throw new Error(`Invalid access token`)
            }

            const jwkClient = jwksClient({
                jwksUri: `https://auth.privy.io/api/v1/apps/${this.privyAppId}/jwks.json`
            });
            const signKey = await jwkClient.getSigningKey(decoded?.header.kid)

            const data = await jwt.verify(accessToken, signKey.getPublicKey(), { algorithms: [signKey.alg as Algorithm] });
            if ((data as any).iss !== 'privy.io' || !data.sub || !(data as any).exp) {
                return {
                    isValid: false
                }
            }
            return {
                isValid: true,
                userId: data.sub.toString(),
                expiry: parseInt((data as any).exp)
            }
        }
        catch (e) {
            throw e
        }
    }
}
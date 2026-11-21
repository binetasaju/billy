// Verify a Firebase Auth ID token with Google's public keys (no service account needed).
import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

export async function verifyFirebaseIdToken(token: string, projectId: string): Promise<string> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ["RS256"],
  });
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("No uid");
  // Billy needs a verified email (email sign-up verifies; Google always is).
  if (payload.email_verified !== true) throw new Error("Email not verified");
  return payload.sub;
}

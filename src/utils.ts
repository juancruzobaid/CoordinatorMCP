export type Props = {
  login: string;
  name: string;
  email: string;
  avatar_url: string;
};

export function getUpstreamAuthorizeUrl(env: Env, state: string): string {
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: getCallbackUrl(env),
    scope: "read:user user:email",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function fetchUpstreamAuthToken(
  env: Env,
  code: string,
): Promise<{ accessToken: string }> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const data = (await response.json()) as { access_token?: string };
  return { accessToken: data.access_token || "" };
}

function getCallbackUrl(env: Env): string {
  // In production, use the custom domain
  // In dev, this will be localhost
  const base = env.WORKER_URL || "https://mcp.juancruz.com.ar";
  return `${base}/callback`;
}

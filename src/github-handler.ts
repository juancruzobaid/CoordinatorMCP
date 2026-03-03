import type {
  AuthRequest,
  OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import {
  fetchUpstreamAuthToken,
  getUpstreamAuthorizeUrl,
  type Props,
} from "./utils";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

app.get("/authorize", async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  const { clientId } = oauthReqInfo;
  if (!clientId) {
    return c.text("Invalid request", 400);
  }

  // Redirect to GitHub for authentication
  const state = btoa(JSON.stringify({ oauthReqInfo }));
  const githubAuthUrl = getUpstreamAuthorizeUrl(c.env, state);
  return c.redirect(githubAuthUrl);
});

app.get("/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");

  if (!code || !stateParam) {
    return c.text("Missing code or state", 400);
  }

  let state: { oauthReqInfo?: AuthRequest };
  try {
    state = JSON.parse(atob(stateParam));
  } catch (_e) {
    return c.text("Invalid state data", 400);
  }

  if (!state.oauthReqInfo) {
    return c.text("Missing OAuth request info", 400);
  }

  // Exchange the code for a GitHub access token
  const { accessToken } = await fetchUpstreamAuthToken(c.env, code);
  if (!accessToken) {
    return c.text("Failed to get access token from GitHub", 500);
  }

  // Get GitHub user info
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "CoordinatorMCP",
      Accept: "application/json",
    },
  });

  if (!userResponse.ok) {
    return c.text("Failed to fetch user info from GitHub", 500);
  }

  const user = (await userResponse.json()) as {
    login: string;
    name: string;
    email: string;
    avatar_url: string;
    id: number;
  };

  // Complete the OAuth flow
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: c.req.raw,
    userId: user.login,
    metadata: {
      label: user.name || user.login,
    },
    scope: state.oauthReqInfo.scope,
    props: {
      login: user.login,
      name: user.name,
      email: user.email,
      avatar_url: user.avatar_url,
    } as Props,
  });

  return c.redirect(redirectTo);
});

export default app;

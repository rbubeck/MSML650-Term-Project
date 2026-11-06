import { Amplify } from 'aws-amplify';
import {
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  signIn,
  signOut,
  signUp,
} from 'aws-amplify/auth';
import { config, hasCloudConfig } from '../config';

let configured = false;

function configure(): void {
  if (configured) return;
  if (!hasCloudConfig) throw new Error('Missing Cognito configuration.');
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.cognitoUserPoolId,
        userPoolClientId: config.cognitoClientId,
      },
    },
  });
  configured = true;
}

export interface AccountView {
  label: string;
  mode: 'demo' | 'cognito';
}

/** Used only in aws mode. No AWS permanent access key or app-client secret in the browser. */
export const cognitoAuth = {
  async currentUser(): Promise<AccountView | null> {
    configure();
    try {
      const user = await getCurrentUser();
      return { label: user.username, mode: 'cognito' };
    } catch {
      return null;
    }
  },
  async login(email: string, password: string): Promise<AccountView> {
    configure();
    const result = await signIn({ username: email, password });
    if (!result.isSignedIn)
      throw new Error('Additional sign-in step required; ask your team to configure the flow.');
    return { label: email, mode: 'cognito' };
  },
  async register(email: string, password: string): Promise<void> {
    configure();
    await signUp({
      username: email,
      password,
      options: { userAttributes: { email } },
    });
  },
  async confirm(email: string, code: string): Promise<void> {
    configure();
    await confirmSignUp({ username: email, confirmationCode: code });
  },
  async logout(): Promise<void> {
    configure();
    await signOut();
  },
  async getAccessToken(): Promise<string> {
    configure();
    const session = await fetchAuthSession();
    const accessToken = session.tokens?.accessToken?.toString();
    if (!accessToken) throw new Error('Sign in is required.');
    return accessToken;
  },
};

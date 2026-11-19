
import { Amplify } from 'aws-amplify';
import {
  confirmResetPassword,
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  resetPassword,
  signIn,
  signOut,
  signUp,
} from 'aws-amplify/auth';
import { config, hasAuthConfig } from '../config';

let configured = false;

function configure(): void {
  if (configured) return;

  if (!hasAuthConfig) {
    throw new Error('Missing Cognito configuration.');
  }

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

/**
 * AWS Cognito authentication.
 * No permanent AWS credentials or client secrets are stored in the browser.
 */
export const cognitoAuth = {
  async currentUser(): Promise<AccountView | null> {
    configure();

    try {
      const user = await getCurrentUser();

      return {
        label: user.username,
        mode: 'cognito',
      };
    } catch {
      return null;
    }
  },

  async login(email: string, password: string): Promise<AccountView> {
    configure();

    const result = await signIn({
      username: email,
      password,
    });

    if (!result.isSignedIn) {
      throw new Error(
        'Additional sign-in step required; ask your team to configure the flow.',
      );
    }

    return {
      label: email,
      mode: 'cognito',
    };
  },

  async register(email: string, password: string): Promise<void> {
    configure();

    await signUp({
      username: email,
      password,
      options: {
        userAttributes: {
          email,
        },
      },
    });
  },

  async confirm(email: string, code: string): Promise<void> {
    configure();

    await confirmSignUp({
      username: email,
      confirmationCode: code,
    });
  },

  /**
   * Request a password reset verification code.
   * Cognito sends the code to the user's configured recovery destination.
   */
  async forgotPassword(email: string): Promise<void> {
    configure();

    await resetPassword({
      username: email,
    });
  },

  /**
   * Confirm the reset using the verification code and new password.
   */
  async confirmForgotPassword(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    configure();

    await confirmResetPassword({
      username: email,
      confirmationCode: code,
      newPassword,
    });
  },

  async logout(): Promise<void> {
    configure();

    await signOut();
  },

  async getAccessToken(): Promise<string> {
    configure();

    const session = await fetchAuthSession();
    const accessToken = session.tokens?.accessToken?.toString();

    if (!accessToken) {
      throw new Error('Sign in is required.');
    }

    return accessToken;
  },
};

export type AppMode = 'mock' | 'aws';

export const config = {
  mode: import.meta.env.VITE_APP_MODE === 'aws' ? 'aws' : 'mock',
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, ''),
  cognitoUserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? '',
  cognitoClientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? '',
  cognitoRegion: import.meta.env.VITE_COGNITO_REGION ?? '',
} satisfies {
  mode: AppMode;
  apiBaseUrl: string;
  cognitoUserPoolId: string;
  cognitoClientId: string;
  cognitoRegion: string;
};

export const hasCloudConfig = Boolean(
  config.apiBaseUrl && config.cognitoUserPoolId && config.cognitoClientId && config.cognitoRegion,
);

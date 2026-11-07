/**
 * Minimal API Gateway HTTP API (payload format 2.0) shapes the handler reads.
 * Hand-written on purpose so the workspace needs no `@types/aws-lambda`
 * dependency. Every field is optional/unknown because it is untrusted until
 * validated.
 */
export interface ApiGatewayEvent {
  readonly requestContext?: {
    readonly authorizer?: {
      readonly jwt?: {
        readonly claims?: unknown;
      };
    };
  };
  readonly pathParameters?: Readonly<Record<string, string | undefined>> | null;
  readonly body?: string | null;
  readonly isBase64Encoded?: boolean;
}

export interface ApiGatewayResult {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

declare namespace Express {
  interface Request {
    user?: {
      id: string;
      role: string;
      group_id: string | null;
    };
    apiGateway?: {
      event: import('aws-lambda').APIGatewayProxyEventV2WithJWTAuthorizer;
    };
  }
}

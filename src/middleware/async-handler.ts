import type { RequestHandler, Response } from "express";
import type { AuthRequest } from "./auth.middleware.js";

export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function authenticatedAsyncHandler(
  handler: (request: AuthRequest, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next) => {
    void handler(request as AuthRequest, response).catch(next);
  };
}

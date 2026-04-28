import { Response } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export function ok<T>(res: Response, data: T, message?: string) {
  const response: ApiResponse<T> = { success: true, data };
  if (message) response.message = message;
  return res.status(200).json(response);
}

export function created<T>(res: Response, data: T, message?: string) {
  const response: ApiResponse<T> = { success: true, data };
  if (message) response.message = message;
  return res.status(201).json(response);
}

export function badRequest(res: Response, error: string) {
  return res.status(400).json({ success: false, error });
}

export function unauthorized(res: Response, error = 'Unauthorized') {
  return res.status(401).json({ success: false, error });
}

export function forbidden(res: Response, error = 'Forbidden') {
  return res.status(403).json({ success: false, error });
}

export function notFound(res: Response, error = 'Not found') {
  return res.status(404).json({ success: false, error });
}

export function serverError(res: Response, error = 'Internal server error') {
  return res.status(500).json({ success: false, error });
}

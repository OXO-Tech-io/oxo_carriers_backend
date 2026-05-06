import { Response } from 'express';

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  errors?: unknown;
}

export const ok = <T>(res: Response, data: T, message: string = 'OK'): Response => {
  return res.status(200).json({ success: true, message, data });
};

export const created = <T>(res: Response, data: T, message: string = 'Created'): Response => {
  return res.status(201).json({ success: true, message, data });
};

export const noContent = (res: Response): Response => {
  return res.status(204).send();
};

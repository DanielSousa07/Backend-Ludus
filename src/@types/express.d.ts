import * as express from 'express';

declare global {
  namespace Express {
    interface Request {
      user: {
        id: string;
        role: string; // Agora o TS reconhecerá esta propriedade
      };
    }
  }
}
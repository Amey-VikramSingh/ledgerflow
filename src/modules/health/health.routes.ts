import { Router } from 'express';
import { asyncHandler } from '../../shared/http';
import { live, ready } from './health.controller';

export const healthRouter = Router();

healthRouter.get('/live', live);
healthRouter.get('/ready', asyncHandler(ready));
// Default /health points at readiness (the more useful signal).
healthRouter.get('/', asyncHandler(ready));

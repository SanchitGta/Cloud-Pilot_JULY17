import { Router } from 'express';
import { AWS_REGIONS } from '../constants/awsRegions.js';

export const regionsRouter = Router();

regionsRouter.get('/regions', (_req, res) => {
  res.status(200).json(AWS_REGIONS);
});

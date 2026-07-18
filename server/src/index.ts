import express, { type NextFunction, type Request, type Response } from 'express';
import { loadEnv } from './env.js';
import { getDb } from './db/index.js';
import { connectionsRouter } from './routes/connections.js';
import { regionsRouter } from './routes/regions.js';
import { overviewRouter } from './routes/overview.js';
import { scansRouter } from './routes/scans.js';

const env = loadEnv();
getDb();

const app = express();
app.use(express.json());
app.use('/api', connectionsRouter);
app.use('/api', regionsRouter);
app.use('/api', overviewRouter);
app.use('/api', scansRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Try again.' } });
});

app.listen(env.port, () => {
  console.log(`Cloud Pilot API listening on port ${env.port}`);
});

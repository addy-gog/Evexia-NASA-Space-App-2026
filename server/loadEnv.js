/**
 * Load environment variables before anything else reads them.
 *
 * `npm run dev` starts the server inside server/, but the README puts `.env` in
 * the repository root. Read server/.env first, then the root .env, so either
 * location works. Values already set in the real environment (Render, CI) win.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: [path.join(here, '.env'), path.join(here, '..', '.env')], quiet: true });

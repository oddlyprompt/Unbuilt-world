import { createServer, type Server } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { safeJoin } from '@uw/core/node';

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.json': 'application/json', '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.map': 'application/json', '.ttf': 'font/ttf',
};
export const mimeFor = (file: string) => MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

export interface FileServer {
  baseUrl: string;
  close(): Promise<void>;
}

/** Read-only static server for one project directory, with Range support and CORS, for the renderer's browser. */
export async function serveProjectDir(dir: string): Promise<FileServer> {
  const server: Server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const file = safeJoin(dir, rel);
      const st = await fs.stat(file);
      if (!st.isFile()) throw new Error('not a file');
      const headers: Record<string, string | number> = { 'Content-Type': mimeFor(file), 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
      const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
        res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
        createReadStream(file, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { ...headers, 'Content-Length': st.size });
        createReadStream(file).pipe(res);
      }
    } catch {
      res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }).end('not found');
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return { baseUrl: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) };
}

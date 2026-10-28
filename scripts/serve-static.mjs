// Serves a built folder under a URL prefix, like GitHub Pages does for a project site.
// usage: node scripts/serve-static.mjs <dir> <port> [/prefix]
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';

const [dir, port, prefix = '/Unbuilt-world'] = process.argv.slice(2);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2' };
createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.pathname.startsWith(prefix + '/')) return void res.writeHead(u.pathname === prefix ? 301 : 404, { location: prefix + '/' }).end();
  let rel = decodeURIComponent(u.pathname.slice(prefix.length)).replace(/^\/+/, '') || 'index.html';
  const file = path.join(path.resolve(dir), rel);
  if (!file.startsWith(path.resolve(dir))) return void res.writeHead(403).end();
  try {
    const st = statSync(file);
    const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
    const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
    if (range) {
      const s = range[1] ? +range[1] : 0, e = range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
      res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${s}-${e}/${st.size}`, 'content-length': e - s + 1 });
      return void createReadStream(file, { start: s, end: e }).pipe(res);
    }
    res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': st.size });
    createReadStream(file).pipe(res);
  } catch { res.writeHead(404).end('not found'); }
}).listen(+port, '127.0.0.1', () => console.log(`static ${dir} at http://127.0.0.1:${port}${prefix}/`));

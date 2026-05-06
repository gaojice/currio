import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "fixtures");
const PORT = 8787;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
};

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let filePath = path.join(FIXTURES, url.pathname === "/" ? "basic.html" : url.pathname);

  // Prevent directory traversal
  if (!filePath.startsWith(FIXTURES)) {
    res.writeHead(403);
    res.end();
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || "text/html; charset=utf-8";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`[currio-e2e] fixtures server on http://localhost:${PORT}`);
});

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import process from "node:process";

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const root = resolve(argument("--root", "packages/game-data/published"));
const host = argument("--host", "127.0.0.1");
const port = Number(argument("--port", "8788"));
if (host !== "127.0.0.1" && host !== "::1") throw new Error("Local game-data server must bind loopback");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid local game-data port");
if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`Published game-data root is missing: ${root}`);

const contentTypes = new Map([
  [".json", "application/json; charset=utf-8"],
]);

function containedPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\") || decoded.includes("..")) return null;
  const relativePath = decoded.replace(/^\/+/, "");
  if (!/^version-[0-9a-f]{64}\/[A-Za-z0-9._/-]+$/u.test(relativePath)) return null;
  const candidate = resolve(root, ...relativePath.split("/"));
  const prefix = root.endsWith(sep) ? root : root + sep;
  if (!candidate.startsWith(prefix)) return null;
  return candidate;
}

const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  const filename = containedPath(url.pathname);
  if (!filename || !existsSync(filename) || !statSync(filename).isFile()) {
    response.writeHead(404, { "Cache-Control": "no-store" }).end();
    return;
  }
  const size = statSync(filename).size;
  response.writeHead(200, {
    "Content-Type": contentTypes.get(extname(filename)) ?? "application/octet-stream",
    "Content-Length": String(size),
    "Cache-Control": "no-store",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filename).pipe(response);
});

server.listen(port, host, () => {
  process.stdout.write(`Local game-data server: http://${host}:${port}/ -> ${root}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}


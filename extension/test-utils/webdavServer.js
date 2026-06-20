// Minimal mock WebDAV server for tests: Basic auth, GET/PUT/MKCOL on a single
// JSON file, with ETag + If-Match / If-None-Match conditional semantics and
// 409 when a parent collection is missing. Enough to exercise the adapter.
// Lives outside test/ so the runner doesn't treat it as a test file.
import http from "node:http";

export function createMockWebdav({ username = "u", password = "p" } = {}) {
  const files = new Map(); // path -> { body, etag }
  const cols = new Set(["/"]); // existing collections
  let seq = 0;
  const expected = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

  return http.createServer(async (req, res) => {
    const send = (code, body, headers = {}) => { res.writeHead(code, headers); res.end(body ?? ""); };
    if (req.headers.authorization !== expected) return send(401);

    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const parent = path.replace(/[^/]*$/, ""); // directory containing the file

    if (req.method === "MKCOL") { cols.add(path.endsWith("/") ? path : path + "/"); return send(201); }

    if (req.method === "GET") {
      const f = files.get(path);
      if (!f) return send(404);
      return send(200, f.body, { ETag: f.etag, "Content-Type": "application/json" });
    }

    if (req.method === "PUT") {
      if (!cols.has(parent)) return send(409); // parent collection missing
      const f = files.get(path);
      const ifMatch = req.headers["if-match"];
      const ifNone = req.headers["if-none-match"];
      if (ifNone === "*" && f) return send(412);
      if (ifMatch !== undefined && (!f || f.etag !== ifMatch)) return send(412);
      let body = "";
      for await (const c of req) body += c;
      const etag = `"${++seq}"`;
      files.set(path, { body, etag });
      return send(200, "", { ETag: etag });
    }
    return send(405);
  });
}

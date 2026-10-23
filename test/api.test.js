import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";

let server;
let base;
before(async () => {
  let port;
  server = createApp({ apiBaseUrl: () => `http://127.0.0.1:${port}/api` }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  port = server.address().port;
  base = `http://127.0.0.1:${port}`;
});
after(() => server.close());

const json = (path, init) => fetch(`${base}${path}`, init).then(async (r) => ({ status: r.status, body: await r.json() }));
const basic = (u, p) => ({ Authorization: `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}` });

test("public endpoint needs no auth", async () => {
  const { status, body } = await json("/api/random");
  assert.equal(status, 200);
  assert.ok(body.secret);
});

test("register validates input and rejects duplicates", async () => {
  const headers = { "Content-Type": "application/json" };
  assert.equal((await json("/api/register", { method: "POST", headers, body: JSON.stringify({ username: "x", password: "short" }) })).status, 400);
  assert.equal((await json("/api/register", { method: "POST", headers, body: JSON.stringify({ username: "tester", password: "long-enough-pw" }) })).status, 201);
  assert.equal((await json("/api/register", { method: "POST", headers, body: JSON.stringify({ username: "tester", password: "long-enough-pw" }) })).status, 409);
});

test("basic auth protects /all and paginates", async () => {
  assert.equal((await json("/api/all")).status, 401);
  assert.equal((await json("/api/all", { headers: basic("tester", "wrong-password") })).status, 401);
  const { status, body } = await json("/api/all?page=2", { headers: basic("tester", "long-enough-pw") });
  assert.equal(status, 200);
  assert.equal(body.page, 2);
  assert.equal(body.data.length, 4);
});

test("api key protects /filter", async () => {
  assert.equal((await json("/api/filter?score=5")).status, 401);
  const { body: { apiKey } } = await json("/api/generate-api-key");
  const { status, body } = await json("/api/filter?score=9", { headers: { "X-API-Key": apiKey } });
  assert.equal(status, 200);
  assert.ok(body.every((s) => s.emScore >= 9));
});

test("bearer token protects /secrets/:id", async () => {
  const { body: { token } } = await json("/api/get-auth-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "tester", password: "long-enough-pw" }),
  });
  assert.equal((await json("/api/secrets/3", { headers: { Authorization: "Bearer forged.token" } })).status, 401);
  const { status, body } = await json("/api/secrets/3", { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(status, 200);
  assert.equal(body.requestedBy, "tester");
});

test("lab UI performs each auth flow via axios and masks secrets", async () => {
  for (const kind of ["none", "basic", "apikey", "bearer"]) {
    const res = await fetch(`${base}/try/${kind}`);
    const html = await res.text();
    assert.equal(res.status, 200, kind);
    assert.match(html, /class="status s2xx">200</, kind);
  }
  const bearerHtml = await (await fetch(`${base}/try/bearer`)).text();
  assert.match(bearerHtml, /Bearer [\w-]{6}…[\w-]{4}/);
});

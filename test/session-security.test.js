const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(baseUrl, child) {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    if (child.exitCode !== null) throw new Error("Server exited before accepting connections.");
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }
  throw new Error("Server did not start within 5 seconds.");
}

async function startServer(t) {
  const port = await getFreePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl, child);
  return baseUrl;
}

test("session actions require the controller token", async (t) => {
  const baseUrl = await startServer(t);
  const createResponse = await fetch(`${baseUrl}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state: {} }),
  });
  assert.equal(createResponse.status, 201);
  const session = await createResponse.json();

  const actionUrl = `${baseUrl}/api/sessions/${session.sessionId}/actions`;
  const action = { type: "ADD_PLAYER", name: "Mila" };

  const missingTokenResponse = await fetch(actionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseRevision: 0, action }),
  });
  assert.equal(missingTokenResponse.status, 403);

  const wrongTokenResponse = await fetch(actionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "wrong-token", baseRevision: 0, action }),
  });
  assert.equal(wrongTokenResponse.status, 403);

  const validTokenResponse = await fetch(actionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: session.controllerToken, baseRevision: 0, action }),
  });
  assert.equal(validTokenResponse.status, 200);
  const payload = await validTokenResponse.json();
  assert.deepEqual(payload.state.players.map((player) => player.name), ["Mila"]);
});

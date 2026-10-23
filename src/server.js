import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
// By default the client calls this same server's /api over HTTP. Point API_BASE_URL elsewhere to use a remote API.
const apiBaseUrl = () => process.env.API_BASE_URL ?? `http://127.0.0.1:${port}/api`;

const server = createApp({ apiBaseUrl }).listen(port, () => console.log(`🧪 API Auth Lab at http://localhost:${port}`));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

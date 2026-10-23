import axios from "axios";

/**
 * The "client side" of the lab. It talks to the Secrets API over real HTTP using axios,
 * exactly as it would talk to any third-party API, and records each exchange for display.
 */
export function createLabClient(baseURL) {
  const http = axios.create({ baseURL, timeout: 5000, validateStatus: () => true });
  const credentials = { username: "lab_user", password: "correct-horse-battery", apiKey: null, token: null };
  let ready = null;

  async function bootstrap() {
    await http.post("/register", { username: credentials.username, password: credentials.password });
    credentials.apiKey = (await http.get("/generate-api-key")).data.apiKey;
    credentials.token = (await http.post("/get-auth-token", { username: credentials.username, password: credentials.password })).data.token;
  }

  const ensureReady = () => (ready ??= bootstrap().catch((error) => {
    ready = null;
    throw error;
  }));

  /** Hide most of a secret so the UI can show *which* header was sent without leaking it. */
  const mask = (value) => (value.length <= 10 ? "••••" : `${value.slice(0, 6)}…${value.slice(-4)}`);

  async function call(kind, params = {}) {
    await ensureReady();
    const requests = {
      none: { method: "get", url: "/random" },
      basic: {
        method: "get",
        url: "/all",
        params: { page: params.page ?? 1 },
        auth: { username: credentials.username, password: credentials.password },
      },
      apikey: { method: "get", url: "/filter", params: { score: params.score ?? 7 }, headers: { "X-API-Key": credentials.apiKey } },
      bearer: { method: "get", url: `/secrets/${params.id ?? 2}`, headers: { Authorization: `Bearer ${credentials.token}` } },
    };
    const config = requests[kind];
    if (!config) throw new RangeError(`Unknown auth kind: ${kind}`);

    const started = Date.now();
    const response = await http.request(config);
    const shownHeaders = {};
    if (config.auth) shownHeaders.Authorization = `Basic ${mask(Buffer.from(`${config.auth.username}:${config.auth.password}`).toString("base64"))}`;
    for (const [name, value] of Object.entries(config.headers ?? {})) shownHeaders[name] = name === "Authorization" ? `Bearer ${mask(value.split(" ")[1])}` : mask(value);

    const query = config.params ? `?${new URLSearchParams(config.params)}` : "";
    return {
      kind,
      request: { method: config.method.toUpperCase(), url: `${config.url}${query}`, headers: shownHeaders },
      response: { status: response.status, ms: Date.now() - started, body: response.data },
    };
  }

  return { call };
}

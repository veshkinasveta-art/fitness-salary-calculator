type JsonObject = Record<string, unknown>;

type OutboxRow = {
  outbox_id: string;
  entity_type: string;
  entity_id: string;
  operation: "upsert" | "delete";
  payload: unknown;
  source_updated_at: string | null;
  revision: number;
  claim_token: string;
  attempts: number;
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

const TABS = [
  "Сотрудники",
  "Товары",
  "Периоды",
  "Продажи",
  "Расчёты",
  "Настройки",
  "Журнал",
] as const;

const TAB_BY_ENTITY: Record<string, (typeof TABS)[number]> = {
  employee: "Сотрудники",
  employees: "Сотрудники",
  product: "Товары",
  products: "Товары",
  period: "Периоды",
  periods: "Периоды",
  sale: "Продажи",
  sales: "Продажи",
  calculation: "Расчёты",
  calculations: "Расчёты",
  employee_period_metrics: "Расчёты",
  calculation_snapshots: "Расчёты",
  setting: "Настройки",
  settings: "Настройки",
  studios: "Настройки",
  compensation_plans: "Настройки",
  bonus_tiers: "Настройки",
  kpi_rules: "Настройки",
  audit: "Журнал",
  audit_log: "Журнал",
};

const SYSTEM_COLUMNS = [
  "_operation",
  "_source_updated_at",
  "_outbox_id",
  "_mirrored_at",
] as const;

const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const spreadsheetId = requiredEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
const triggerSecret = requiredEnv("GOOGLE_SHEETS_SYNC_TRIGGER_SECRET");
const serviceAccount = readServiceAccount();

let cachedGoogleToken: { value: string; expiresAt: number } | null = null;

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, {
      Allow: "POST",
    });
  }

  if (
    !constantTimeEqual(
      request.headers.get("x-sync-secret") ?? "",
      triggerSecret,
    )
  ) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const input = await readInput(request);
    const batchSize = clampInteger(input.batchSize, 50, 1, 200);
    const maxAttempts = clampInteger(input.maxAttempts, 8, 1, 20);
    const leaseSeconds = clampInteger(input.leaseSeconds, 300, 30, 1800);

    await ensureTabs();

    const rows = await claimRows(batchSize, leaseSeconds, maxAttempts);
    let synced = 0;
    let retried = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        await mirrorRow(row);
        await finishRow(row, {
          status: "sent",
          processed_at: new Date().toISOString(),
          synced_at: new Date().toISOString(),
          last_error: null,
          locked_at: null,
          claim_token: null,
        });
        synced += 1;
      } catch (error) {
        if (error instanceof StaleClaimError) {
          await releaseClaim(row);
          retried += 1;
          continue;
        }

        const finalFailure = row.attempts >= maxAttempts;
        const message = safeErrorMessage(error);
        const retryDelaySeconds = Math.min(
          3600,
          15 * 2 ** Math.max(0, row.attempts - 1),
        );

        try {
          await finishRow(row, {
            status: finalFailure ? "failed" : "pending",
            last_error: message,
            next_attempt_at: new Date(
              Date.now() + retryDelaySeconds * 1000,
            ).toISOString(),
            locked_at: null,
            claim_token: null,
          });
        } catch (finishError) {
          if (!(finishError instanceof StaleClaimError)) throw finishError;
          await releaseClaim(row);
          retried += 1;
          continue;
        }

        if (finalFailure) failed += 1;
        else retried += 1;
      }
    }

    return jsonResponse({
      claimed: rows.length,
      synced,
      retried,
      failed,
    });
  } catch (error) {
    return jsonResponse({ error: safeErrorMessage(error) }, 500);
  }
});

async function readInput(request: Request): Promise<JsonObject> {
  const text = await request.text();
  if (!text.trim()) return {};

  const parsed: unknown = JSON.parse(text);
  if (!isPlainObject(parsed)) throw new Error("Request body must be an object");
  return parsed;
}

async function claimRows(
  batchSize: number,
  leaseSeconds: number,
  maxAttempts: number,
): Promise<OutboxRow[]> {
  const response = await supabaseFetch("/rest/v1/rpc/claim_google_sheets_sync", {
    method: "POST",
    body: JSON.stringify({
      p_batch_size: batchSize,
      p_lease_seconds: leaseSeconds,
      p_max_attempts: maxAttempts,
    }),
  });

  const value: unknown = await response.json();
  if (!Array.isArray(value)) throw new Error("Invalid outbox claim response");
  return value as OutboxRow[];
}

async function finishRow(
  row: OutboxRow,
  values: JsonObject,
): Promise<void> {
  const query = new URLSearchParams({
    id: `eq.${row.outbox_id}`,
    claim_token: `eq.${row.claim_token}`,
    revision: `eq.${row.revision}`,
  });
  const response = await supabaseFetch(`/rest/v1/sync_outbox?${query}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      ...values,
      updated_at: new Date().toISOString(),
    }),
  });

  const updated: unknown = await response.json();
  if (!Array.isArray(updated) || updated.length !== 1) {
    throw new StaleClaimError();
  }
}

async function releaseClaim(row: OutboxRow): Promise<void> {
  const query = new URLSearchParams({
    id: `eq.${row.outbox_id}`,
    claim_token: `eq.${row.claim_token}`,
  });
  await supabaseFetch(`/rest/v1/sync_outbox?${query}`, {
    method: "PATCH",
    body: JSON.stringify({
      locked_at: null,
      claim_token: null,
      next_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
}

async function mirrorRow(row: OutboxRow): Promise<void> {
  const tab = TAB_BY_ENTITY[row.entity_type.toLowerCase()];
  if (!tab) throw new Error("Unsupported outbox entity type");
  if (!row.entity_id) throw new Error("Outbox entity id is empty");

  const payload = isPlainObject(row.payload)
    ? row.payload
    : { value: row.payload };
  const payloadColumns = Object.keys(payload)
    .filter((key) =>
      key !== "entity_id" &&
      !SYSTEM_COLUMNS.includes(key as (typeof SYSTEM_COLUMNS)[number])
    )
    .sort((a, b) => a.localeCompare(b));

  const headers = (await getValues(`${quoteTab(tab)}!1:1`))[0]
    ?.map((value) => String(value)) ?? [];

  if (headers.length === 0) headers.push("entity_id");
  if (!headers.includes("entity_id")) headers.push("entity_id");

  for (const column of payloadColumns) {
    if (!headers.includes(column)) headers.push(column);
  }
  for (const column of SYSTEM_COLUMNS) {
    if (!headers.includes(column)) headers.push(column);
  }

  const lastColumn = columnName(headers.length);
  await putValues(`${quoteTab(tab)}!A1:${lastColumn}1`, [headers]);

  const entityIdColumn = headers.indexOf("entity_id") + 1;
  const entityIdColumnName = columnName(entityIdColumn);
  const ids = await getValues(
    `${quoteTab(tab)}!${entityIdColumnName}2:${entityIdColumnName}`,
  );
  const existingIndex = ids.findIndex(
    (candidate) => String(candidate[0] ?? "") === row.entity_id,
  );

  const output = headers.map((header) => {
    if (header === "entity_id") return row.entity_id;
    if (header === "_operation") return row.operation;
    if (header === "_source_updated_at") {
      return row.source_updated_at ?? "";
    }
    if (header === "_outbox_id") return row.outbox_id;
    if (header === "_mirrored_at") return new Date().toISOString();
    return sheetValue(payload[header]);
  });

  if (existingIndex >= 0) {
    const sheetRow = existingIndex + 2;
    await putValues(
      `${quoteTab(tab)}!A${sheetRow}:${lastColumn}${sheetRow}`,
      [output],
    );
  } else {
    await appendValues(`${quoteTab(tab)}!A:${lastColumn}`, [output]);
  }
}

async function ensureTabs(): Promise<void> {
  const response = await googleRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${
      encodeURIComponent(spreadsheetId)
    }?fields=sheets.properties.title`,
  );
  const document: unknown = await response.json();
  const existing = new Set<string>();

  if (isPlainObject(document) && Array.isArray(document.sheets)) {
    for (const sheet of document.sheets) {
      if (
        isPlainObject(sheet) &&
        isPlainObject(sheet.properties) &&
        typeof sheet.properties.title === "string"
      ) {
        existing.add(sheet.properties.title);
      }
    }
  }

  const requests = TABS
    .filter((title) => !existing.has(title))
    .map((title) => ({ addSheet: { properties: { title } } }));
  if (requests.length === 0) return;

  await googleRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${
      encodeURIComponent(spreadsheetId)
    }:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({ requests }),
    },
  );
}

async function getValues(range: string): Promise<unknown[][]> {
  const response = await googleRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${
      encodeURIComponent(spreadsheetId)
    }/values/${encodeURIComponent(range)}?majorDimension=ROWS`,
  );
  const result: unknown = await response.json();
  if (!isPlainObject(result) || !Array.isArray(result.values)) return [];
  return result.values as unknown[][];
}

async function putValues(range: string, values: unknown[][]): Promise<void> {
  await googleRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${
      encodeURIComponent(spreadsheetId)
    }/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: "PUT",
      body: JSON.stringify({ majorDimension: "ROWS", values }),
    },
  );
}

async function appendValues(
  range: string,
  values: unknown[][],
): Promise<void> {
  await googleRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${
      encodeURIComponent(spreadsheetId)
    }/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({ majorDimension: "ROWS", values }),
    },
  );
}

async function googleRequest(
  url: string,
  init: RequestInit = {},
  canRetry = true,
): Promise<Response> {
  const token = await googleAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(url, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
  if (response.status === 401 && canRetry) {
    cachedGoogleToken = null;
    return googleRequest(url, init, false);
  }
  if (!response.ok) {
    throw new Error(`Google API request failed (${response.status})`);
  }
  return response;
}

async function googleAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedGoogleToken && cachedGoogleToken.expiresAt > now + 60) {
    return cachedGoogleToken.value;
  }

  const assertion = await signedJwt(now);
  const response = await fetch(
    serviceAccount.token_uri ?? "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(20_000),
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Google OAuth token exchange failed (${response.status})`);
  }

  const token: unknown = await response.json();
  if (
    !isPlainObject(token) ||
    typeof token.access_token !== "string" ||
    typeof token.expires_in !== "number"
  ) {
    throw new Error("Google OAuth returned an invalid token response");
  }

  cachedGoogleToken = {
    value: token.access_token,
    expiresAt: now + token.expires_in,
  };
  return cachedGoogleToken.value;
}

async function signedJwt(now: number): Promise<string> {
  const header = base64Url(
    new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })),
  );
  const claims = base64Url(
    new TextEncoder().encode(JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: serviceAccount.token_uri ?? "https://oauth2.googleapis.com/token",
      iat: now - 30,
      exp: now + 3600,
    })),
  );
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

async function supabaseFetch(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceRoleKey);
  headers.set("Authorization", `Bearer ${serviceRoleKey}`);
  headers.set("Content-Type", "application/json");
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Supabase outbox request failed (${response.status})`);
  }
  return response;
}

function readServiceAccount(): ServiceAccount {
  const json = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (json) {
    const parsed: unknown = JSON.parse(json);
    if (
      !isPlainObject(parsed) ||
      typeof parsed.client_email !== "string" ||
      typeof parsed.private_key !== "string"
    ) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is invalid");
    }
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replaceAll("\\n", "\n"),
      token_uri: typeof parsed.token_uri === "string"
        ? parsed.token_uri
        : undefined,
    };
  }

  return {
    client_email: requiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    private_key: requiredEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replaceAll(
      "\\n",
      "\n",
    ),
  };
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Required secret is missing: ${name}`);
  return value;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function quoteTab(tab: string): string {
  return `'${tab.replaceAll("'", "''")}'`;
}

function columnName(column: number): string {
  let result = "";
  for (
    let current = column;
    current > 0;
    current = Math.floor((current - 1) / 26)
  ) {
    result = String.fromCharCode(65 + ((current - 1) % 26)) + result;
  }
  return result;
}

function sheetValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return stableStringify(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown synchronization error";
  return error.message.slice(0, 1000);
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

function jsonResponse(
  body: JsonObject,
  status = 200,
  extraHeaders: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...Object.fromEntries(new Headers(extraHeaders)),
    },
  });
}

class StaleClaimError extends Error {
  constructor() {
    super("Outbox entity changed while it was being processed");
    this.name = "StaleClaimError";
  }
}

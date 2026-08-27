import { getAppConfig } from "@/lib/config";

/**
 * Every OneDrive interaction goes through n8n webhooks - Clip Studio never
 * holds its own Microsoft Graph credentials. See design.md, "Clip Studio
 * never talks to Microsoft Graph directly" and the new n8n workflows
 * described in tasks.md section 2 (not built yet - see below).
 *
 * NOTE: the n8n side of these webhooks is tasks.md section 2, which
 * requires touching the production n8n instance and was intentionally
 * paused for a separate confirmation (see design.md's new-n8n-workflow
 * decision). Until that workflow exists and its real webhook path/secret
 * are configured in the admin console (task 6.3), these calls will fail
 * with a clear "not configured" error rather than silently doing nothing.
 */

export type ClipSummary = {
  itemId: string;
  name: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  downloadUrl: string | null;
  hook: string | null;
  reason: string | null;
  sizeBytes: number | null;
  modifiedAt: string | null;
  edited: boolean;
};

class N8nNotConfiguredError extends Error {
  constructor() {
    super(
      "A URL do webhook do N8N ainda não foi configurada em Configurações (Admin)."
    );
    this.name = "N8nNotConfiguredError";
  }
}

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;
const WEBHOOK_TIMEOUT_MS = 20_000;
const META_FETCH_TIMEOUT_MS = 10_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** fetch() with an AbortController-based timeout - plain fetch() never times out on its own. */
function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * Retries transient failures (network errors, 5xx) with exponential
 * backoff - the n8n webhook base URL points at a VPS this app doesn't
 * control the uptime of, so a brief blip shouldn't surface as a hard
 * error to the user. Does not retry 4xx (bad request/auth) - those won't
 * succeed on retry.
 */
async function callWebhook<T>(path: string, body: unknown): Promise<T> {
  const config = await getAppConfig();
  if (!config.n8nIngestWebhookUrl) {
    throw new N8nNotConfiguredError();
  }

  const base = config.n8nIngestWebhookUrl.replace(/\/+$/, "");
  const url = `${base}/${path.replace(/^\/+/, "")}`;
  const headers = {
    "Content-Type": "application/json",
    ...(config.n8nWebhookSharedSecret
      ? { "X-Clip-Studio-Secret": config.n8nWebhookSharedSecret }
      : {}),
  };
  const payload = JSON.stringify(body);

  let lastError: Error = new Error("Chamada ao N8N falhou");

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetchWithTimeout(
        url,
        { method: "POST", headers, body: payload },
        WEBHOOK_TIMEOUT_MS
      );

      if (res.ok) {
        return (await res.json()) as T;
      }

      const text = await res.text().catch(() => "");
      lastError = new Error(`Chamada ao N8N falhou (${res.status}): ${text.slice(0, 300)}`);
      if (res.status < 500) break; // 4xx won't be fixed by retrying
    } catch (err) {
      lastError =
        err instanceof Error && err.name === "AbortError"
          ? new Error("Tempo limite excedido ao contatar o N8N.")
          : err instanceof Error
            ? err
            : new Error(String(err));
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

type GraphDriveItem = {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime?: string;
  "@microsoft.graph.downloadUrl"?: string;
  file?: { mimeType?: string };
  thumbnails?: Array<{
    small?: { url?: string };
    medium?: { url?: string };
    large?: { url?: string };
  }>;
};

type ClipMetaJson = {
  hook?: string;
  reason?: string;
  start?: number;
  end?: number;
  real_start?: number;
  real_end?: number;
  edited?: boolean;
};

/**
 * n8n's `clip-studio/clips` webhook deliberately just proxies the raw
 * Microsoft Graph children listing (see design.md - n8n's Code node has no
 * network access to fetch each `_meta.json`'s content itself). Pairing
 * each `.mp4` with its `_meta.json` (naming convention: `X.mp4` <->
 * `X_meta.json`, see Montar Clipes in the n8n "Blocos" pipeline) and
 * fetching the meta content happens here instead, using Node's normal
 * fetch - the meta file's own `@microsoft.graph.downloadUrl` is already a
 * pre-authenticated temporary URL, no credential needed to read it.
 */
export async function listClips(): Promise<ClipSummary[]> {
  const result = await callWebhook<{ value: GraphDriveItem[] }>("clip-studio/clips", {});
  const items = result.value ?? [];

  const mp4Items = items.filter((i) => i.name.toLowerCase().endsWith(".mp4"));
  const metaByStem = new Map<string, GraphDriveItem>();
  for (const item of items) {
    if (item.name.toLowerCase().endsWith("_meta.json")) {
      metaByStem.set(item.name.slice(0, -"_meta.json".length), item);
    }
  }

  return Promise.all(
    mp4Items.map(async (mp4): Promise<ClipSummary> => {
      const stem = mp4.name.slice(0, -".mp4".length);
      const metaItem = metaByStem.get(stem);
      const thumb = mp4.thumbnails?.[0];
      const thumbnailUrl = thumb?.medium?.url ?? thumb?.large?.url ?? thumb?.small?.url ?? null;

      let meta: ClipMetaJson | null = null;
      if (metaItem?.["@microsoft.graph.downloadUrl"]) {
        try {
          const res = await fetchWithTimeout(
            metaItem["@microsoft.graph.downloadUrl"],
            {},
            META_FETCH_TIMEOUT_MS
          );
          if (res.ok) meta = (await res.json()) as ClipMetaJson;
        } catch {
          // Missing/unreadable meta shouldn't hide the clip - see
          // video-library spec, "Clip missing metadata is not fatal".
        }
      }

      const start = meta?.real_start ?? meta?.start ?? null;
      const end = meta?.real_end ?? meta?.end ?? null;
      const durationSeconds = start != null && end != null ? end - start : null;

      return {
        itemId: mp4.id,
        name: mp4.name,
        durationSeconds,
        thumbnailUrl,
        downloadUrl: mp4["@microsoft.graph.downloadUrl"] ?? null,
        hook: meta?.hook ?? null,
        reason: meta?.reason ?? null,
        sizeBytes: mp4.size ?? null,
        modifiedAt: mp4.lastModifiedDateTime ?? null,
        edited: meta?.edited === true,
      };
    })
  );
}

export async function renameClip(itemId: string, newName: string): Promise<void> {
  await callWebhook("clip-studio/clips/rename", { itemId, newName });
}

export async function deleteClip(itemId: string): Promise<void> {
  await callWebhook("clip-studio/clips/delete", { itemId });
}

/**
 * Re-cuts a clip's own .mp4 in place (design.md: "Manual clip trimming").
 * newStartSec/newEndSec are relative to the clip's *own* current duration,
 * not the original source video - this can only shorten an already-produced
 * clip.
 */
export async function trimClip(
  itemId: string,
  newStartSec: number,
  newEndSec: number
): Promise<{ durationSeconds: number }> {
  return callWebhook("clip-studio/clips/trim", { itemId, newStartSec, newEndSec });
}

/** Checks whether the given original file name now exists in Videos-Cortes/Videos (pipeline finished). */
export async function isOriginalArchived(uploadedFileName: string): Promise<boolean> {
  const result = await callWebhook<{ archived: boolean }>("clip-studio/videos/check-archived", {
    fileName: uploadedFileName,
  });
  return result.archived;
}

export async function triggerIngestion(params: {
  submissionId: string;
  youtubeUrl: string;
  title: string;
}): Promise<void> {
  await callWebhook("clip-studio/ingest", params);
}

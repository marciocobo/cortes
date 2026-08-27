const YOUTUBE_URL_RE =
  /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/)[\w-]{6,}|youtu\.be\/[\w-]{6,})/i;

/** youtube-ingestion spec: "Malformed link rejected" */
export function isYoutubeVideoUrl(url: string): boolean {
  return YOUTUBE_URL_RE.test(url.trim());
}

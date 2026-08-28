OUT="{{ $json.localPath }}"
MASTER_COOKIES=/home/node/.n8n-files/youtube-cookies.master.txt
SCRATCH_COOKIES=/home/node/.n8n-files/.cookies-{{ $json.submissionId }}.txt
URL="{{ $json.youtubeUrl }}"

attempt_download() {
  COOKIE_ARG=""
  if [ -f "$MASTER_COOKIES" ]; then cp "$MASTER_COOKIES" "$SCRATCH_COOKIES"; chmod 600 "$SCRATCH_COOKIES"; COOKIE_ARG="--cookies $SCRATCH_COOKIES"; fi
  /home/node/.n8n-files/yt-dlp --no-playlist --retries 5 --fragment-retries 5 $COOKIE_ARG --js-runtimes node:/usr/local/bin/node \
    -f "bestvideo[height>=2160][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height>=2160]+bestaudio/best[height>=2160]/bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b" \
    --merge-output-format mp4 --embed-thumbnail --add-metadata \
    -o "$OUT" "$URL" 2>&1
  rm -f "$SCRATCH_COOKIES"
}

YTDLP_LOG=$(attempt_download)
echo "$YTDLP_LOG"
SIZE=$(stat -c%s "$OUT" 2>/dev/null || echo 0)

if [ "$SIZE" -lt 1048576 ] && echo "$YTDLP_LOG" | grep -q "Sign in to confirm you.re not a bot"; then
  echo "Cookie parece expirado (bot-check) - acionando cookie-refresher e tentando novamente uma vez" >&2
  wget -q --method=POST -O - http://cookie-refresher-1:4600/refresh >&2
  rm -f "$OUT"
  YTDLP_LOG=$(attempt_download)
  echo "$YTDLP_LOG"
  SIZE=$(stat -c%s "$OUT" 2>/dev/null || echo 0)
fi

if [ "$SIZE" -lt 1048576 ]; then
  TAIL=$(echo "$YTDLP_LOG" | tail -c 400 | tr '\n' ' ')
  echo "ERRO: arquivo baixado tem menos de 1MB ou nao existe. yt-dlp: $TAIL" >&2
  exit 1
fi
echo "Download concluido: ${SIZE} bytes"

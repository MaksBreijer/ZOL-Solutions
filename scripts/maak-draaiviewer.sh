#!/bin/zsh
# Zet een filmpje van je product (één rondje eromheen of het product op een draaischijf) om in frames voor de draaiviewer.
# Gebruik: npm run draai -- ~/Downloads/mijn-product.mov [aantal-frames]
set -e
video="$1"
count="${2:-48}"
if [[ -z "$video" || ! -f "$video" ]]; then
  echo "Gebruik: npm run draai -- pad/naar/filmpje.mov [aantal-frames, standaard 48]"
  exit 1
fi
out="public/media/360"
rm -rf "$out" && mkdir -p "$out"
duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$video")
fps=$(awk -v c="$count" -v d="$duration" 'BEGIN { printf "%.5f", c / d }')
# 1000 px breed is scherp genoeg voor de pagina en houdt elk frame klein.
ffmpeg -v error -i "$video" -vf "fps=$fps,scale=1000:-2" -frames:v "$count" -q:v 4 "$out/%03d.jpg"
n=$(ls "$out"/*.jpg | wc -l | tr -d ' ')
dims=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$out/001.jpg")
printf '{"count":%s,"ext":"jpg","width":%s,"height":%s,"alt":"Draai het product rond"}\n' "$n" "${dims%x*}" "${dims#*x}" > "$out/frames.json"
echo "Klaar: $n frames in $out"
echo "Open de productpagina (npm run dev) en sleep over het product."

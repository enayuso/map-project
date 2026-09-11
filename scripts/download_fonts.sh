#!/usr/bin/env bash
# Downloads the glyph fonts Martin self-hosts for map labels (see
# backend/martin-config.yaml's "fonts" source and styles/*.json's "glyphs"
# URL, which points at Martin's own /font/{fontstack}/{range} endpoint).
#
# Why self-hosted at all: styles/*.json used to point "glyphs" straight at
# https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf (MapLibre's
# own demo tile server, never meant as a public font CDN). That triggers a
# real maplibre-native bug - offline pack downloads (OfflineManager.
# createPack) abort the whole app with an uncaught std::regex_error while
# canonicalizing that specific glyphs URL, 100% reproducible.
# See github.com/maplibre/maplibre-native/issues/4403. The fix is simply to
# not use demotiles.maplibre.org for glyphs; self-hosting (rather than
# pointing at some other third party) also means offline downloads for
# remote Belize areas don't depend on an external font server's uptime.
#
# Fontstacks: our styles only ever reference "Noto Sans Regular" and
# "Noto Sans Bold" (grep styles/*.json's "text-font" arrays if that ever
# changes - Martin's fontstack name comes from each font file's own
# nameID-4 "full name", so a renamed/added font must carry the exact
# fontstack string a style's text-font array uses).
#
# Source: notofonts/noto-fonts on GitHub (the upstream Noto Fonts project,
# not Google's variable-font-only mirror), SIL Open Font License - free,
# commercial use explicitly permitted.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FONTS_DIR="$ROOT_DIR/data/fonts"
mkdir -p "$FONTS_DIR"

BASE_URL="https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans"

for f in NotoSans-Regular.ttf NotoSans-Bold.ttf; do
  echo "Fetching $f..."
  curl -sL -o "$FONTS_DIR/$f" "$BASE_URL/$f"
done

curl -sL -o "$FONTS_DIR/OFL.txt" \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/OFL.txt"

echo "Done. Restart Martin to pick them up:"
echo "  docker compose -f backend/docker-compose.yml restart martin"

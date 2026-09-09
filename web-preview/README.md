# Web preview (dev tool only — not a product deliverable)

This is a throwaway MapLibre GL JS page used to visually verify the Phase 1 backend (PostGIS → Martin → vector tiles → `styles/basic.json`) while the mobile toolchain isn't set up yet on this machine (see [PLAN.md](../docs/PLAN.md) Phase 1 status). The locked platform decision is **mobile first** ([docs/PLAN.md](../docs/PLAN.md)) — this page is not that; it exists purely so the tile pipeline and style can be checked in a browser without needing Xcode/Android Studio.

## Run it

Needs the [backend](../backend/) stack running (`docker compose up -d` in `backend/`) and data imported.

```bash
cd map-project
python3 -m http.server 8080
```

Then open `http://127.0.0.1:8080/web-preview/index.html`. Centers on Belize City by default; try `map.jumpTo({center: [-87.9614, 17.9146], zoom: 14})` in the browser console to jump to San Pedro/Ambergris Caye.

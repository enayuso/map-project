# map-project (지도) — 벨리즈 지도 앱 직접 만들기

> English: [README_en.md](README_en.md)

네이버 지도 / 카카오맵의 구조(**타일 → 지오코딩·검색 → 길찾기 → 모바일 클라이언트**)를 오픈소스 스택으로 다시 만들어
**벨리즈(Belize)**용 지도 앱을 처음부터 구축한 프로젝트다. 모든 계층을 Docker로 직접 호스팅해 로컬에서 실행하며,
클라이언트는 iOS 시뮬레이터에서 돌아가는 React Native 앱이다.

실제 지도 서비스가 내부적으로 어떻게 동작하는지 — 데이터 수집, 벡터 타일, 검색, 라우팅 그래프, 그리고 실서비스에
필요한 계정·모더레이션·개인정보/법적 요건까지 — 직접 이해하려고 시작했다. 리서치·설계·구현은 **Claude Code**와 함께
진행했다.

## 주요 기능

- **기본 지도** — PostGIS에 적재한 OpenStreetMap 데이터를 Martin이 벡터 타일로 제공하고 MapLibre로 렌더링. 라이트/다크
  스타일, 단계별 지명 라벨, 국경선, 자체 호스팅 글꼴, Sentinel-2 위성/하이브리드 지도 전환
- **검색·지오코딩** — 오타에 강한 POI 검색(Typesense, OSM + Overture Maps Places), 카테고리 빠른 필터, 주소
  지오코딩(Nominatim), 즐겨찾기·최근 검색, iOS Spotlight 연동
- **길찾기·내비게이션** — Valhalla 기반 자동차/도보/자전거 경로, "포장도로 우선" 옵션, 페리를 포함한 경로, 실시간
  턴바이턴 안내(Live Activity / Dynamic Island ETA), 경로 주변 검색, 속도계
- **벨리즈 특화 정보** — 페리·수상택시 시간표, 다이빙 포인트, 국경 통과 안내 카드, 계절 정보(랍스터·소라 금어기,
  고래상어, 바다거북 산란), 날씨 레이어와 홈 화면 위젯
- **소셜** — 실시간 위치 공유, 장소 목록 공유, 실시간 위치를 반영한 공정한 약속 장소 계산기, 도로 위험 제보와 POI
  수정 제안(토큰으로 보호된 웹 모더레이션 페이지 포함)
- **계정·컴플라이언스** — Sign in with Apple / 이메일 코드 로그인, 닉네임 + 이모지 프로필, 30일 유예 후 삭제되는
  회원 탈퇴, 개인정보처리방침·이용약관, OSM/ODbL 출처 표시
- **품질** — 오프라인 지도 다운로드, 에러 바운더리 + 로컬 크래시 로그, VoiceOver 라벨, Jest·pytest 테스트

## 구조

```
                   ┌───────────────────────── mobile/ (React Native + MapLibre Native) ─────────────────────────┐
                   │   지도 · 검색 · 길찾기 · 내비게이션 · 공유 · 프로필 · 위젯                                 │
                   └──────┬──────────────┬──────────────┬───────────────┬────────────────┬──────────────────────┘
                          │ 타일         │ POI 검색     │ 지오코딩      │ 경로           │ 공유 / 프로필 API
                   ┌──────▼─────┐ ┌──────▼──────┐ ┌─────▼──────┐ ┌──────▼──────┐ ┌───────▼────────┐
                   │ Martin     │ │ Typesense   │ │ Nominatim  │ │ Valhalla    │ │ sharing/       │
                   │ :3000      │ │ :8108       │ │ :8082      │ │ :8002       │ │ FastAPI :8090  │
                   └──────┬─────┘ └──────▲──────┘ └────────────┘ └─────────────┘ └───────┬────────┘
                          │              │ 인덱싱                                          │
                   ┌──────▼──────────────┴─────────────────────────────────────────────────▼────────┐
                   │ backend/ PostGIS :5433  (OSM 추출본, 해안 폴리곤, 위성 영상, 앱 테이블)         │
                   └─────────────────────────────────────────────────────────────────────────────────┘
```

## 디렉터리 구조

| 경로 | 내용 |
|---|---|
| [`backend/`](backend/README.md) | PostGIS + Martin 타일 서버 (Docker) |
| [`geocoding/`](geocoding/README.md) | Nominatim 지오코더 (Docker) |
| [`search/`](search/README.md) | Typesense POI 검색 + 카테고리 체계 (Docker) |
| [`routing/`](routing/README.md) | Valhalla 라우팅 엔진 (Docker) |
| [`sharing/`](sharing/README.md) | FastAPI 서비스: 위치 공유, 목록, 위험 제보, POI 수정, 프로필, 모더레이션 페이지, 큐레이션 데이터 |
| [`mobile/`](mobile/README.md) | React Native 앱(iOS 우선) — 기능별 설명과 알려진 이슈 |
| `styles/` | MapLibre 스타일(라이트, 다크, 하이브리드) |
| `scripts/` | 데이터 파이프라인(OSM 다운로드·클리핑, 해안 폴리곤, 위성 모자이크, 글꼴, Overture 병합, POI 인덱스), DB 테이블 생성, 유지보수 작업, 스모크 테스트 |
| `web-preview/` | Xcode 없이 브라우저에서 타일·스타일을 확인하는 임시 페이지 |
| `docs/` | [`RESEARCH-SUMMARY.md`](docs/RESEARCH-SUMMARY.md), [`PLAN.md`](docs/PLAN.md)(단계별 계획과 진행 상황), [`docs/research/`](docs/research/)의 리서치 노트 15편 |

용량이 크고 다시 만들 수 있는 데이터(`data/raw`, 타일, 글꼴, 위성 영상 등)는 gitignore 대상이며 스크립트로 재생성한다.

## 시작하기

준비물: Docker(Colima 가능 — Nominatim용으로 VM 메모리를 충분히 할당), Python 3, Node.js, iOS 앱용 Xcode + CocoaPods.

```bash
# 1. 데이터
scripts/fetch_and_clip_osm.sh            # 벨리즈 OSM 추출본(Geofabrik) + 파일럿 지역 클리핑
scripts/download_fonts.sh                # 자체 호스팅 지도 글꼴

# 2. 기본 지도 — PostGIS :5433 + Martin :3000 (데이터 적재 절차는 backend/README.md 참고)
cd backend && docker compose up -d && cd ..
scripts/import_water_polygons.sh

# 3. 지오코딩 / 검색 / 길찾기
(cd geocoding && docker compose up -d)                          # :8082
(cd search && docker compose up -d) && scripts/reindex_pois.sh  # :8108
pip3 install osmium && python3 scripts/patch_ferry_connectors.py
(cd routing && docker compose up -d)                            # :8002

# 4. 앱 백엔드 — 테이블은 한 번만 생성, 그다음 :8090 실행
for s in location_shares shared_lists hazard_reports poi_corrections profiles; do scripts/create_${s}_table.sh; done
(cd sharing && cp .env.example .env && docker compose up -d --build)

# 5. 모바일 앱 (iOS 시뮬레이터) — 자세한 절차는 mobile/README.md
cd mobile && npm install && (cd ios && bundle install && bundle exec pod install)
npx react-native start
```

모든 서비스는 `127.0.0.1`에만 바인딩된다. compose 파일에 들어 있는 비밀번호(`devpass123`, `*_dev_local_only`)는
로컬 개발용 기본값이므로, 다른 환경에서 실행할 때는 각 컴포넌트의 `.env`로 실제 값을 설정한다.

## 테스트

```bash
cd mobile && npx jest                     # React Native 단위 테스트
scripts/test_routing.sh                   # Valhalla 스모크 테스트 (routing 실행 중)
scripts/test_geocoding.sh                 # Nominatim 스모크 테스트 (geocoding 실행 중)
# sharing/ pytest는 DB가 필요하므로 컨테이너 안에서 실행 — sharing/README.md의 "Tests" 참고
```

## 진행 상황

[`docs/PLAN.md`](docs/PLAN.md)의 1–2단계와 4–4.5단계는 구현을 마쳤고 iOS 시뮬레이터에서 종단 간 동작을 확인했다.
남은 일: 벨리즈 정부 공식 데이터 요청(0단계), 실시간 교통·대중교통·거리뷰(5단계), 유료 Apple Developer 계정이
필요한 App Store 제출 절차.

## 데이터·라이선스

지도 데이터 © OpenStreetMap contributors (ODbL), 장소 보강 데이터 Overture Maps, 위성 영상 Copernicus Sentinel-2.
출처 표시는 앱 안에 나온다.

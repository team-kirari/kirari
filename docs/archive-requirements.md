# Codex 개발 지시서: Discord 연동 공동 아카이브 웹사이트

당신은 숙련된 TypeScript 풀스택 엔지니어이자 보안·배포 담당자입니다. 아래 요구사항을 바탕으로 **실제 실행·배포 가능한 프로젝트 전체**를 구현하세요. 설계 설명만 하거나 핵심 기능을 TODO로 남기지 마세요. 이미 코드가 있으면 먼저 분석한 뒤 기존 구조를 가능한 한 존중하세요. 중요한 미결정 사항은 무료 운영, 보안, 단순성 순서로 합리적인 기본값을 정하고 README에 기록하세요. 필요한 외부 계정·비밀키가 없다면 코드를 완성하고 설정·검증 절차를 문서화하세요. **외부 리소스를 임의로 생성·배포하거나 실계정에 쓰기 작업을 하지 마세요.**

## 1. 목표와 사용 방식

두 사람이 Discord에서 실시간으로 대화하고, 웹에서 자료를 작성·정리·검색·보관하는 서비스입니다. 비로그인 방문자는 공개 자료만 봅니다. 멤버는 Discord OAuth2로 로그인하여 공동 자료와 자신의 비공개 자료를 관리합니다.

- 웹: 게시글·긴 Markdown 글·이미지·첨부파일 작성/수정/삭제, 목록·검색·태그·카테고리·작성자·날짜별 필터, 공개 범위 변경, 모바일 대응.
- Discord → 웹: `/archive` 슬래시 명령어로 내용을 선택 저장하고 결과 링크를 반환. 일반 채팅 전체를 기본적으로 수집하지 않음.
- 웹 → Discord: 글 등록·수정·공개 범위 변경 등의 알림. 비공개 자료의 제목·본문·파일명을 부적절한 공개 채널에 노출하지 않음.
- 자료 원본: 긴 글과 이미지/첨부파일은 **별도 GitHub Private Repository**에 GitHub Actions로 저장. 공개 여부는 GitHub 레포지토리 설정이 아니라 웹 API의 권한 정책으로 결정.
- 두 사람이 무료 티어에서 시작할 수 있어야 하고, 별도의 24시간 실행 봇/VPS를 기본 요구하지 않음.

모든 UI는 기본 한국어, DB 시간은 UTC, 화면 시간 표시는 기본 Asia/Seoul. 사이트와 API를 같은 오리진에 배치하세요.

## 2. 기술 스택과 설계 원칙

- Frontend: React + TypeScript + Vite + Tailwind CSS.
- Hosting/API: Cloudflare Pages + Pages Functions(Workers 런타임).
- Database: Cloudflare D1(SQLite), 스키마 마이그레이션 포함.
- 임시 대용량 업로드: Cloudflare R2 private staging bucket.
- 원본 저장: GitHub Private Repo의 Markdown 및 바이너리 파일.
- 자동화: private repo의 GitHub Actions, `repository_dispatch` 또는 공식적으로 지원되는 동등한 트리거.
- 로그인: Discord OAuth2 Authorization Code Grant.
- Discord 수신: HTTP Interactions(슬래시 명령어), Discord 서명 검증. 알림: Webhook 또는 Bot REST API.
- 유효성 검사: Zod 등. 테스트: Vitest, 필요 시 Playwright.
- 패키지 매니저는 npm. 버전과 API는 개발 시점의 공식 문서로 확인.

모든 프런트엔드 비밀정보 노출을 금지합니다. 민감 API는 항상 서버 측 인증·인가를 거쳐야 합니다. 과도한 추상화나 유료 SaaS 의존성을 만들지 마세요.

## 3. 저장소 두 개와 산출물

### `archive-web` (현재 작업 저장소, 공개 가능)

프런트엔드, Pages Functions, D1 마이그레이션, 공용 타입, 저장 API, OAuth2, Discord Interactions, 검색, 테스트, 배포 설정, `.env.example`, `.dev.vars.example`, `README.md`, `AGENTS.md`를 구현합니다. 실사용 콘텐츠와 토큰은 넣지 마세요.

### `archive-data` (별도의 비공개 저장소)

Codex가 권한 없이 원격 저장소를 만들지 않도록, 현재 프로젝트에 **`data-repo-template/`**을 만들고, 사용자가 private repo를 만들었을 때 복사해 넣을 수 있도록 합니다. 최소 내용:

```text
data-repo-template/
├── .github/workflows/archive-sync.yml
├── scripts/                   # 필요 시 저장·검증 스크립트
├── posts/YYYY/MM/<uuid>.md
├── images/YYYY/MM/<uuid>.<ext>
├── attachments/YYYY/MM/<uuid>.<ext>
├── manifests/<uuid>.json
├── README.md
└── AGENTS.md
```

빈 디렉터리 유지를 위한 placeholder는 허용합니다. 업로드 파일명은 안전한 UUID 경로로 저장하고 원본 파일명은 별도 메타데이터로 보관합니다. GitHub의 일반 Git 파일 크기 제한(50MiB 경고, 100MiB 초과 거부)과 Git 이력 증가 문제를 고려하세요. 기본 최대 파일 크기는 이보다 충분히 작게 설정하고 UI에서 안내하세요. 대용량 바이너리를 장기적으로 R2로 옮길 수 있도록 파일 읽기/저장 인터페이스를 분리하되 **초기 구현 원본 저장소는 GitHub Private Repo**입니다.

## 4. D1 데이터 모델

SQL 마이그레이션, 인덱스, 개발용 seed 데이터를 작성하세요. 최소 엔터티:

- `users`: Discord user ID(고유), 표시 이름, 역할(`member`/`admin`), 활성 상태, 가입·갱신 시각.
- `sessions`: 해시된 세션 식별자, 사용자 ID, 만료·폐기 정보. 원문 토큰을 DB에 저장하지 않음.
- `posts`: UUID, 작성자, 제목, 요약, 본문 저장 타입(`inline`/`github`), 짧은 본문(해당 시), 저장 키, 공개 범위, 카테고리, 상태, revision, 작성·수정일, Git 커밋 SHA.
- `attachments`: UUID, 연결 글, 업로드자, 종류, MIME, 크기, 원본명, 안전한 저장 키, 공개 범위(`inherit` 포함), 저장 상태, 해시.
- `tags`, `post_tags`: 태그 정규화.
- `categories`: 카테고리 정보.
- `sync_jobs`: 작업 ID, 종류, 상태(`pending`/`processing`/`ready`/`failed`), 재시도 횟수, 오류 요약, 생성·완료 시각, 멱등성 키.
- `audit_logs`: 주체, 대상, 액션, 시각, 최소한의 변경 정보. 비밀값과 콘텐츠 전체를 로그에 저장하지 않음.

짧은 메모는 D1에 직접 저장해도 됩니다. Markdown 원문이 일정 바이트 이상이거나 첨부파일이 있으면 GitHub 저장 플로우를 사용하세요. 기준값은 설정 가능하도록 합니다. 검색은 제목·요약·태그·카테고리 중심으로 우선 구현하며, 본문 전체 검색은 권한 필터가 보장되는 범위에서 추가하세요. DB 지원 여부를 확인하지 않은 확장에 무조건 의존하지 마세요.

## 5. 공개 범위 및 권한(매우 중요)

게시글 `visibility`:

- `public`: 로그인하지 않은 누구나 열람.
- `shared`: 등록된 활성 멤버만 열람.
- `private`: 작성자만 웹 API를 통해 열람.

기본값은 **`shared`**. 첨부파일은 `inherit`, `public`, `shared`, `private`를 지원하고 기본값은 `inherit`입니다. **첨부파일의 최종 읽기 권한은 상위 게시글 읽기 권한 AND 첨부파일 자체 정책**으로 판정합니다. 상위 게시글이 `private`이면 파일을 `public`으로 표시해도 외부에서는 볼 수 없습니다. 독립 공개 파일이 필요하면 별도 공개 자료로 등록하세요.

- 게스트는 공개 게시글의 목록·상세·검색만 확인.
- 멤버는 공개+공동 자료 및 자신이 쓴 개인 자료 확인.
- 작성자는 자신의 게시글과 파일을 수정·삭제·공개 범위 변경.
- 다른 멤버의 수정은 기본 금지. 공동 편집은 향후 확장으로 남기되 권한 검사 구조를 마련.
- Admin은 사용자/서비스 관리 권한을 갖되, 기본 콘텐츠 API에서 다른 사람의 `private` 글을 읽을 권한을 자동 획득하지 않음.
- 단, private GitHub repo 소유자·관리자는 저장소 원본에 직접 접근할 수 있다는 현실적 한계를 README에 명시. 종단 간 암호화로 홍보하지 말 것.

**서버의 모든 목록·검색·상세·파일·미리보기·다운로드 API에서 동일한 권한 함수를 재사용**하세요. 글 제목·태그·검색 건수·이미지 썸네일·오류 메시지·캐시·알림에 비공개 정보가 새지 않도록 하세요. 없는 글과 권한 없는 글은 외부에 일관된 처리(예: 404)로 응답하세요. 공개 범위 변경은 D1에 즉시 반영되고, GitHub 재커밋/웹 재빌드가 필요 없어야 합니다.

비공개 응답은 `Cache-Control: private, no-store`로 처리하고 공용 CDN 캐시를 사용하지 마세요. 공개 콘텐츠 캐시를 도입한다면 공개→비공개 전환 시 즉시 무효화 또는 안전한 짧은 TTL을 보장하세요. 초기 구현은 안전성을 위해 동적 콘텐츠의 공용 캐시를 생략해도 됩니다. 공개했던 파일을 사용자가 이미 다운로드했다면 철회할 수 없다는 점도 문서화하세요.

## 6. Discord 로그인

Discord OAuth2 Authorization Code Grant 및 `identify` scope로 로그인합니다.

- OAuth state 검증, 가능하면 PKCE, 정확한 redirect URI 검증.
- Discord user ID를 환경변수 또는 DB의 멤버 허용 목록과 대조. 초기 두 멤버 등록 절차 제공.
- 서버 측 세션, HttpOnly/Secure/SameSite 쿠키, 세션 만료 및 로그아웃, CSRF 방어.
- Discord access token/client secret을 브라우저에 반환하거나 `localStorage`에 저장하지 않음.
- 로그인하지 않은 방문자의 공개 열람은 허용.
- 인증 실패·허용되지 않은 계정·세션 만료를 친절한 한국어 UI로 처리.

## 7. Discord 연동

상시 연결 Gateway 봇은 기본으로 구현하지 않습니다. **Discord HTTP Interactions**를 사용합니다.

필수:

1. `/archive` 명령: 제목, 내용, 공개 범위(기본 shared), 선택적 링크/첨부 정보를 받아 아카이브 생성 요청. 긴 입력이 슬래시 명령 옵션 제한에 걸리면 웹의 새 글 작성 링크 또는 Discord Modal로 자연스럽게 이어지도록 하세요.
2. `/archive-link` 또는 이에 상응하는 명령: 글 ID 또는 링크로 웹 아카이브 링크 반환.
3. Discord 상호작용 본문의 Ed25519 서명과 타임스탬프 검증, 재전송 방지/멱등성.
4. Discord의 초기 응답 시간 제한을 준수해 신속히 응답 또는 defer하고, 장기 GitHub 저장 완료는 후속 메시지/알림으로 전달.
5. Discord 사용자 ID를 웹의 허용 멤버 및 저장 권한과 연동.
6. 사용자가 권한이 없는 내용을 명령어로 조회하거나 공개하도록 허용하지 않음.

특정 과거 Discord 메시지의 본문/첨부를 자동으로 읽어오는 기능은 추가적인 봇 권한이나 Message Content Intent 등이 필요할 수 있습니다. 이를 기본 기능이 되는 것처럼 가정하지 마세요. 우선 **명령어에 입력된 사용자 제공 내용**을 저장하는 작동 가능한 MVP를 완성하고, 메시지 우클릭 컨텍스트 명령이나 특정 채널 자동 수집은 선택적 후속 확장으로 문서화하세요.

웹→Discord 알림은 서버 측 Webhook 또는 Bot REST API로 전송합니다. 기본 알림은 글 생성, 수정, 저장 성공/실패, 선택적 공개 범위 변경. Discord 알림 대상 채널에 비공개 제목·내용·파일명이 새지 않도록 **기본적으로 일반적인 안내와 로그인 후 확인 가능한 링크만** 전송하세요. 안전성이 확인된 비공개 전용 채널에서도 상세 알림은 명시적 설정에서만 활성화합니다. 중복·루프 알림을 막고 실패 시 전체 게시글 저장이 실패한 것으로 처리하지 마세요.

## 8. GitHub Actions 저장 파이프라인

웹/Discord 저장 요청 → 인증·검증 → D1에 `sync_jobs` 생성 → 필요 데이터는 private R2 staging에 업로드 → GitHub API로 private repo의 `repository_dispatch` 호출 → Action이 인증된 Workers 내부 API에서 작업 데이터 다운로드 → 검증·경로 생성·파일 기록 → commit/push → 인증된 완료 콜백 → D1 상태 갱신 → staging 정리 → Discord 알림 순서로 구현합니다.

- `repository_dispatch` 페이로드에는 `jobId`, `contentId`, `operation` 같은 식별자만 넣습니다. 이미지나 긴 본문을 직접 싣지 마세요.
- 최소 권한 GitHub App 설치 토큰 또는 fine-grained PAT를 서버 측 Secret으로 사용합니다. GitHub Actions 호출 권한과 private 저장소 쓰기 권한을 구분하고 필요한 경우를 README에 설명합니다.
- GitHub Action의 다운로드/완료 콜백은 별도 비밀값 또는 만료·범위 제한된 인증으로 보호하며, 단순 job ID를 안다고 다운로드할 수 없어야 합니다.
- Github Actions의 workflow `permissions`는 최소값으로 지정, workflow 실행 시 사용자 입력을 shell 코드로 삽입하지 않음.
- 작업 ID 멱등성, 동일 문서 동시 수정 충돌, Git push 충돌 재시도, 장애 및 rate limit 처리.
- 상태: `pending`, `processing`, `ready`, `failed`, `deleted` 등으로 정의. Git에 저장되기 전에 `ready`로 표시하지 않음. 작성자에게 진행/실패 상태와 재시도 버튼 제공.
- 완료 콜백에서 저장된 커밋 SHA, 콘텐츠 해시 등 검증 가능한 값을 기록. 중복 콜백에 안전하도록 구현.
- staging 파일은 성공 시 지우고, 실패·취소한 오래된 파일은 R2 lifecycle 또는 정기 정리 작업으로 처리.
- 삭제는 D1에서 즉시 접근 차단 후 GitHub 삭제 작업 요청. **Git 커밋 이력에 원본이 남을 수 있음**을 명시. 완전 삭제나 강한 기밀성이 필요하면 별도 스토리지/정책이 필요합니다.
- R2는 임시 저장이지만 현재 계정에 R2가 없으면 개발/테스트용 mock storage를 제공하고 실배포 시 R2를 요구하는 과정을 README에 작성.

## 9. 원본 읽기와 이미지 제공

웹에서 긴 글을 요청하면 Workers가 D1에서 권한을 확인한 후 GitHub Private Repository Contents API 또는 적절한 Git API로 원문을 가져옵니다. 브라우저에서 GitHub 토큰을 사용하거나 private repo raw 링크에 직접 접근하게 하지 마세요.

이미지도 `/api/attachments/:id/content` 등의 **보호된 프록시 엔드포인트**로 읽습니다. 글 및 첨부파일별 접근 검사를 매번 수행합니다. 안전한 MIME, 파일 크기, Content-Disposition, 필요한 경우 Content-Length/Range 등을 처리하세요. 이미지는 가능한 경우 브라우저에서 효율적으로 표시하도록 합니다. 공개 링크에 서명형 URL을 사용한다면 만료·권한 변경을 고려하세요.

Markdown은 안전하게 렌더링하고 XSS를 막습니다. 원격 이미지, HTML 삽입, 위험한 URL 스킴, 파일 업로드 MIME 위장 및 경로 탐색을 막으세요. 이미지의 EXIF 위치정보 등 민감 메타데이터 취급 정책을 명시하고 필요 시 업로드 시 제거하는 옵션을 제공하세요.

## 10. UI/UX 요구사항

모바일과 데스크톱에 대응하는 조용하고 읽기 좋은 아카이브 디자인. 한국어 기본, 접근성 고려, 라이트/다크 모드 가능. 다음 화면을 구현하세요.

1. 홈: 아카이브 소개, 최근 공개 글, 로그인 상태에 따른 내 자료 미리보기.
2. 목록: 검색, 태그/카테고리/작성자/기간/공개 범위 필터, 정렬, 페이지네이션.
3. 글 상세: Markdown, 이미지 갤러리, 첨부파일, 작성/수정일, 태그, 권한 표시.
4. 에디터: 제목, 본문 Markdown 편집/미리보기, 이미지 드래그 앤 드롭/선택 업로드, 태그·카테고리, 공개 범위 설정, 자동저장 여부 명확히 표시.
5. 내 자료: 내가 작성한 글, 비공개 글, 저장 중/실패한 작업.
6. 설정: 계정/Discord 연결 확인, 기본 공개 범위, Discord 알림 선호.
7. 관리: 멤버 허용 목록 및 작업 실패 현황(관리 권한 필요).
8. 로그인·권한 없음·404·500·로딩·빈 상태 UI.

작성 화면에서 게시글 공개 범위(`public/shared/private`)를 명시적으로 선택하게 하고, 첨부파일은 기본 `inherit`이되 개별 변경 가능해야 합니다. 변경 전/후 공개 범위를 명확히 보여주세요. `private` 상태에서는 작성자만 읽을 수 있다는 점을 안내하세요.

게시물 복잡도를 처음부터 과도하게 높이지 마세요. MVP에서 정말 동작하는 기능을 우선하고 가짜 데이터로 꾸민 데모를 프로덕션 기능처럼 두지 마세요.

## 11. API 설계

REST 또는 일관된 HTTP API를 설계하고 라우트·권한·요청/응답 타입을 문서화하세요. 최소 엔드포인트 예시:

```text
GET    /api/posts
POST   /api/posts
GET    /api/posts/:id
PATCH  /api/posts/:id
DELETE /api/posts/:id
PATCH  /api/posts/:id/visibility
POST   /api/posts/:id/attachments
GET    /api/attachments/:id/content
PATCH  /api/attachments/:id/visibility
GET    /api/jobs/:id
POST   /api/jobs/:id/retry
GET    /api/auth/discord/start
GET    /api/auth/discord/callback
POST   /api/auth/logout
GET    /api/me
POST   /api/discord/interactions
POST   /api/internal/github/job-complete
GET    /api/internal/github/jobs/:id/payload
```

위 경로는 예시이므로 일관성을 위해 조정해도 됩니다. 인증·권한·유효성 검사는 공용 유틸리티로 구현합니다. 사용자 입력 검증, 페이지네이션, 오류 코드, rate limiting, 업로드 제한, 상태 변경의 원자성을 고려하세요.

## 12. 보안 및 운영

필수 보안 점검:

- OAuth state/PKCE(가능한 경우), 세션 및 CSRF 보호.
- Discord Interactions 서명 검증. 서명 검증 실패 요청 거부.
- 최소 권한 GitHub credential, Cloudflare Secrets 사용.
- 모든 비공개 콘텐츠 API에서 서버 측 인가.
- D1 SQL 파라미터 바인딩, XSS 방어, 업로드 파일 검증, Content Security Policy.
- 공개 API에서 사적인 글 제목·존재 여부·파일명·내용 누설 방지.
- 무단 파일 다운로드/직접 GitHub 접근 불가.
- private 응답 캐시 금지, 공개 범위 변경 즉시 권한 반영.
- 개인정보 최소 수집 및 감사 로그의 민감정보 제외.
- `*.example` 파일 외에 비밀값/실제 개인자료를 Git에 커밋하지 않음.
- 외부 서비스 장애·무료 한도 초과·대용량 파일·중복 요청에 대한 안전한 처리.

무료 범위에 맞게 단순한 API 호출 수, GitHub Actions 빈도, D1 접근량을 유지하세요. 정확한 무료 한도는 수시로 달라질 수 있으므로 README에 **공식 가격/제한 문서 링크와 확인일**을 기록하고, 특정 한도가 영구적으로 보장된다고 표현하지 마세요.

## 13. 개발·테스트·배포 환경

- 로컬에서 프런트엔드와 API를 실행하는 명령 제공.
- Cloudflare D1 로컬 DB 생성/마이그레이션 방법 제공.
- R2 및 GitHub/Discord에 대한 테스트용 mock 또는 adapter 제공. 실제 Secret 없이 단위·통합 테스트 가능.
- `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck`, `npm test` 등 일관된 명령을 구현.
- 배포에 필요한 Cloudflare 설정 예시(`wrangler` 설정 파일 등)를 작성. 실제 환경의 ID는 placeholder로 둠.
- GitHub Actions workflow를 템플릿에서 복사해 사용할 수 있도록 구성.
- 필요한 GitHub/Discord/Cloudflare secret을 표로 정리하고 발급 경로·권한 범위·저장 위치를 설명.
- 앱 등록, Discord Interaction Endpoint 설정, OAuth Redirect 설정, Discord Webhook 설정, Cloudflare D1/R2 바인딩, Private Repo 생성, Action Secrets 설정까지 단계별 가이드 작성.
- CI에서 형식/타입/테스트/빌드 검사를 수행. 실계정 인증이 없어도 CI가 실패하지 않도록 함.

## 14. README.md 필수 목차

`archive-web/README.md`를 **처음 사용하는 개발자가 그대로 따라 하면 실행할 수 있는 한국어 문서**로 작성하세요. 반드시 다음 내용을 포함:

1. 프로젝트 소개 및 주요 기능.
2. 아키텍처 다이어그램(Mermaid 가능): Discord↔Workers↔D1/R2↔GitHub Actions↔Private Repo.
3. 공개/멤버/나만 보기의 정확한 의미와 제한.
4. 기술 스택, 저장소 분리 이유, 데이터 흐름.
5. 개발 환경 요구사항과 로컬 실행.
6. Discord Developer Portal 앱/봇/슬래시 명령/OAuth/Webhook 설정.
7. Cloudflare Pages/Functions/D1/R2 설정.
8. GitHub private 데이터 저장소 생성 및 `data-repo-template` 복사.
9. GitHub App 또는 최소 권한 fine-grained PAT, Actions Secret, Workers Secret 설정.
10. 환경변수 목록: 이름·용도·비밀 여부·설정 위치·예시 형식(실제 값 금지).
11. D1 마이그레이션·배포 방법.
12. 주요 API 목록과 권한 정책.
13. 자료 등록, 파일 저장, 실패 재시도, 공개 범위 변경 흐름.
14. 무료 한도, GitHub 50/100MiB 파일 제한, 저장소 용량 증가, 비용과 운영 유의사항.
15. 보안·백업·복구·삭제 한계·알려진 제약.
16. 테스트 실행 방법.
17. 문제 해결(Discord 서명/OAuth callback/GitHub dispatch/R2/D1/비공개 이미지 접근 등).
18. 향후 확장 아이디어(특정 채널 자동 수집, Gateway 봇, 공동 실시간 편집, 버전 복원).

`data-repo-template/README.md`에는 해당 저장소의 목적, 디렉터리 규칙, Action 실행 조건, secrets, 수동 복구 및 백업 방법을 작성합니다.

## 15. AGENTS.md 필수 규칙

`archive-web/AGENTS.md`를 실제 저장소 루트에 작성하고, Codex 또는 다른 AI 코딩 에이전트가 작업할 때 지켜야 할 지속적 규칙으로 정의하세요. 최소 포함:

- 프로젝트 목적과 구조 요약.
- 디렉터리 역할 및 책임 구분.
- TypeScript strict, 타입 안정성, import 및 이름 규칙.
- 공통 인증·인가 유틸리티 재사용 의무.
- 어떤 API도 client-side 조건만으로 비공개 콘텐츠를 보호하지 말 것.
- `private/shared/public`과 `inherit` 권한 결정 규칙 변경 시 테스트 동시 수정.
- 비밀정보·개인자료·토큰·실제 이미지 커밋 금지.
- D1 스키마 변경 시 마이그레이션과 관련 테스트 작성.
- GitHub/Discord/Cloudflare API를 변경할 때 실제 공식 문서 확인.
- GitHub Actions 트리거·완료 콜백·멱등성·작업 상태 전이를 훼손하지 말 것.
- 공개/비공개 자료 노출 여부를 테스트할 것.
- 불필요한 의존성 및 상시 실행 서버 추가 금지.
- UI 변경 시 모바일·접근성·한국어 문구 확인.
- 변경 전 관련 코드 확인, 변경 후 lint/typecheck/test/build 실행.
- README와 환경변수 문서를 구현과 동기화.
- 기능 완성 여부, 검증 명령, 남은 수동 설정을 최종 보고.

`data-repo-template/AGENTS.md`에도 파일 경로·원본 데이터의 기밀성·workflow 최소 권한·사용자 입력 안전 처리·버전 관리·삭제 주의사항을 명시하세요.

AGENTS.md는 일반 사용자용 설치 문서와 구분하여 **에이전트의 실제 작업 규칙**이 되도록 구체적으로 작성합니다. 다른 곳에 더 세부적인 AGENTS.md가 필요한 경우에만 추가하세요.

## 16. 구현 우선순위

의존성에 맞춰 작업을 진행하세요.

**1단계: 프로젝트 기반**
- 디렉터리 구성, 프런트엔드, Cloudflare Functions, D1 스키마, 설정 예시, 개발 명령.

**2단계: 인증/인가**
- Discord OAuth2, 서버 세션, 멤버 허용 목록, 공개 범위별 API 제한 및 테스트.

**3단계: 아카이브 웹 MVP**
- 목록·상세·검색·에디터·Markdown 렌더링·태그·카테고리·자료별 권한 설정.

**4단계: GitHub 원본 저장**
- R2 staging, Action dispatch, private repo template, 작업 상태/콜백/재시도, 파일 프록시.

**5단계: Discord 양방향 연동**
- HTTP Interactions 명령어, 서명 검증, 알림 Webhook, 멱등성 및 알림 노출 방지.

**6단계: 품질/문서**
- 검증 테스트, 모바일 UI, 실패 처리, README, AGENTS.md, CI, 배포 가이드.

각 단계마다 타입 검사와 테스트를 수행하세요. 특정 외부 연동을 실행할 자격 증명이 없으면 mock 기반으로 검증하고, 어떤 실환경 검증이 남았는지 정확히 기록하세요.

## 17. 필수 인수 테스트

최소 아래 시나리오를 자동화하거나 검증 가능한 재현 절차로 제공하세요.

1. 비로그인 방문자는 `public` 글만 목록과 상세에서 열람할 수 있다.
2. 멤버 A는 `shared` 글을 읽을 수 있고 비멤버는 읽을 수 없다.
3. 멤버 A의 `private` 글은 멤버 B 및 비멤버가 목록·검색·직접 URL·첨부 API로 접근할 수 없다.
4. `public` 글에 `private` 이미지를 넣으면 글은 보이되 이미지는 작성자에게만 보인다.
5. 상위 `private` 글의 파일을 `public`으로 지정해도 외부에 노출되지 않는다.
6. 글을 `public`에서 `private`으로 바꾸면 정적 웹 재배포 없이 즉시 차단된다.
7. 브라우저 소스와 네트워크 응답에 GitHub Secret 및 실제 private repo 인증 토큰이 노출되지 않는다.
8. 짧은 글이 D1에 저장되고 조회된다.
9. 긴 글/이미지 저장은 job 상태를 거쳐 Action 성공 후 `ready`가 된다.
10. 실패한 Action은 `failed`가 되고, 재시도해도 중복 저장되지 않는다.
11. 잘못된 Discord 서명, 허용되지 않은 Discord 사용자, 위조 콜백이 거부된다.
12. Discord `/archive`로 생성한 글을 웹에서 찾을 수 있다(실계정 미연동 시 mock 테스트).
13. 웹 게시글 저장 알림이 Discord로 전송되며 비공개 콘텐츠 원문이 알림에 새지 않는다.
14. 업로드 MIME/크기/경로, Markdown XSS, CSRF, 권한 없는 수정이 차단된다.
15. 모바일에서 글 작성·읽기·공개 범위 변경이 정상 작동한다.

## 18. 완료 기준과 최종 보고 형식

작업을 시작할 때 저장소를 조사하고, 그 결과에 따라 필요한 구현 순서를 정하세요. 가능한 범위 내에서 실제 파일을 모두 생성·수정하고 끝까지 검증하세요. 설계 문서만 제출하지 마세요.

완료 시 아래 내용을 간결하게 보고하세요.

1. **구현된 기능**과 아직 구현되지 않은 기능을 구분.
2. 주요 디렉터리 트리와 핵심 파일 설명.
3. 로컬 실행·테스트 명령어.
4. 성공/실패한 검증 결과(명령어 포함).
5. 배포 전에 사용자가 직접 설정해야 할 Discord/Cloudflare/GitHub 항목.
6. 보안상 한계와 비용/용량 관련 주의사항.
7. 다음에 진행하면 좋은 작업 우선순위.

**최우선 성공 조건:** 두 명의 승인된 사용자가 Discord로 로그인하고, 웹에서 공개·공동·개인 자료를 구분하여 관리하며, 긴 글과 이미지의 원본을 GitHub Private Repository에 자동 저장하고, Discord에서 명령어로 아카이브를 등록하거나 웹의 변경 알림을 받는 구조가 실제 코드·테스트·문서로 일관되게 구현되어야 합니다.

지금 저장소 분석부터 시작해 구현하세요.

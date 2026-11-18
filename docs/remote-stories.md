# 배포 사이트의 이야기 저장

## 구현 상태

2026-11-18 목록 최적화: 기존 글의 `index.json`을 비공개 저장소에 생성하고 Worker 버전 `7fe10b35-a42f-4b49-9881-3345ed109d50`를 배포했습니다. 초기 생성 커밋은 index만 변경하며 원문은 유지했습니다. 현재 archive 94,122바이트 대비 index 498바이트이고, 운영 목록 API의 200 응답·본문/암호 해시/작성자 ID 미포함·`private, no-store`를 명령줄로 확인했습니다. 전체 테스트 115개·타입 검사·린트·앱 빌드·Worker 번들 검사가 통과했습니다. 실제 관리자 저장은 mock으로 검증했으며 실계정 저장과 화면 체감 속도는 사용자 확인이 필요합니다. 아래의 이전 배포 기록 중 Worker 미배포 안내는 이 버전 배포로 대체됩니다.

2026-11-18: 비밀번호 길이 제한을 제거한 이야기 Worker를 운영에 배포했습니다(버전 `598b8a67-c802-417f-9f4b-686cfd4694db`). Pages 워크플로의 Worker dry-run은 실제 서버 배포를 수행하지 않습니다. 짧은 비밀번호·128자를 넘는 비밀번호의 저장 및 정확한 암호 검증은 mock 테스트로 확인했으며, 실계정 글 저장은 사용자 확인이 필요합니다.

작성 날짜(`writtenOn`, YYYY-MM-DD)를 설정하는 코드를 추가했습니다. 목록과 본문에 이 날짜를 표시하고 최근 작성일 순으로 정렬하며, 같은 날에는 최초 저장 시각 순서를 사용합니다. 날짜가 없는 기존 글은 최초 저장 시각의 한국 날짜를 사용하고, 수정 시각은 정렬에 사용하지 않습니다. 날짜 입력은 클라이언트와 서버 모두에서 실제 달력 날짜인지 검사합니다. 편집 화면은 작성·미리보기를 항상 함께 표시하며, 목록 로딩 원과 순차 등장 효과는 동작 줄이기 설정을 따릅니다. 이 변경은 명령줄 검사와 mock 저장 테스트로 확인했으며, **이번 변경의 앱·Worker 배포와 실제 화면 확인은 아직 수행하지 않았습니다.** 원격 날짜 저장을 사용하려면 앱과 Worker를 함께 업데이트해야 합니다.

GitHub Pages에서 Firebase 관리자로 로그인한 뒤 이야기의 **저장**을 누르면 Cloudflare Worker가 `team-kirari/kirari-private`의 `main` 브랜치에 본문 `web-stories/archive.json`과 목록 `web-stories/index.json`을 Git Database API로 한 커밋에 함께 저장합니다. 별도 수동 commit·push나 이야기별 Pages 재배포는 필요하지 않습니다. 목록은 index만, 본문·비밀번호 열람·수정은 archive를 읽습니다. GitHub 쓰기 성공 응답 후에만 저장 완료를 표시합니다.

코드·mock 테스트·Worker 번들 검사를 완료하고 **`https://kirari-stories.papercloud.workers.dev`에 Worker를 배포했습니다.** 현재 사이트의 Firebase 웹 API key와 프로젝트 ID도 서버 변수로 연결했습니다. **GitHub 쓰기 Secret 등록도 완료했습니다.** 토큰의 대상 private 저장소 접근과 Worker의 Secret 이름 등록을 확인했으며 임시 토큰 파일은 삭제했습니다. 앱의 공개 API URL 변수를 연결하고 앱 코드 `2de7c72`를 main에 반영했습니다. [GitHub Pages 실행](https://github.com/team-kirari/kirari/actions/runs/44231507886)의 검사·빌드·배포 성공과 사이트 HTTP 200, 배포된 JavaScript의 원격 API 주소를 명령줄로 확인했습니다. **실제 관리자 로그인·글 저장과 화면 확인은 아직 사용자 확인이 필요합니다.** 실제 쓰기 권한의 동작은 아직 시험하지 않았습니다.

기존 로컬 `stories/`와 운영 `web-stories/`를 분리했습니다. 로컬 개인 글을 자동 업로드하거나 공개하지 않습니다. `VITE_STORY_API_URL`이 없으면 개발 서버는 기존 로컬 작성 흐름을 사용하고 Pages는 서버 연결 안내를 표시합니다.

## 목록 전용 파일

목록 파일은 같은 비공개 저장소에만 저장합니다. 제목·작가명(잠금 글은 빈 문자열)·작성/수정 날짜·잠금 여부·ID와 서버의 수정 권한 확인용 작성자 ID만 포함합니다. 본문·비밀번호·암호 해시는 포함하지 않고, 작성자 ID는 API 응답에서 제외합니다. Pages 번들·브라우저 영구 저장소·공용 캐시는 사용하지 않습니다. 응답의 `private, no-store`도 유지합니다.

기존 글은 다음 명령으로 원문 변경 없이 목록 파일을 한 번 생성할 수 있습니다. 기존 private checkout의 Git 인증을 그대로 사용하고 자격증명을 추출하지 않습니다. 해당 저장소의 Contents 읽기·쓰기 권한이 필요합니다. 개인자료는 콘솔이나 앱 저장소에 출력/저장하지 않으며, checkout의 작업 파일·브랜치·스테이징도 변경하지 않습니다.

```powershell
node --experimental-strip-types scripts/rebuild-story-index.mjs ../kirari-private --write
```

목록 파일이 없을 때만 기존 archive를 읽는 호환 경로를 사용합니다. 첫 글 저장 때도 목록 파일이 생성됩니다. 손상된 목록은 본문으로 우회하지 않고 오류로 처리합니다. GitHub에서 archive를 직접 수정했다면 위 명령으로 목록도 재생성해야 합니다. Worker의 저장 API는 두 파일을 같은 커밋에 갱신하고, 동시 커밋은 강제 덮어쓰기 없이 거부합니다. 저장 응답이 유실되어도 기존 mutation ID로 재시도하면 중복 저장을 피합니다.

목록 조회는 GitHub 요청 한 번으로 유지하면서 본문 전송·디코딩을 생략합니다. GitHub API 지연과 관리자 인증 시간은 남습니다. 실제 체감 속도는 사용자 확인이 필요합니다.

## 한 번만 연결하기

1. GitHub에서 fine-grained PAT를 만들고 대상 저장소를 **`team-kirari/kirari-private` 하나**, 권한은 **Contents: read and write**로 제한합니다. 조직 승인이 필요하면 먼저 승인합니다. 토큰은 채팅, 앱 소스, `VITE_*`, GitHub Pages 변수에 넣지 않습니다. 기존 로컬 Git 인증정보를 복사하지 않습니다.
2. 현재 계정에는 Worker, Firebase 서버 변수와 **`STORY_GITHUB_WRITE_TOKEN` 등록을 완료했습니다.** 다음 명령은 다른 계정에 처음 연결하거나 Secret을 교체할 때 사용합니다. Secret 입력 프롬프트에서 값을 입력합니다. Firebase 항목은 현재 사이트와 **동일한 프로젝트**의 웹 API key와 project ID를 사용합니다. 서비스 계정 키는 필요하지 않습니다.

   ```powershell
   npx wrangler deploy --config worker/stories.wrangler.jsonc
   npx wrangler secret put STORY_GITHUB_WRITE_TOKEN --config worker/stories.wrangler.jsonc
   npx wrangler secret put FIREBASE_API_KEY --config worker/stories.wrangler.jsonc
   npx wrangler secret put FIREBASE_PROJECT_ID --config worker/stories.wrangler.jsonc
   ```

3. 앱 저장소의 Actions **Variable**에 `VITE_STORY_API_URL=https://kirari-stories.papercloud.workers.dev/stories`를 등록합니다. 토큰은 이 Variable에 넣지 않습니다. 사용자로부터 변수 등록 완료를 전달받았습니다. 로컬 개발에서 같은 API를 쓰는 방법은 다음 절을 참고하세요.
4. 앱 변경을 검토·커밋·push하여 Pages를 배포합니다. 기존 Firebase 인증, Firestore의 `admins/{uid}` 규칙·활성 관리자 설정, 사진 빌드용 Secret도 정상이어야 합니다. 별도 Firebase Functions/Blaze는 필요하지 않습니다.

기본 허용 Origin은 `https://team-kirari.github.io`입니다. Worker 서버 변수 `STORY_LOCAL_ORIGIN`을 설정한 경우 `http://127.0.0.1:5173` 또는 `http://localhost:5173` 중 정확히 한 주소만 추가 허용합니다. 로컬 Origin에서도 같은 Firebase 관리자·작성자 권한 검사를 수행합니다. 다른 도메인·포트·와일드카드는 허용하지 않습니다. 무료 한도와 PBKDF2 CPU 비용은 Cloudflare 정책을 따릅니다. 무제한 무료 동작을 보장하지 않습니다.

## 로컬 페이지에서도 원격 저장하기

이 기기에서는 `.env.local`에 다음 공개 API 주소를 설정합니다. 기존 Firebase 설정은 유지합니다.

```dotenv
VITE_STORY_API_URL=https://kirari-stories.papercloud.workers.dev/stories
```

Worker에도 `STORY_LOCAL_ORIGIN=http://127.0.0.1:5173`을 서버 변수로 설정해야 합니다. 이 기기의 `.env.local`과 현재 Worker에는 이미 설정하고 배포했습니다. 로컬·운영 Origin의 preflight 204, 미허용 Origin의 403, 로컬 Origin 목록 API의 200을 명령줄로 확인했습니다. `.env.local`만 바꾸면 Worker의 CORS 검사를 통과하지 못합니다. 서버 변수를 변경해 배포할 때 기존 Firebase 변수와 GitHub Secret을 유지합니다.

개발 서버를 종료 후 **`npm run dev`**로 다시 실행하고 **`http://127.0.0.1:5173/kirari/`**로 접속합니다. 개발 서버는 기본적으로 `127.0.0.1:5173`을 사용하며 해당 포트가 사용 중이면 다른 포트로 자동 변경하지 않고 종료합니다. 이 모드에서는 목록·작성·저장이 운영 GitHub 저장소를 사용하므로 공개 승인된 글만 작성합니다. 로컬 모드로 돌아가려면 `.env.local`의 `VITE_STORY_API_URL` 줄을 제거하고 서버를 재시작합니다.

Google 로그인에서 `auth/unauthorized-domain` 오류가 나면 Firebase Console → Authentication → Settings → Authorized domains에 `127.0.0.1`을 등록합니다. 프로토콜과 포트는 입력하지 않습니다. 실제 로그인·저장은 사용자가 브라우저에서 확인합니다.

## 공개·비밀번호·작성자

- 비밀번호가 없는 글은 누구나 목록·본문을 읽습니다. 저장 안내에서 공개 범위를 설명하며 실제 공개할 글만 저장합니다.
- 비밀번호가 있는 글은 목록에서 제목은 보여 주고 작가명은 숨기며 서버에서 확인한 뒤 본문을 반환합니다. 한글을 포함한 글자 수 제한이 없으며 무작위 salt와 PBKDF2-SHA256 100,000회로 저장합니다. 원문 비밀번호·해시는 응답에 포함하지 않습니다. 브라우저 영구 저장소에 글·비밀번호를 저장하지 않습니다.
- 작성·수정 요청마다 Firebase의 계정 조회와 해당 프로젝트 Firestore 규칙을 통해 활성 Google 관리자를 확인합니다. 수정·편집용 비밀번호 우회는 저장된 작성자 UID가 일치할 때만 허용합니다. 다른 관리자는 수정하거나 보호 글을 우회 열람할 수 없습니다.
- 저장소 관리자는 원문과 해시에 접근할 수 있습니다. 암호화 저장이나 작성자만 볼 수 있는 `private` 자료 기능은 아닙니다. `shared/private` 선택, 검색·첨부·삭제 API는 제공하지 않습니다.
- 글 본문의 100,000자 제한은 제거했습니다. 요청 본문 500KB와 전체 저장 **100개·UTF-8 JSON 900KB**의 용량 제한은 유지합니다. 초과하면 저장을 거부하고 입력 내용은 유지합니다. 규모 확장에는 인덱스·글 분리와 원자적 커밋 설계가 필요합니다.
- 같은 main 커밋에서 읽은 archive와 tree를 바탕으로 저장하고, 강제 갱신 없는 fast-forward로 동시 저장 덮어쓰기를 방지합니다. 글 revision으로 오래된 수정을 거부합니다. 저장 응답 유실 시 같은 편집 내용으로 재시도하면 같은 mutation ID를 사용해 중복 커밋을 피합니다. 탭 종료 뒤까지 재시도 ID를 보존하지는 않습니다.
- IP별 요청 제한은 Cloudflare 위치별로 적용되며 전 세계 공통 제한이 아닙니다. 인증 토큰·본문을 로그에 기록하지 않습니다. GitHub 토큰 만료·브랜치 보호·외부 API 장애·한도 초과는 저장 오류로 표시합니다.
- 수정 전 원문은 private Git 이력에 남을 수 있습니다. 저장소나 사이트에서 삭제하더라도 이미 배포·다운로드된 사본을 회수할 수는 없습니다.

## 사용자 화면 확인

에이전트는 브라우저를 열어 검증하지 않습니다. 연결 후 공개해도 되는 합성 글로 다음을 확인합니다.

1. 관리자로 로그인 → 새 글 → 저장: ‘GitHub 원격 저장소에 저장했어요’가 표시되고 private 저장소에 커밋이 생겨야 합니다. 다른 브라우저에서 새로고침하면 보여야 합니다.
2. 비로그인·일반 회원은 작성할 수 없어야 합니다. 관리자 B는 A의 수정 버튼이 보이지 않고 직접 편집 요청도 거부되어야 합니다.
3. 비밀번호 글은 제목은 보이고 작가명은 숨겨지며 틀린 암호로 열리지 않아야 합니다. 올바른 암호는 한글도 동작해야 합니다.
4. 다른 탭에서 같은 글을 수정하면 오래된 편집의 저장은 충돌로 거부되어야 합니다. 연결 차단이나 토큰 만료 시 완료로 표시되지 않고 입력이 유지되어야 합니다.

공식 근거: [GitHub Contents API](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents), [Firebase 계정 조회](https://firebase.google.com/docs/reference/rest/auth#section-get-account-info), [Firestore REST의 Firebase ID 토큰·규칙](https://firebase.google.com/docs/firestore/use-rest-api), [Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/). 확인일: 2026-11-18.

빈 비밀번호는 설정할 수 없으며, 요청 전체 용량 제한은 유지합니다.

# 비공개 원본 저장소와 마스터키 업로드

## 구현·운영 상태 (2026-11-14)

- `team-kirari/kirari-private` 비공개 저장소를 생성하고 기존 사진 55장을 `assets/`에 복사·push했습니다. 기존 파일명과 프로필 선택값을 유지합니다.
- 비공개 원격 커밋과 파일 내용이 같은지 확인한 뒤 앱 저장소의 사진 55장을 작업 폴더와 Git 인덱스에서 제거했습니다. 사진 외 기존 staged 변경은 유지했으며 기존 Git 이력은 정리하지 않았습니다.
- 갤러리의 사진 등록 창, Cloudflare Worker, 이미지 검증·배포 워크플로는 구현했습니다. 이 앱 저장소 변경은 아직 커밋·배포하지 않았습니다.
- Worker 운영 배포·Secret 등록·저장소 간 자동 배포 연결·실제 브라우저 업로드는 아직 완료하지 않았습니다. 키나 토큰을 소스에 넣지 않았습니다.
- Firebase Functions와 Blaze 결제 연결은 사용하지 않습니다. Cloudflare Workers Free와 기존 GitHub Actions 사용량 안에서 운용하는 구성입니다. 무료 한도·CPU 제한·private 저장소 Actions 사용량 제한은 각 서비스 정책을 따르며 무제한 무료를 보장하지 않습니다. 유료 전환은 별도 선택입니다.

## 처리 흐름과 공개 범위

`사진 + 마스터키 → Worker → kirari-private/staging → private Actions 전체 디코딩·메타데이터 제거 → assets → public 저장소 repository_dispatch → Pages 빌드`

사진 열람은 누구나 가능합니다. 마스터키는 공개 사진 등록만 허용하며 Firebase 관리자 로그인과 별개입니다. 기존 파일 수정·삭제나 비공개 사진 열람 기능은 제공하지 않습니다. 등록할 때마다 키를 입력하고 브라우저 영구 저장소에는 보관하지 않습니다. 비밀번호 관리 프로그램의 저장 동작은 사이트가 통제할 수 없습니다.

Worker는 Secret으로 키를 검증하고 Origin·요청 속도·실제 이미지 헤더·MIME·크기·등록 위치를 검사합니다. 5MB를 초과하는 스트림은 중단하며 UUID 대신 내용 SHA-256으로 정해진 staging 경로를 사용합니다. 같은 파일이 대기 중이면 중복 저장하지 않습니다. Rate Limiting binding은 Cloudflare 위치별 제한이므로 정확한 전 세계 공통 할당량은 아닙니다. 사용자 IP는 키 기반 해시로만 limiter에 전달합니다.

Worker의 202 응답은 **검증 대기 접수**입니다. Actions에서 Sharp로 전체 디코딩하고 정지 PNG/JPEG/WebP/GIF인지, 4096px·1600만 픽셀·5MB 이내인지 다시 확인합니다. 다중 프레임 이미지는 거부합니다. 새 업로드는 EXIF/GPS 등 입력 메타데이터를 제거한 WebP로만 공개 `assets/`에 들어갑니다. 잘못된 파일은 staging에서 제거하며 배포하지 않습니다. 워크플로 실패·무료 한도 초과 시 대기 상태가 남을 수 있으므로 private 저장소 Actions에서 재실행합니다.

기존 55장은 이전에 공개를 승인한 파일을 그대로 복사했습니다. 기존 원본의 메타데이터 제거는 하지 않았습니다. staging의 원본·거부 파일은 삭제 커밋 후에도 private Git 이력에 남을 수 있습니다. 공개 철회나 Git 삭제로 기존 사본·배포 이력·다운로드 사본을 회수할 수는 없습니다. private 저장소 관리자에게 원본이 보입니다.

## 필요한 Secret과 변수

서로 다른 용도의 GitHub fine-grained PAT를 발급하고 대상 저장소를 하나씩 제한합니다. 조직 승인이 필요하면 승인 후 사용합니다. 기존 로컬 Git 인증 토큰을 서버에 복사하지 않습니다. 값은 채팅·코드·`.env.example`에 넣지 말고 각 서비스의 Secret 입력창으로 등록합니다.

| 위치 | 이름 | 최소 범위 |
| --- | --- | --- |
| Cloudflare Worker Secret | `PHOTO_UPLOAD_MASTER_KEY` | 무작위 32~200자 키, 업로드하는 사람이 보관 |
| Cloudflare Worker Secret | `PHOTO_GITHUB_WRITE_TOKEN` | `kirari-private`만, Contents read/write |
| `kirari` Actions Secret | `PRIVATE_ASSETS_READ_TOKEN` | `kirari-private`만, Contents read |
| `kirari-private` Actions Secret | `PUBLIC_SITE_DISPATCH_TOKEN` | `kirari`만, Contents read/write (repository_dispatch) |
| `kirari` Actions Variable | `VITE_PHOTO_UPLOAD_URL` | 배포된 Worker HTTPS URL, 공개 값 |
| `kirari-private` Actions Variable | `PHOTO_PIPELINE_ENABLED` | 앱 코드 반영·Secret 연결 완료 후 `true` |

private 저장소의 기본 `GITHUB_TOKEN`은 해당 저장소의 검증 결과 커밋에만 사용합니다. 저장소 간 호출·사진 저장에는 위의 제한된 토큰을 사용합니다. 배포 빌드는 `.local/kirari-private`에 원본 저장소를 checkout하며 토큰 누락·접근 실패 시 중단합니다. 앱은 이 checkout의 `assets/` 안에 있는 허용된 사진만 사용합니다. PR 검증에는 private 저장소 checkout이나 Secret 전달을 하지 않고 생성한 1px 테스트 이미지 6장으로 빌드합니다. PR 빌드는 Pages에 배포하지 않습니다. Pages artifact에는 `dist/`만 업로드하며 staging·private `.git`·원본 저장소 전체를 복사하지 않습니다.

### checkout에서 `Input required and not supplied: token`이 발생할 때

사진 원본 checkout에 전달하는 `PRIVATE_ASSETS_READ_TOKEN`이 비어 있는지 확인합니다. `team-kirari/kirari`의 **Settings → Secrets and variables → Actions → Repository secrets → New repository secret**에서 이 이름으로 등록합니다. Variables나 `kirari-private` 저장소에만 등록하면 앱 빌드에서 사용할 수 없습니다. Environment secret으로 등록했다면 현재 `build` 작업은 environment를 지정하지 않으므로 repository secret으로 등록합니다.

값은 위 표의 `kirari-private` 전용 Contents read 권한을 가진 fine-grained PAT이며, 조직 승인이 필요하면 먼저 승인해야 합니다. 토큰을 코드나 채팅에 붙여 넣지 않습니다. 등록 후 실패한 Actions 실행에서 **Re-run failed jobs**를 실행합니다. 워크플로는 토큰 존재 여부만 사전 검사하며, 만료·권한·조직 승인 여부는 실제 checkout으로 확인합니다.

## 운영 연결 순서

1. 이 앱 변경을 검토해 `kirari/main`에 반영합니다. 기존 staged 변경과 구분해 커밋 범위를 결정하세요. private workflow가 참조하는 `photo-pipeline/`이 먼저 main에 있어야 합니다.
2. 위 GitHub Secret을 등록합니다. private workflow는 `config/private-photos/publish.yml`과 동일하게 유지하고 `staging/.gitkeep`을 둡니다. 수동 변경한 `assets/`의 파일은 공개 승인한 자료로 취급합니다.
3. Cloudflare 계정의 Workers **Free** 플랜에서 Worker를 배포합니다. 결제 플랜을 변경하지 않습니다. CLI는 프로젝트의 고정 버전 Wrangler를 사용합니다.

```powershell
$env:WRANGLER_SEND_METRICS = 'false'
$env:WRANGLER_LOG_PATH = '.local/wrangler.log'
npx wrangler deploy --config worker/wrangler.jsonc
npx wrangler secret put PHOTO_UPLOAD_MASTER_KEY --config worker/wrangler.jsonc
npx wrangler secret put PHOTO_GITHUB_WRITE_TOKEN --config worker/wrangler.jsonc
```

Secret 명령은 대화형 프롬프트에서 값을 입력합니다. 키를 명령 인자로 쓰면 셸 이력에 남을 수 있습니다. 마스터키 교체 후에는 기존 키가 더 이상 등록할 수 없는지 확인합니다.

4. 표시된 `https://kirari-photo-upload.<계정>.workers.dev`를 공개 변수 `VITE_PHOTO_UPLOAD_URL`에 등록합니다. 허용 Origin은 `https://team-kirari.github.io` 하나이며 custom domain을 쓰면 Worker와 클라이언트 URL 허용 조건을 함께 검토합니다.
5. private 저장소의 `PHOTO_PIPELINE_ENABLED`를 `true`로 설정한 후 **Publish photos to Kirari**를 수동 실행합니다. public Pages 성공까지 확인합니다. 누락 토큰을 숨기고 기존 사진으로 성공한 것으로 처리하지 않습니다.
6. 실제 사이트에서 작은 공개용 시험 사진과 잘못된 키를 사용해 확인합니다. 정상 키는 ‘검증 대기’로 접수되고 Actions·Pages가 차례로 성공한 후 새로고침 시 보입니다. 잘못된 키는 401로 거부되고 저장소에 파일이 생기지 않아야 합니다. 프로필 대상 사진은 배포 후 관리자가 등장 후보로 선택해야 합니다.

기존 앱 사진은 제거했고 `.local/`은 Git 추적에서 제외합니다. 현재 기기에서는 이전 작업에 사용한 비공개 저장소 checkout을 그대로 사용합니다. 다른 개발 환경에서는 아래 clone이 필요합니다. 이 작업만으로 기존 공개 Git 이력에서 사진이 사라지는 것은 아닙니다.

## 로컬 검증

```powershell
# 새 개발 환경에서 한 번 실행 (기존 checkout이 있으면 생략)
git clone https://github.com/team-kirari/kirari-private.git .local/kirari-private
npm ci
Push-Location photo-pipeline
npm ci --ignore-scripts
npm test
Pop-Location
npm run lint
npm run typecheck
npm test
npm run build
npx wrangler deploy --dry-run --config worker/wrangler.jsonc --outdir .local/worker-bundle
```

사진 갱신은 `git -C .local/kirari-private pull --ff-only`로 받습니다. 사진을 `src/assets/`로 다시 복사하지 않습니다. 비공개 저장소 접근이 없는 코드 검사용 환경에서는 `node --experimental-strip-types scripts/prepare-photo-fixtures.mjs`로 빈 checkout 대신 합성 이미지를 생성할 수 있습니다. 이 명령은 기존 private checkout이 있으면 실패하며 덮어쓰지 않습니다. 합성 이미지 빌드는 화면·실제 사진 검증용이 아닙니다.

공식 참고: [Workers Free 한도](https://developers.cloudflare.com/workers/platform/pricing/), [Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [GitHub 저장소 dispatch API](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event), [Sharp 디코딩 제한](https://sharp.pixelplumbing.com/api-constructor/).

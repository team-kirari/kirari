# 비공개 사진 저장소와 업로드

## 현재 상태 (2026-11-18)

- 원본 저장소는 `team-kirari/kirari-private`이며 비공개입니다. 공개 승인된 `assets/` 사진을 Pages 빌드에 사용합니다.
- 사진 API를 기존 이야기 Worker의 `https://kirari-stories.papercloud.workers.dev/photos`에 배포했습니다. 기존 서버 전용 `STORY_GITHUB_WRITE_TOKEN`과 Firebase 설정을 사용하며 로컬 Git 인증정보를 서버에 복사하지 않았습니다.
- GitHub Actions의 `VITE_PHOTO_UPLOAD_URL`과 로컬 개발 환경에 위 URL을 연결했습니다. 운영 프런트엔드는 소스 반영·Pages 재빌드가 필요합니다.
- 마스터키 입력과 서버 마스터키 검사를 제거했습니다. Google 로그인과 활성 `admins/{uid}.enabled`를 서버에서 확인합니다. 일반 로그인 계정에는 업로드를 허용하지 않습니다.
- 저작권자 이름을 사진과 함께 private 저장소에 원자적으로 접수합니다. 검증 후 이름만 별도 JSON으로 공개하며 갤러리에서는 `ⓒ 이름 님`으로 표시합니다. 기존 사진의 EXIF를 저작권자 정보로 자동 사용하지 않습니다.
- **자동 검증·재배포는 아직 미연결입니다.** private 저장소에 `PUBLIC_SITE_DISPATCH_TOKEN` Secret과 `PHOTO_PIPELINE_ENABLED=true` Variable이 없습니다. 변경한 `photo-pipeline/process-staged.mjs`가 public 저장소 `main`에 반영되기 전에는 새 JSON 접수 형식을 처리할 수 없습니다. 준비가 끝나기 전에 파이프라인을 켜지 않습니다.

## 처리 흐름과 공개 범위

`사진 + 저작권자 + 관리자 ID token → Worker /photos → private staging/{target}/{sha256}.json → private Actions 검증 → assets/{target}/{sha256}.webp + .json → Pages 재빌드`

로그인 토큰은 전송할 때만 사용하고 사진 파일·메타데이터·로그에 저장하지 않습니다. Worker는 Firebase 계정 확인 API와 해당 ID token으로 Firestore의 자기 관리자 문서를 조회합니다. Firestore 규칙이 프로젝트·현재 Google 로그인 공급자·자기 문서 접근을 검사합니다. Origin은 Pages 주소와 서버에 명시적으로 설정한 `http://127.0.0.1:5173`만 허용합니다.

요청은 5MB 이하 PNG/JPEG/WebP/GIF의 실제 헤더·MIME·크기를 검사하고, private Actions가 전체 디코딩·4096px·1600만 픽셀·정지 이미지 여부를 다시 검사합니다. 메타데이터를 제거한 WebP와 120자 이하 저작권자만 공개합니다. 저작권자 표시는 이미지 메타데이터에 삽입하는 워터마크가 아닙니다.

202는 **검증 대기 접수**이며 사이트 반영 완료가 아닙니다. 서버 GitHub 쓰기 권한과 실제 관리자 업로드는 실계정으로 아직 확인하지 않았습니다. API 주소 연결만으로 자동 배포가 완료됐다고 간주하지 않습니다.

기존 파일 수정·삭제나 private 원본 열람은 제공하지 않습니다. 원본·거부 파일은 삭제 후에도 private Git 이력에 남을 수 있고, 공개된 사본·다운로드는 회수할 수 없습니다. 저장소 관리자에게 원본이 보입니다.

## 자동 배포 연결에 남은 작업

1. 검토한 앱·Worker·사진 파이프라인 변경을 public 저장소 `main`에 반영합니다. 기존 미커밋 변경을 임의로 포함하지 않습니다.
2. `team-kirari/kirari` 저장소만 Contents read/write 권한을 갖는 별도 fine-grained PAT를 발급합니다. private 저장소의 Settings → Secrets and variables → Actions에 `PUBLIC_SITE_DISPATCH_TOKEN`으로 등록합니다. 토큰을 채팅이나 코드에 넣거나 로컬 Git 인증을 복사하지 않습니다.
3. private 저장소의 `.github/workflows/publish.yml`이 `config/private-photos/publish.yml`과 같은지 확인하고 `PHOTO_PIPELINE_ENABLED` Variable을 `true`로 설정합니다.
4. 공개용 시험 사진으로 관리자 접수 → private Actions 이미지 검증 → Pages 재빌드 → 새로고침 후 표시와 저작권자를 확인합니다.

기존 public 저장소의 `PRIVATE_ASSETS_READ_TOKEN` Secret은 private 원본 checkout용으로 유지합니다. 별도의 사진 Worker를 쓰는 구성에는 `PHOTO_GITHUB_WRITE_TOKEN`, `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`가 필요하지만 현재 운영에서는 기존 이야기 Worker의 서버 바인딩을 사용합니다. 브라우저에는 GitHub 토큰을 반환하지 않습니다.

## 검증

- 업로드·권한 모의 테스트: 게스트, 일반 멤버 A/B, 관리자 A/B, 미검증·비활성·다른 공급자, 만료 토큰, Firestore 거절, 위험 경로·위장 MIME·과대 파일·손상 헤더·잘못된 저작권자.
- 이미지 파이프라인: 전체 디코딩, 메타데이터 제거, 파일 제한, JSON 접수와 저작권자 보존, 손상 접수 거부.
- 운영 HTTP: Pages/로컬 Origin 사전 요청 204, 다른 Origin 403, 토큰 없는 업로드와 가짜 토큰 401 확인. 실사진 저장이나 브라우저 자동화는 실행하지 않았습니다.

참고: [Firebase 계정 확인 API](https://firebase.google.com/docs/reference/rest/auth), [Firebase ID token과 Firestore REST 보안 규칙](https://firebase.google.com/docs/firestore/use-rest-api).

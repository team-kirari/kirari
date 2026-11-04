// Public identity for UI controls. Data authorization belongs in server rules.
export const ADMIN_EMAILS: readonly string[] = ['flosnidor9@gmail.com', 'asum0224@gmail.com']

export function getFirebaseConfig(env: Record<string, unknown>) {
  const apiKey = env.VITE_FIREBASE_API_KEY
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN
  const projectId = env.VITE_FIREBASE_PROJECT_ID
  const appId = env.VITE_FIREBASE_APP_ID
  if (typeof apiKey !== 'string' || !/^AIza[A-Za-z0-9_-]{35}$/.test(apiKey)
    || typeof projectId !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)
    || authDomain !== `${projectId}.firebaseapp.com`
    || typeof appId !== 'string' || !/^1:\d+:web:[a-f0-9]+$/.test(appId)) return null
  return { apiKey, authDomain, projectId, appId }
}

export function isAdminIdentity(claims: unknown, allowedEmails: readonly string[] = ADMIN_EMAILS): boolean {
  if (typeof claims !== 'object' || claims === null) return false
  const { email, email_verified: verified, firebase } = claims as Record<string, unknown>
  return typeof email === 'string' && allowedEmails.some(allowed => email.toLowerCase() === allowed.toLowerCase())
    && verified === true && typeof firebase === 'object' && firebase !== null
    && 'sign_in_provider' in firebase && firebase.sign_in_provider === 'google.com'
}

export function loginErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null
  switch (code) {
    case 'auth/popup-closed-by-user': return '로그인을 취소했습니다.'
    case 'auth/cancelled-popup-request': return '다른 로그인 창을 확인해 주세요.'
    case 'auth/popup-blocked': return '브라우저에서 팝업을 허용한 뒤 다시 시도해 주세요.'
    case 'auth/unauthorized-domain': return 'Firebase Authentication의 승인된 도메인에 현재 사이트 주소를 추가해 주세요.'
    case 'auth/operation-not-allowed': return 'Firebase Authentication에서 Google 로그인을 활성화해 주세요.'
    case 'auth/network-request-failed': return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.'
    case 'auth/too-many-requests': return '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
    default: return '로그인하지 못했습니다. Firebase 설정을 확인한 뒤 다시 시도해 주세요.'
  }
}

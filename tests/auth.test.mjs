import test from 'node:test'
import assert from 'node:assert/strict'
import { getFirebaseConfig, isVerifiedGoogleIdentity, isActiveAdminRecord, loginErrorMessage } from '../src/lib/auth.ts'

const claims = { email_verified: true, firebase: { sign_in_provider: 'google.com' } }

test('verified Google identity alone never determines administrator membership', () => {
  assert.equal(isVerifiedGoogleIdentity(claims), true)
  for (const identity of [null, {}, 'admin', { ...claims, email_verified: false },
    { ...claims, email_verified: 'true' }, { ...claims, firebase: null },
    { ...claims, firebase: { sign_in_provider: 'password' } },
    { ...claims, firebase: { sign_in_provider: 'custom' } }, { role: 'admin' }]) {
    assert.equal(isVerifiedGoogleIdentity(identity), false)
  }
})

test('only an explicitly enabled administrator record grants the role', () => {
  assert.equal(isActiveAdminRecord({ enabled: true }), true)
  for (const record of [null, undefined, {}, [], { enabled: false }, { enabled: 'true' },
    { enabled: 1 }, { admin: true }, { role: 'admin' }]) assert.equal(isActiveAdminRecord(record), false)
})

test('missing, placeholder and malformed Firebase config fail closed', () => {
  const config = {
    VITE_FIREBASE_API_KEY: `AIza${'x'.repeat(35)}`,
    VITE_FIREBASE_AUTH_DOMAIN: 'fake-project.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'fake-project',
    VITE_FIREBASE_APP_ID: '1:123456:web:abcdef',
  }
  assert.deepEqual(getFirebaseConfig(config), {
    apiKey: config.VITE_FIREBASE_API_KEY, authDomain: config.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: config.VITE_FIREBASE_PROJECT_ID, appId: config.VITE_FIREBASE_APP_ID,
  })
  assert.equal(getFirebaseConfig({}), null)
  for (const key of Object.keys(config)) {
    assert.equal(getFirebaseConfig({ ...config, [key]: '' }), null)
    assert.equal(getFirebaseConfig({ ...config, [key]: {} }), null)
  }
  assert.equal(getFirebaseConfig({ ...config, VITE_FIREBASE_AUTH_DOMAIN: 'javascript:alert(1)' }), null)
  assert.equal(getFirebaseConfig({ ...config, VITE_FIREBASE_AUTH_DOMAIN: 'other-project.firebaseapp.com' }), null)
})

test('auth errors provide actionable messages without exposing SDK error details', () => {
  assert.match(loginErrorMessage({ code: 'auth/popup-blocked' }), /팝업/)
  assert.match(loginErrorMessage({ code: 'auth/unauthorized-domain' }), /도메인/)
  assert.match(loginErrorMessage({ code: 'auth/operation-not-allowed' }), /Google/)
  for (const error of [null, '<script>bad</script>', { message: 'private token', code: 'unknown' }]) {
    assert.doesNotMatch(loginErrorMessage(error), /private token|script/)
  }
})

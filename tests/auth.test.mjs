import test from 'node:test'
import assert from 'node:assert/strict'
import { getFirebaseConfig, isAdminIdentity, loginErrorMessage } from '../src/lib/auth.ts'

const fakeEmail = 'fake-admin@gmail.com'
const secondEmail = 'fake-second-admin@gmail.com'
const allowedEmails = [fakeEmail, secondEmail]
const claims = { email: fakeEmail, email_verified: true, firebase: { sign_in_provider: 'google.com' } }

test('only verified Google admin identities enable admin controls', () => {
  assert.equal(isAdminIdentity(claims, allowedEmails), true)
  assert.equal(isAdminIdentity({ ...claims, email: fakeEmail.toUpperCase() }, allowedEmails), true)
  assert.equal(isAdminIdentity({ ...claims, email: secondEmail }, allowedEmails), true)
  assert.equal(isAdminIdentity({ ...claims, email: secondEmail, email_verified: false }, allowedEmails), false)
  assert.equal(isAdminIdentity({ ...claims, email: secondEmail, firebase: { sign_in_provider: 'password' } }, allowedEmails), false)
  assert.equal(isAdminIdentity(claims, []), false)
  assert.equal(isAdminIdentity(claims, [secondEmail]), false)
  for (const identity of [null, {}, 'admin', { ...claims, email: 'member-a@gmail.com' },
    { ...claims, email: 'member-b@gmail.com' }, { ...claims, email: `${fakeEmail}.evil.example` },
    { ...claims, email_verified: false }, { ...claims, email_verified: 'true' },
    { ...claims, firebase: null }, { ...claims, firebase: { sign_in_provider: 'password' } },
    { ...claims, firebase: { sign_in_provider: 'custom' } }, { ...claims, role: 'admin', email: '' }]) {
    assert.equal(isAdminIdentity(identity, allowedEmails), false)
  }
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

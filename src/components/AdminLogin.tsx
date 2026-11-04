import { useEffect, useState } from 'react'
import type { Auth } from 'firebase/auth'
import { getFirebaseConfig, isAdminIdentity, loginErrorMessage } from '../lib/auth'
import type * as FirebaseLogin from '../lib/firebase'

type Status = 'checking' | 'guest' | 'admin' | 'unavailable'
type Connection = { auth: Auth, sdk: typeof FirebaseLogin }

export function AdminLogin() {
  const [status, setStatus] = useState<Status>('checking')
  const [connection, setConnection] = useState<Connection | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    let revision = 0
    let unsubscribe: (() => void) | undefined
    const config = getFirebaseConfig(import.meta.env)
    if (!config) return
    void import('../lib/firebase').then(sdk => {
      if (!active) return
      const auth = sdk.getFirebaseAuth(config)
      setConnection({ auth, sdk })
      unsubscribe = sdk.observeIdentity(auth, async identity => {
        const current = ++revision
        if (!active) return
        setStatus(identity ? 'checking' : 'guest')
        if (!identity) return
        try {
          const result = await identity.getIdTokenResult()
          if (!active || current !== revision) return
          if (isAdminIdentity(result.claims)) {
            setStatus('admin')
          } else {
            setMessage('관리자로 지정된 Google 계정만 사용할 수 있습니다.')
            await sdk.logout(auth)
          }
        } catch {
          if (!active || current !== revision) return
          setStatus('unavailable')
          setMessage('로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.')
        }
      }, () => {
        if (!active) return
        ++revision
        setStatus('unavailable')
        setMessage('로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.')
      })
    }).catch(() => {
      if (active) { setStatus('unavailable'); setMessage('로그인을 준비하지 못했습니다. 페이지를 새로고침해 주세요.') }
    })
    return () => { active = false; ++revision; unsubscribe?.() }
  }, [])

  async function login() {
    if (!connection || pending) return
    setPending(true)
    setMessage('')
    try {
      // Open directly within the click handler to retain browser user activation.
      await connection.sdk.loginWithGoogle(connection.auth)
    } catch (error) { setMessage(loginErrorMessage(error)) }
    finally { setPending(false) }
  }

  async function signOut() {
    if (!connection || pending) return
    setPending(true)
    setMessage('')
    try { await connection.sdk.logout(connection.auth) }
    catch { setMessage('로그아웃하지 못했습니다. 다시 시도해 주세요.') }
    finally { setPending(false) }
  }

  const configured = Boolean(getFirebaseConfig(import.meta.env))
  return <div className="admin-login" aria-live="polite">
    {configured && status === 'admin' ? <><span>관리자 로그인됨</span><button disabled={pending} onClick={() => void signOut()}>로그아웃</button></>
      : <><button disabled={!configured || !connection || pending || status === 'checking'} onClick={() => void login()}>{pending ? '로그인 중…' : '로그인'}</button>
        {!configured ? <small>Firebase 설정 필요</small> : status === 'checking' && <small>로그인 확인 중…</small>}</>}
    {message && <span className="admin-login-message" role="status">{message}</span>}
    {configured && status === 'admin' && <small>새로고침하면 로그인이 해제됩니다.</small>}
  </div>
}

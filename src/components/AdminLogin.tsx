import { useEffect, useState } from 'react'
import type { Auth } from 'firebase/auth'
import { getFirebaseConfig, isVerifiedGoogleIdentity, loginErrorMessage } from '../lib/auth'
import type * as FirebaseLogin from '../lib/firebase'

import type { MessageWriter } from '../lib/messages'

type Status = 'checking' | 'guest' | 'member' | 'admin' | 'unavailable'
type Connection = { auth: Auth, sdk: typeof FirebaseLogin }

export function AdminLogin({ onAdminChange }: { onAdminChange: (admin: boolean, writer?: MessageWriter | null) => void }) {
  const [status, setStatus] = useState<Status>('checking')
  const [connection, setConnection] = useState<Connection | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    let revision = 0
    let verifiedUid: string | null = null
    let unsubscribe: (() => void) | undefined
    let unsubscribeMembership: (() => void) | undefined
    const config = getFirebaseConfig(import.meta.env)
    if (!config) return
    void import('../lib/firebase').then(sdk => {
      if (!active) return
      const auth = sdk.getFirebaseAuth(config)
      setConnection({ auth, sdk })
      unsubscribe = sdk.observeIdentity(auth, async identity => {
        const current = ++revision
        if (!active) return
        unsubscribeMembership?.()
        unsubscribeMembership = undefined
        setStatus(identity ? 'checking' : 'guest')
        if (!identity || identity.uid !== verifiedUid) { verifiedUid = null; onAdminChange(false) }
        if (!identity) return
        try {
          const result = await identity.getIdTokenResult()
          if (!active || current !== revision) return
          if (isVerifiedGoogleIdentity(result.claims)) {
            unsubscribeMembership = sdk.observeAdminAccess(auth, identity.uid, (admin, writer) => {
              if (!active || current !== revision) return
              verifiedUid = admin ? identity.uid : null
              setStatus(admin ? 'admin' : 'member')
              setMessage(admin ? '' : '이 계정에는 관리자 권한이 없습니다.')
              onAdminChange(admin, writer)
            }, () => {
              if (!active || current !== revision) return
              verifiedUid = null
              setStatus('unavailable')
              onAdminChange(false)
              setMessage('관리자 권한을 확인하지 못했습니다. 연결과 Firestore 규칙을 확인해 주세요.')
            })
          } else {
            verifiedUid = null
            onAdminChange(false)
            setMessage('관리자로 지정된 Google 계정만 사용할 수 있습니다.')
            await sdk.logout(auth)
          }
        } catch {
          if (!active || current !== revision) return
          setStatus('unavailable')
          verifiedUid = null
          onAdminChange(false)
          setMessage('로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.')
        }
      }, () => {
        if (!active) return
        ++revision
        unsubscribeMembership?.()
        unsubscribeMembership = undefined
        verifiedUid = null
        setStatus('unavailable')
        onAdminChange(false)
        setMessage('로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.')
      })
    }).catch(() => {
      if (active) { setStatus('unavailable'); setMessage('로그인을 준비하지 못했습니다. 페이지를 새로고침해 주세요.') }
    })
    return () => { active = false; ++revision; unsubscribe?.(); unsubscribeMembership?.(); onAdminChange(false) }
  }, [onAdminChange])

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
    {configured && (status === 'admin' || status === 'member') ? <><span>{status === 'admin' ? '관리자 로그인됨' : '로그인됨'}</span><button disabled={pending} onClick={() => void signOut()}>로그아웃</button></>
      : <><button disabled={!configured || !connection || pending || status === 'checking'} onClick={() => void login()}>{pending ? '로그인 중…' : '로그인'}</button>
        {!configured ? <small>Firebase 설정 필요</small> : status === 'checking' && <small>로그인 확인 중…</small>}</>}
    {message && <span className="admin-login-message" role="status">{message}</span>}
  </div>
}

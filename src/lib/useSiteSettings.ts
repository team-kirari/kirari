import { useEffect, useRef, useState } from 'react'
import { getFirebaseConfig } from './auth'
import { defaultSettings } from './site-settings'
import type { SiteSettings } from './site-settings'
import type { createSettingsStore } from './firebase-settings'

export function useSiteSettings() {
  const [published, setPublished] = useState(defaultSettings)
  const [draft, setDraft] = useState<SiteSettings | null>(null)
  const [status, setStatus] = useState('')
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(() => Boolean(getFirebaseConfig(import.meta.env)))
  const [saving, setSaving] = useState(false)
  const store = useRef<ReturnType<typeof createSettingsStore> | null>(null)
  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    const config = getFirebaseConfig(import.meta.env)
    if (!config) return
    // Firestore can keep retrying offline without invoking the error callback.
    const timeout = window.setTimeout(() => {
      if (active) { setLoading(false); setStatus('') }
    }, 10000)
    void import('./firebase-settings').then(({ createSettingsStore }) => {
      if (!active) return
      store.current = createSettingsStore(config)
      unsubscribe = store.current.subscribe(value => {
        if (!active) return
        window.clearTimeout(timeout)
        setPublished(value); setReady(true); setLoading(false); setStatus('')
      }, () => { if (active) { window.clearTimeout(timeout); setReady(false); setLoading(false); setStatus('') } })
    }).catch(() => { if (active) { window.clearTimeout(timeout); setLoading(false); setStatus('') } })
    return () => { active = false; window.clearTimeout(timeout); unsubscribe?.(); store.current = null }
  }, [])
  async function save() {
    if (!draft || !store.current || !ready || saving) return
    setSaving(true)
    try {
      await store.current.save(draft)
      setDraft(null); setStatus('모두에게 보이는 화면으로 저장했습니다.')
    } catch (error) {
      setStatus(error instanceof Error && error.message === 'settings-conflict'
        ? '다른 관리자가 먼저 저장했습니다. 편집 취소 후 최신 설정으로 다시 편집해 주세요.'
        : error instanceof Error && error.message === 'invalid-settings'
        ? 'D-day 이름·날짜와 위젯 위치를 확인해 주세요. 올바른 설정만 저장할 수 있습니다.'
        : '저장하지 못했습니다. 네트워크와 관리자 권한을 확인한 뒤 다시 시도해 주세요.')
    } finally { setSaving(false) }
  }
  return { published, draft, setDraft, ready, loading, saving, save, status: getFirebaseConfig(import.meta.env) ? status : '' }
}

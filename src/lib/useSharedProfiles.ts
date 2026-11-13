import { useEffect, useRef, useState } from 'react'
import { getFirebaseConfig } from './auth'
import { createProfiles, emptyPhotoSelection } from './profiles'
import type { CharacterProfile, PersonId, PhotoSelection } from './profiles'
import type { createProfilesStore } from './firebase-profiles'

export function useSharedProfiles() {
  const [profiles, setProfiles] = useState(createProfiles)
  const [photoSelections, setPhotoSelections] = useState<Record<PersonId, PhotoSelection>>(() => ({ kenji: emptyPhotoSelection(), kiyo: emptyPhotoSelection() }))
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState(() => getFirebaseConfig(import.meta.env) ? '' : '공용 프로필 연결이 설정되지 않았어요.')
  const store = useRef<ReturnType<typeof createProfilesStore> | null>(null)
  const [revisions, setRevisions] = useState({ kenji: 0, kiyo: 0 })
  const saving = useRef(false)
  useEffect(() => {
    let active = true
    const config = getFirebaseConfig(import.meta.env)
    if (!config) return
    const confirmed = new Set<PersonId>()
    const unsubscribes: (() => void)[] = []
    const timeout = window.setTimeout(() => {
      if (active) setStatus('프로필을 불러오지 못했어요. 네트워크를 확인해 주세요.')
    }, 10000)
    void import('./firebase-profiles').then(({ createProfilesStore }) => {
      if (!active) return
      store.current = createProfilesStore(config)
      for (const person of ['kenji', 'kiyo'] as const) unsubscribes.push(store.current.subscribe(person, value => {
        if (!active) return
        confirmed.add(person)
        setRevisions(previous => ({ ...previous, [person]: value?.revision ?? 0 }))
        setProfiles(previous => ({ ...previous, [person]: value?.profile ?? createProfiles()[person] }))
        setPhotoSelections(previous => ({ ...previous, [person]: value?.photoSelection ?? emptyPhotoSelection() }))
        if (confirmed.size === 2) { window.clearTimeout(timeout); setReady(true); setStatus('') }
      }, () => {
        if (!active) return
        confirmed.delete(person); setReady(false); setStatus('공용 프로필을 불러오지 못했어요. 연결과 읽기 권한을 확인해 주세요.')
      }))
    }).catch(() => { if (active) setStatus('공용 프로필에 연결하지 못했어요.') })
    return () => { active = false; window.clearTimeout(timeout); unsubscribes.forEach(unsubscribe => unsubscribe()); store.current = null }
  }, [])

  async function save(person: PersonId, profile: CharacterProfile, photoSelection: PhotoSelection, baseRevision: number) {
    if (!store.current || !ready || saving.current) throw new Error('공용 저장소에 연결한 뒤 다시 시도해 주세요.')
    saving.current = true
    try {
      await store.current.save(person, profile, photoSelection, baseRevision)
      setStatus('모두에게 보이는 프로필로 저장했습니다.')
    } catch (cause) {
      throw new Error(cause instanceof Error && cause.message === 'profile-conflict'
        ? '다른 관리자가 먼저 저장했어요. 편집창을 닫고 최신 프로필로 다시 편집해 주세요.'
        : cause instanceof Error && cause.message === 'invalid-profile'
        ? '입력 길이·숫자 범위·대표색을 확인해 주세요.'
        : '저장하지 못했어요. 네트워크와 관리자 권한을 확인해 주세요.', { cause })
    } finally { saving.current = false }
  }
  return { profiles, photoSelections, ready, status, save, revisions }
}

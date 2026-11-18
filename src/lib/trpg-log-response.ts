export async function fetchTrpgLogResponse(url: string, init: RequestInit, fetcher: typeof fetch = fetch): Promise<Response> {
  try { return await fetcher(url, init) }
  catch (error) {
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) throw new Error('로그 서버 응답을 기다리는 시간이 초과됐어요. 입력 내용은 유지돼요. 같은 저장 버튼으로 다시 시도해 주세요.', { cause: error })
    throw new Error('로그 서버와 통신하지 못했어요. 서버 오류나 네트워크 연결을 확인해 주세요. 입력 내용은 유지돼요.', { cause: error })
  }
}

export async function readTrpgLogResponse(response: Response, list = false, unlock = false): Promise<unknown> {
  if (list && response.status === 404) return []
  // Also translate older server responses; missing IDs and wrong passwords stay indistinguishable.
  if (unlock && response.status === 404) throw new Error('비밀번호가 다릅니다.')
  let data: unknown
  try { data = await response.json() } catch {
    throw new Error(response.ok ? '로그 응답 형식을 확인해 주세요.' : `로그 서버에서 오류가 발생했어요 (${response.status}). 입력 내용은 유지돼요.`)
  }
  if (!response.ok) throw new Error(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : '로그를 불러오지 못했어요.')
  return data
}

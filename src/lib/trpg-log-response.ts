export async function readTrpgLogResponse(response: Response, list = false, unlock = false): Promise<unknown> {
  if (list && response.status === 404) return []
  // Also translate older server responses; missing IDs and wrong passwords stay indistinguishable.
  if (unlock && response.status === 404) throw new Error('비밀번호가 다릅니다.')
  const data: unknown = await response.json()
  if (!response.ok) throw new Error(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : '로그를 불러오지 못했어요.')
  return data
}

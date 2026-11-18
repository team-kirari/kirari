import { useEffect, useRef, useState } from 'react'

export function useConfirmation() {
  const dialog = useRef<HTMLDialogElement>(null)
  const answer = useRef<((confirmed: boolean) => void) | null>(null)
  const [message, setMessage] = useState('')
  useEffect(() => () => { answer.current?.(false); answer.current = null }, [])

  function confirm(message: string): Promise<boolean> {
    const element = dialog.current
    if (!element || answer.current) return Promise.resolve(false)
    setMessage(message)
    element.returnValue = 'cancel'
    return new Promise(resolve => {
      answer.current = resolve
      element.showModal()
    })
  }

  const confirmation = <dialog ref={dialog} className="confirmation-dialog" aria-label="작업 확인" onClose={() => {
    if (dialog.current?.open) return
    const resolve = answer.current
    answer.current = null
    resolve?.(dialog.current?.returnValue === 'confirm')
  }}>
    <p>{message}</p>
    <form method="dialog"><button className="soft-button" value="cancel" autoFocus>취소</button><button className="primary-button" value="confirm">확인</button></form>
  </dialog>

  return { confirm, confirmation }
}

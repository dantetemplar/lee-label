/** Return focus to the enclosing dialog panel so Enter can submit the modal. */
export function focusDialogPanel(from: Element): void {
  queueMicrotask(() => {
    const panel = from.closest<HTMLElement>('[role="dialog"], [role="alertdialog"]')
    panel?.focus({ preventScroll: true })
  })
}

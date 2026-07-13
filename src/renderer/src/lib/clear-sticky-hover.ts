/** Drop sticky :hover/:focus paint after overlay dismissal without a pointer move. */
export function clearStickyHover(root: HTMLElement | null | undefined = document.body): void {
  if (!root) return
  root.style.pointerEvents = 'none'
  requestAnimationFrame(() => {
    root.style.pointerEvents = ''
  })
}

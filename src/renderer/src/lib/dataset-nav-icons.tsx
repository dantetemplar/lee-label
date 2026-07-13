import type { Component, JSX } from 'solid-js'
import nextUnfinishedSvg from '../assets/next-unfinished.svg?raw'

const nextUnfinishedContent = nextUnfinishedSvg
  .replace(/^[\s\S]*?<svg[^>]*>/i, '')
  .replace(/<\/svg>\s*$/i, '')
  .trim()
  .replace(/\bid="soft-glow"/g, 'id="next-unfinished-glow"')
  .replace(/url\(#soft-glow\)/g, 'url(#next-unfinished-glow)')

export const NextUnfinishedIcon: Component<{
  class?: string
  style?: JSX.CSSProperties
  'aria-hidden'?: boolean | 'true' | 'false'
}> = (props) => (
  <svg
    viewBox="0 0 46 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    class={props.class ?? 'h-[18px] w-auto'}
    style={props.style}
    aria-hidden={props['aria-hidden']}
    innerHTML={nextUnfinishedContent}
  />
)

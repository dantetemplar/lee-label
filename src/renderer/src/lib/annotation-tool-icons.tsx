import { IconTemplate } from 'solid-icons'
import type { IconProps, IconTree, IconTypes } from 'solid-icons'
import brushIconSvg from '../assets/brush-icon.svg?raw'
import cursorIconSvg from '../assets/cursor-icon.svg?raw'
import rectangleIconSvg from '../assets/rectangle-icon.svg?raw'

type ToolIconConfig = {
  viewBox: string
  fill?: string
  content: string
}

function createToolIcon(config: ToolIconConfig): IconTypes {
  const src: IconTree = {
    a: {
      viewBox: config.viewBox,
      ...(config.fill ? { fill: config.fill } : {})
    },
    c: config.content.trim()
  }

  return (props: IconProps) => IconTemplate(src, { src, ...props })
}

export const CursorToolIcon = createToolIcon({
  viewBox: '0 0 40 40',
  fill: 'currentColor',
  content: cursorIconSvg
})

export const RectangleToolIcon = createToolIcon({
  viewBox: '0 0 40 40',
  content: rectangleIconSvg
})

export const BrushToolIcon = createToolIcon({
  viewBox: '0 0 24 25',
  fill: 'currentColor',
  content: brushIconSvg
})

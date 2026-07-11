import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  type ComputePositionConfig,
  type Placement
} from '@floating-ui/dom'

export interface FloatingPositionOptions {
  placement?: Placement
  offset?: number
  padding?: number
  strategy?: ComputePositionConfig['strategy']
}

export type FloatingReference =
  | Element
  | {
      getBoundingClientRect(): DOMRect
    }

export function createVirtualReference(x: number, y: number): FloatingReference {
  return {
    getBoundingClientRect: () =>
      DOMRect.fromRect({
        x,
        y,
        width: 0,
        height: 0
      })
  }
}

export function bindFloatingPosition(
  reference: FloatingReference,
  floating: HTMLElement,
  options: FloatingPositionOptions = {}
): () => void {
  const {
    placement = 'bottom-start',
    offset: offsetValue = 8,
    padding = 8,
    strategy = 'fixed'
  } = options

  floating.style.position = strategy

  return autoUpdate(reference, floating, () => {
    void computePosition(reference, floating, {
      placement,
      strategy,
      middleware: [offset(offsetValue), flip(), shift({ padding })]
    }).then(({ x, y }) => {
      Object.assign(floating.style, {
        left: `${x}px`,
        top: `${y}px`
      })
    })
  })
}

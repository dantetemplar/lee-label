import type { Point2D } from '../../../../shared/geometry'
import type { CapsuleSegment, StampMode } from '../brush/brush-engine'
import { forEachBrushStrokeCenter, forEachPixelBrushPixel, usesPixelBrushShape } from '../brush/brush-shapes'
import type { TopologyIssueMask } from '../polygon/worker-types'

export interface BrushSessionState {
  isDrawing: boolean
  activePointerId: number | null
  strokeSegments: CapsuleSegment[]
  lastPoint: Point2D | null
  lockedBrushDiameterImagePx: number
  sessionUndoPushed: boolean
  semanticUndoPushed: boolean
  brushStrokeMode: StampMode
  savedMasksErased: boolean
  topologyCommitAttempt: number
  segmentationGeneration: number
}

export function createBrushSessionState(): BrushSessionState {
  return {
    isDrawing: false,
    activePointerId: null,
    strokeSegments: [],
    lastPoint: null,
    lockedBrushDiameterImagePx: 1,
    sessionUndoPushed: false,
    semanticUndoPushed: false,
    brushStrokeMode: 'paint',
    savedMasksErased: false,
    topologyCommitAttempt: 0,
    segmentationGeneration: 0
  }
}

export function resetBrushSessionState(state: BrushSessionState): void {
  state.segmentationGeneration++
  state.isDrawing = false
  state.activePointerId = null
  state.strokeSegments = []
  state.lastPoint = null
  state.sessionUndoPushed = false
  state.semanticUndoPushed = false
  state.brushStrokeMode = 'paint'
  state.savedMasksErased = false
  state.topologyCommitAttempt = 0
}

export function applyManualIssueGuesses(
  issues: TopologyIssueMask[],
  segments: CapsuleSegment[],
  mode: StampMode,
  brushDiameter: number,
  nextIssueMaskId: { current: number }
): { nextIssues: TopologyIssueMask[]; didChange: boolean } {
  if (segments.length === 0) {
    return { nextIssues: issues, didChange: false }
  }

  const kindToFix = mode === 'paint' ? 'hole' : 'island'
  const nextIssues: TopologyIssueMask[] = []
  let didChange = false

  for (const issue of issues) {
    if (issue.kind !== kindToFix) {
      nextIssues.push(issue)
      continue
    }

    const remaining = new Uint8Array(issue.data)
    let changed = false

    const markPixel = (x: number, y: number): void => {
      const localX = x - issue.x
      const localY = y - issue.y
      if (localX < 0 || localY < 0 || localX >= issue.width || localY >= issue.height) return

      const index = localY * issue.width + localX
      if (!remaining[index]) return
      remaining[index] = 0
      changed = true
    }

    for (const segment of segments) {
      if (usesPixelBrushShape(brushDiameter)) {
        forEachBrushStrokeCenter(
          segment.from.x,
          segment.from.y,
          segment.to.x,
          segment.to.y,
          (centerX, centerY) => {
            forEachPixelBrushPixel(centerX, centerY, brushDiameter, markPixel)
          }
        )
        continue
      }

      const radius = brushDiameter / 2
      const minX = Math.max(issue.x, Math.floor(Math.min(segment.from.x, segment.to.x) - radius))
      const minY = Math.max(issue.y, Math.floor(Math.min(segment.from.y, segment.to.y) - radius))
      const maxX = Math.min(
        issue.x + issue.width - 1,
        Math.ceil(Math.max(segment.from.x, segment.to.x) + radius)
      )
      const maxY = Math.min(
        issue.y + issue.height - 1,
        Math.ceil(Math.max(segment.from.y, segment.to.y) + radius)
      )
      const dx = segment.to.x - segment.from.x
      const dy = segment.to.y - segment.from.y
      const lengthSquared = dx * dx + dy * dy

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const projection =
            lengthSquared === 0
              ? 0
              : Math.min(
                  1,
                  Math.max(0, ((x - segment.from.x) * dx + (y - segment.from.y) * dy) / lengthSquared)
                )
          const closestX = segment.from.x + projection * dx
          const closestY = segment.from.y + projection * dy
          if (Math.hypot(x - closestX, y - closestY) <= radius) {
            markPixel(x, y)
          }
        }
      }
    }

    if (!changed) {
      nextIssues.push(issue)
      continue
    }
    didChange = true

    if (remaining.some((value) => value > 0)) {
      nextIssues.push({
        ...issue,
        id: `${issue.id}:remaining:${++nextIssueMaskId.current}`,
        data: remaining
      })
    }
  }

  return { nextIssues, didChange }
}

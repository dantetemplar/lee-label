function clampedGet(
  alpha: Uint8ClampedArray,
  x: number,
  y: number,
  width: number,
  height: number
): number {
  const cx = Math.max(0, Math.min(x, width - 1))
  const cy = Math.max(0, Math.min(y, height - 1))
  return alpha[cy * width + cx]!
}

export function erode(alpha: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const result = new Uint8ClampedArray(alpha.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (
        alpha[idx]! > 128 &&
        clampedGet(alpha, x - 1, y, width, height) > 128 &&
        clampedGet(alpha, x + 1, y, width, height) > 128 &&
        clampedGet(alpha, x, y - 1, width, height) > 128 &&
        clampedGet(alpha, x, y + 1, width, height) > 128
      ) {
        result[idx] = 255
      }
    }
  }
  return result
}

export function dilate(alpha: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const result = new Uint8ClampedArray(alpha.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (
        alpha[idx]! > 128 ||
        clampedGet(alpha, x - 1, y, width, height) > 128 ||
        clampedGet(alpha, x + 1, y, width, height) > 128 ||
        clampedGet(alpha, x, y - 1, width, height) > 128 ||
        clampedGet(alpha, x, y + 1, width, height) > 128
      ) {
        result[idx] = 255
      }
    }
  }
  return result
}

export function smoothMask(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  passes = 1
): Uint8ClampedArray {
  let result = alpha
  for (let i = 0; i < passes; i++) {
    result = erode(result, width, height)
    result = dilate(result, width, height)
    result = dilate(result, width, height)
    result = erode(result, width, height)
  }
  return result
}

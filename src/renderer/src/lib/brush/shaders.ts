export const CAPSULE_VERTEX = `#version 300 es
precision highp float;

in vec2 aCorner;
in vec2 aSegStart;
in vec2 aSegEnd;

uniform vec2 uMaskSizePx;
uniform float uRadiusPx;

out vec2 vImagePx;
flat out vec2 vSegStart;
flat out vec2 vSegEnd;

void main() {
  vSegStart = aSegStart;
  vSegEnd = aSegEnd;

  float minX = min(aSegStart.x, aSegEnd.x) - uRadiusPx;
  float minY = min(aSegStart.y, aSegEnd.y) - uRadiusPx;
  float maxX = max(aSegStart.x, aSegEnd.x) + uRadiusPx;
  float maxY = max(aSegStart.y, aSegEnd.y) + uRadiusPx;

  vec2 p = vec2(mix(minX, maxX, aCorner.x), mix(minY, maxY, aCorner.y));
  vImagePx = p;

  vec2 ndc = vec2(
    p.x / uMaskSizePx.x * 2.0 - 1.0,
    1.0 - p.y / uMaskSizePx.y * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`

export const CAPSULE_FRAGMENT = `#version 300 es
precision highp float;

in vec2 vImagePx;
flat in vec2 vSegStart;
flat in vec2 vSegEnd;

uniform float uRadiusPx;

out vec4 outColor;

void main() {
  vec2 ab = vSegEnd - vSegStart;
  float abLen2 = dot(ab, ab);
  float h = abLen2 < 1e-6 ? 0.0 : clamp(dot(vImagePx - vSegStart, ab) / abLen2, 0.0, 1.0);
  vec2 closest = vSegStart + h * ab;
  if (distance(vImagePx, closest) > uRadiusPx) {
    discard;
  }
  outColor = vec4(1.0, 0.0, 0.0, 1.0);
}
`

export const COMPOSITE_VERTEX = `#version 300 es
precision highp float;

in vec2 aUv;
out vec2 vUv;

void main() {
  vUv = aUv;
  gl_Position = vec4(aUv * 2.0 - 1.0, 0.0, 1.0);
}
`

export const COMPOSITE_FRAGMENT = `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uSessionMask;
uniform sampler2D uActiveStrokeMask;
uniform vec3 uMaskColor;
uniform float uSessionOpacity;
uniform float uActiveOpacity;

out vec4 outColor;

void main() {
  float sessionCov = texture(uSessionMask, vUv).r;
  float activeStrokeCov = texture(uActiveStrokeMask, vUv).r;
  float maskAlpha = max(sessionCov * uSessionOpacity, activeStrokeCov * uActiveOpacity);
  outColor = vec4(uMaskColor, maskAlpha);
}
`

export const PREVIEW_VERTEX = `#version 300 es
precision highp float;

in vec2 aCorner;

uniform vec2 uMaskSizePx;
uniform vec2 uCenterPx;
uniform float uRadiusPx;

out vec2 vLocal;

void main() {
  vLocal = aCorner;
  vec2 p = uCenterPx + aCorner * uRadiusPx;
  vec2 ndc = vec2(
    p.x / uMaskSizePx.x * 2.0 - 1.0,
    1.0 - p.y / uMaskSizePx.y * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`

export const PREVIEW_FRAGMENT = `#version 300 es
precision highp float;

in vec2 vLocal;

uniform float uRadiusPx;
uniform float uStrokeWidthPx;
uniform float uInnerStrokeWidthPx;
uniform float uOpacity;

out vec4 outColor;

void main() {
  float d2 = dot(vLocal, vLocal);
  float totalStrokeNorm = uStrokeWidthPx / uRadiusPx;
  float innerEdge = 1.0 - totalStrokeNorm;
  float innerEdge2 = innerEdge * innerEdge;
  if (d2 > 1.0 || d2 < innerEdge2) {
    discard;
  }

  float midEdge = 1.0 - uInnerStrokeWidthPx / uRadiusPx;
  float midEdge2 = midEdge * midEdge;
  float alpha = d2 >= midEdge2 ? uOpacity : uOpacity * 0.5;
  outColor = vec4(1.0, 1.0, 1.0, alpha);
}
`

export const PLACED_MASK_VERTEX = `#version 300 es
precision highp float;

in vec2 aCorner;

uniform vec2 uImageSizePx;
uniform vec4 uBounds;

out vec2 vUv;

void main() {
  vUv = aCorner;
  vec2 p = uBounds.xy + aCorner * uBounds.zw;
  vec2 ndc = vec2(
    p.x / uImageSizePx.x * 2.0 - 1.0,
    1.0 - p.y / uImageSizePx.y * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`

export const PLACED_MASK_FRAGMENT = `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uMask;
uniform vec3 uMaskColor;
uniform float uOpacity;

out vec4 outColor;

void main() {
  float coverage = texture(uMask, vUv).r;
  outColor = vec4(uMaskColor, coverage * uOpacity);
}
`

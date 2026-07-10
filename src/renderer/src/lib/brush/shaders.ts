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
uniform float uStampValue;

out vec4 outColor;

void main() {
  vec2 ab = vSegEnd - vSegStart;
  float abLen2 = dot(ab, ab);
  float h = abLen2 < 1e-6 ? 0.0 : clamp(dot(vImagePx - vSegStart, ab) / abLen2, 0.0, 1.0);
  vec2 closest = vSegStart + h * ab;
  if (distance(vImagePx, closest) > uRadiusPx) {
    discard;
  }
  outColor = vec4(uStampValue, 0.0, 0.0, 1.0);
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
  float sessionCov = step(0.5, texture(uSessionMask, vUv).r);
  float activeCov = step(0.5, texture(uActiveStrokeMask, vUv).r);
  float alpha = max(sessionCov * uSessionOpacity, activeCov * uActiveOpacity);
  if (alpha < 0.001) {
    discard;
  }
  outColor = vec4(uMaskColor * alpha, alpha);
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
uniform float uOuterOpacity;
uniform float uInnerOpacity;
uniform float uFilledPreview;

out vec4 outColor;

void main() {
  float d2 = dot(vLocal, vLocal);
  if (uFilledPreview > 0.5) {
    if (d2 > 1.0) {
      discard;
    }
    outColor = vec4(vec3(1.0) * uOuterOpacity, uOuterOpacity);
    return;
  }

  float totalStrokeNorm = uStrokeWidthPx / uRadiusPx;
  float innerEdge = 1.0 - totalStrokeNorm;
  float innerEdge2 = innerEdge * innerEdge;
  if (d2 > 1.0 || d2 < innerEdge2) {
    discard;
  }

  float midEdge = 1.0 - uInnerStrokeWidthPx / uRadiusPx;
  float midEdge2 = midEdge * midEdge;
  float alpha = d2 >= midEdge2 ? uOuterOpacity : uInnerOpacity;
  outColor = vec4(vec3(1.0) * alpha, alpha);
}
`

export const PIXEL_BRUSH_VERTEX = `#version 300 es
precision highp float;

in vec2 aCorner;

uniform vec2 uMaskSizePx;
uniform vec2 uCenterPx;
uniform float uBrushSize;

out vec2 vImagePx;

void main() {
  float minX;
  float minY;
  float maxX;
  float maxY;

  if (uBrushSize < 1.5) {
    minX = uCenterPx.x;
    minY = uCenterPx.y;
    maxX = uCenterPx.x + 1.0;
    maxY = uCenterPx.y + 1.0;
  } else if (uBrushSize < 2.5) {
    minX = uCenterPx.x - 1.0;
    minY = uCenterPx.y - 1.0;
    maxX = uCenterPx.x + 1.0;
    maxY = uCenterPx.y + 1.0;
  } else {
    minX = uCenterPx.x - 1.0;
    minY = uCenterPx.y - 1.0;
    maxX = uCenterPx.x + 2.0;
    maxY = uCenterPx.y + 2.0;
  }

  vec2 p = vec2(mix(minX, maxX, aCorner.x), mix(minY, maxY, aCorner.y));
  vImagePx = p;

  vec2 ndc = vec2(
    p.x / uMaskSizePx.x * 2.0 - 1.0,
    1.0 - p.y / uMaskSizePx.y * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`

export const PIXEL_BRUSH_FRAGMENT = `#version 300 es
precision highp float;

in vec2 vImagePx;

uniform vec2 uCenterPx;
uniform float uBrushSize;
uniform float uStampValue;

out vec4 outColor;

void main() {
  ivec2 ip = ivec2(floor(vImagePx.x), floor(vImagePx.y));
  ivec2 c = ivec2(floor(uCenterPx.x), floor(uCenterPx.y));
  bool hit = false;

  if (uBrushSize < 1.5) {
    hit = ip == c;
  } else if (uBrushSize < 2.5) {
    hit = ip.x >= c.x - 1 && ip.x <= c.x && ip.y >= c.y - 1 && ip.y <= c.y;
  } else {
    hit = (ip == c) ||
      (ip.x == c.x && abs(ip.y - c.y) == 1) ||
      (ip.y == c.y && abs(ip.x - c.x) == 1);
  }

  if (!hit) {
    discard;
  }

  outColor = vec4(uStampValue, 0.0, 0.0, 1.0);
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
  float coverage = step(0.5, texture(uMask, vUv).r);
  if (coverage < 0.5) {
    discard;
  }
  outColor = vec4(uMaskColor * uOpacity, uOpacity);
}
`

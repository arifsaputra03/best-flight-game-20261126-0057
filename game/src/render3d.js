// Golden Hour — the WebGL renderer: sky, sea, terrain, town, runway and the Kestrel.
// Hand-rolled shaders and matrices, no engine. One lit program shades every solid
// thing with sun, specular glint and golden fog; a sky program paints the gradient
// and the sun; a sprite program drifts the clouds. Static scenery is merged into a
// handful of buffers at load; only the aeroplane, its propeller and the rings move.

import { LIGHT, RUNWAY, SEA_LEVEL, WORLD_SIZE } from './config.js';
import { GeometryBuilder } from './geometry.js';
import { buildAirframe, buildGear, buildPropeller, PROP_HUB } from './aircraft.js';
import { BUILDINGS, CITY, CLOUDS, RINGS, RING_RADIUS, heightAt } from './world.js';
import { clamp, fbmNoise, makeRandom } from './random.js';

const SUN_DIR = normalise3(LIGHT.sunDirection);

// ---------------------------------------------------------------- matrices (column major)

function mat4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

function mat4LookAt(eye, center, up) {
  const z = normalise3([eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]]);
  const x = normalise3(cross3(up, z));
  const y = cross3(z, x);
  const out = new Float32Array(16);
  out[0] = x[0]; out[1] = y[0]; out[2] = z[0];
  out[4] = x[1]; out[5] = y[1]; out[6] = z[1];
  out[8] = x[2]; out[9] = y[2]; out[10] = z[2];
  out[12] = -dot3(x, eye); out[13] = -dot3(y, eye); out[14] = -dot3(z, eye);
  out[15] = 1;
  return out;
}

function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

function mat4Compose(px, py, pz, rotY, rotX, rotZ, scale = 1, scaleY = null) {
  const cy = Math.cos(rotY), sy = Math.sin(rotY);
  const cx = Math.cos(rotX), sx = Math.sin(rotX);
  const cz = Math.cos(rotZ), sz = Math.sin(rotZ);
  // M = T * Ry * Rx * Rz, then column j is scaled by the j-th local scale.
  const syScale = scaleY === null ? scale : scaleY;
  const m = new Float32Array(16);
  m[0] = (cy * cz + sy * sx * sz) * scale;
  m[1] = (cx * sz) * scale;
  m[2] = (cy * sx * sz - sy * cz) * scale;
  m[4] = (sy * sx * cz - cy * sz) * syScale;
  m[5] = (cx * cz) * syScale;
  m[6] = (sy * sz + cy * sx * cz) * syScale;
  m[8] = (sy * cx) * scale;
  m[9] = (-sx) * scale;
  m[10] = (cy * cx) * scale;
  m[12] = px; m[13] = py; m[14] = pz; m[15] = 1;
  return m;
}

function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalise3(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

// ---------------------------------------------------------------- shaders

const LIT_VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
attribute float aAlpha;
uniform mat4 uMVP;
uniform mat4 uModel;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vAlpha;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vNormal = mat3(uModel) * aNormal;
  vColor = aColor;
  vAlpha = aAlpha;
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const LIT_FRAG = `
precision mediump float;
uniform vec3 uSunDir;
uniform vec3 uSunColour;
uniform vec3 uFogColour;
uniform float uFogDensity;
uniform vec3 uCamPos;
uniform float uEmissive;
uniform float uSpecular;
uniform vec3 uTint;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vAlpha;
void main() {
  vec3 base = vColor * uTint;
  vec3 colour;
  if (uEmissive > 0.5) {
    colour = base;
  } else {
    vec3 n = normalize(vNormal);
    float diffuse = max(dot(n, uSunDir), 0.0);
    vec3 viewDir = normalize(uCamPos - vWorld);
    vec3 halfDir = normalize(viewDir + uSunDir);
    float spec = pow(max(dot(n, halfDir), 0.0), 48.0) * uSpecular;
    colour = base * (0.38 + 0.82 * diffuse) + uSunColour * spec;
    colour += base * vec3(0.13, 0.10, 0.13); // a breath of sky in the shade
  }
  float dist = length(uCamPos - vWorld);
  float fog = 1.0 - exp(-dist * uFogDensity);
  colour = mix(colour, uFogColour, fog);
  gl_FragColor = vec4(colour, vAlpha);
}`;

const SKY_VERT = `
attribute vec2 aClip;
varying vec2 vClip;
void main() {
  vClip = aClip;
  gl_Position = vec4(aClip, 0.9999, 1.0);
}`;

const SKY_FRAG = `
precision mediump float;
uniform vec3 uCamFwd;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform float uTanH;
uniform float uTanV;
uniform vec3 uSunDir;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSunColour;
varying vec2 vClip;
void main() {
  vec3 dir = normalize(uCamFwd + uCamRight * (vClip.x * uTanH) + uCamUp * (vClip.y * uTanV));
  float up = clamp(dir.y, -1.0, 1.0);
  vec3 sky = mix(uHorizon, uZenith, pow(max(up, 0.0), 0.55));
  sky = mix(sky, uHorizon * 0.92, smoothstep(0.0, -0.25, up)); // sea haze below the horizon
  float sunAmount = max(dot(dir, uSunDir), 0.0);
  sky += uSunColour * pow(sunAmount, 160.0) * 0.55; // the glow around the sun
  sky += uSunColour * pow(sunAmount, 900.0) * 1.4; // the disc itself
  gl_FragColor = vec4(sky, 1.0);
}`;

const SPRITE_VERT = `
attribute vec3 aCenter;
attribute vec2 aCorner;
attribute float aScale;
attribute float aShade;
uniform mat4 uViewProj;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
varying vec2 vUv;
varying float vShade;
void main() {
  vUv = aCorner * 0.5 + 0.5;
  vShade = aShade;
  vec3 world = aCenter + (uCamRight * aCorner.x + uCamUp * aCorner.y) * aScale;
  gl_Position = uViewProj * vec4(world, 1.0);
}`;

const SPRITE_FRAG = `
precision mediump float;
uniform sampler2D uTex;
uniform vec3 uFogColour;
varying vec2 vUv;
varying float vShade;
void main() {
  vec4 tex = texture2D(uTex, vUv);
  vec3 colour = mix(uFogColour, vec3(1.0, 0.93, 0.84), 0.55) * vShade;
  gl_FragColor = vec4(colour, tex.a * 0.82);
}`;

// ---------------------------------------------------------------- renderer

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL is not available in this browser.');
    gl.getExtension('OES_element_index_uint'); // the terrain's index count needs 32-bit indices
    this.gl = gl;
    this.lit = makeProgram(gl, LIT_VERT, LIT_FRAG);
    this.sky = makeProgram(gl, SKY_VERT, SKY_FRAG);
    this.sprite = makeProgram(gl, SPRITE_VERT, SPRITE_FRAG);
    this.terrainMesh = uploadGeometry(gl, buildTerrainGeometry());
    this.sceneryMesh = uploadGeometry(gl, buildSceneryGeometry());
    this.emissiveMesh = uploadGeometry(gl, buildEmissiveGeometry());
    this.airframeMesh = uploadGeometry(gl, buildAirframe());
    this.propMesh = uploadGeometry(gl, buildPropeller());
    this.discMesh = uploadGeometry(gl, buildSpinnerDisc());
    this.gearMesh = uploadGeometry(gl, buildGear());
    this.ringMesh = uploadGeometry(gl, buildRingGeometry());
    this.cloudMesh = uploadClouds(gl);
    this.cloudTexture = makeCloudTexture(gl);
    this.skyMesh = uploadSky(gl);
  }

  /** Draw one frame. view: { camPos, camTarget, camUp, fovY, flight, ringsDone, time }. */
  render(view) {
    const gl = this.gl;
    const { width, height } = gl.canvas;
    if (gl.canvas.width !== gl.canvas.clientWidth || gl.canvas.height !== gl.canvas.clientHeight) {
      gl.canvas.width = gl.canvas.clientWidth;
      gl.canvas.height = gl.canvas.clientHeight;
    }
    gl.viewport(0, 0, width, height);
    const aspect = width / Math.max(1, height);
    const proj = mat4Perspective(view.fovY, aspect, 0.3, 9000);
    const viewMat = mat4LookAt(view.camPos, view.camTarget, view.camUp);
    const viewProj = mat4Multiply(proj, viewMat);
    const identity = mat4Compose(0, 0, 0, 0, 0, 0);

    const fwd = normalise3([
      view.camTarget[0] - view.camPos[0],
      view.camTarget[1] - view.camPos[1],
      view.camTarget[2] - view.camPos[2],
    ]);
    const right = normalise3(cross3(fwd, view.camUp));
    const up2 = cross3(right, fwd);

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    this.drawSky(viewProj, fwd, right, up2, view.fovY, aspect);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    this.drawLit(this.terrainMesh, identity, viewProj, view, { specular: 0.04 });
    this.drawLit(this.sceneryMesh, identity, viewProj, view, { specular: 0.1 });
    this.drawLit(this.emissiveMesh, identity, viewProj, view, { emissive: 1 });

    this.drawRings(viewProj, view);
    this.drawPlane(viewProj, view);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    this.drawClouds(viewProj, right, up2);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  drawSky(viewProj, fwd, right, up, fovY, aspect) {
    const gl = this.gl;
    const p = this.sky;
    gl.useProgram(p.program);
    bindBuffer(gl, p, 'aClip', this.skyMesh, 2);
    gl.uniform3fv(p.uniforms.uCamFwd, fwd);
    gl.uniform3fv(p.uniforms.uCamRight, right);
    gl.uniform3fv(p.uniforms.uCamUp, up);
    gl.uniform1f(p.uniforms.uTanV, Math.tan(fovY / 2));
    gl.uniform1f(p.uniforms.uTanH, Math.tan(fovY / 2) * aspect);
    gl.uniform3fv(p.uniforms.uSunDir, SUN_DIR);
    gl.uniform3fv(p.uniforms.uHorizon, LIGHT.skyHorizon);
    gl.uniform3fv(p.uniforms.uZenith, LIGHT.skyZenith);
    gl.uniform3fv(p.uniforms.uSunColour, LIGHT.sunColour);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    void viewProj;
  }

  drawLit(mesh, model, viewProj, view, options) {
    const gl = this.gl;
    const p = this.lit;
    gl.useProgram(p.program);
    const mvp = mat4Multiply(viewProj, model);
    gl.uniformMatrix4fv(p.uniforms.uMVP, false, mvp);
    gl.uniformMatrix4fv(p.uniforms.uModel, false, model);
    gl.uniform3fv(p.uniforms.uSunDir, SUN_DIR);
    gl.uniform3fv(p.uniforms.uSunColour, LIGHT.sunColour);
    gl.uniform3fv(p.uniforms.uFogColour, LIGHT.fogColour);
    gl.uniform1f(p.uniforms.uFogDensity, LIGHT.fogDensity);
    gl.uniform3fv(p.uniforms.uCamPos, view.camPos);
    gl.uniform1f(p.uniforms.uEmissive, options.emissive ? 1 : 0);
    gl.uniform1f(p.uniforms.uSpecular, options.specular ?? 0.15);
    gl.uniform3fv(p.uniforms.uTint, options.tint ?? [1, 1, 1]);
    for (const part of mesh.parts) {
      if (part.transparent) continue;
      bindGeometryPart(gl, p, part);
      gl.drawElements(gl.TRIANGLES, part.count, gl.UNSIGNED_INT, 0);
    }
    // Transparent fragments (the propeller blur disc) ride along, unsorted but few.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const part of mesh.parts) {
      if (!part.transparent) continue;
      bindGeometryPart(gl, p, part);
      gl.drawElements(gl.TRIANGLES, part.count, gl.UNSIGNED_INT, 0);
    }
    gl.disable(gl.BLEND);
  }

  drawRings(viewProj, view) {
    const gl = this.gl;
    for (let i = 0; i < RINGS.length; i += 1) {
      const ring = RINGS[i];
      const isNext = i === view.ringsDone;
      const isDone = i < view.ringsDone;
      const tint = isDone ? [0.25, 0.75, 0.4] : isNext ? [1.0, 0.78, 0.2] : [0.75, 0.85, 0.95];
      const pulse = isNext ? 1 + Math.sin(view.time * 3.2) * 0.035 : 1;
      const model = ringModel(ring, pulse);
      const p = this.lit;
      gl.useProgram(p.program);
      gl.uniformMatrix4fv(p.uniforms.uMVP, false, mat4Multiply(viewProj, model));
      gl.uniformMatrix4fv(p.uniforms.uModel, false, model);
      gl.uniform3fv(p.uniforms.uSunDir, SUN_DIR);
      gl.uniform3fv(p.uniforms.uSunColour, LIGHT.sunColour);
      gl.uniform3fv(p.uniforms.uFogColour, LIGHT.fogColour);
      gl.uniform1f(p.uniforms.uFogDensity, LIGHT.fogDensity);
      gl.uniform3fv(p.uniforms.uCamPos, view.camPos);
      gl.uniform1f(p.uniforms.uEmissive, 1);
      gl.uniform1f(p.uniforms.uSpecular, 0);
      gl.uniform3fv(p.uniforms.uTint, tint);
      for (const part of this.ringMesh.parts) {
        bindGeometryPart(gl, p, part);
        gl.drawElements(gl.TRIANGLES, part.count, gl.UNSIGNED_INT, 0);
      }
    }
  }

  drawPlane(viewProj, view) {
    const f = view.flight;
    const model = mat4Compose(f.pos.x, f.pos.y, f.pos.z, -f.heading, f.pitch, -f.roll);
    this.drawLit(this.airframeMesh, model, viewProj, view, { specular: 0.3 });
    if (view.cockpit) {
      // From the pilot's seat the blades are a blur: spinner and disc only.
      const discModel = mat4Multiply(model, mat4Compose(PROP_HUB.x, PROP_HUB.y, PROP_HUB.z, 0, 0, 0));
      this.drawLit(this.discMesh, discModel, viewProj, view, { specular: 0.2 });
    } else {
      const propModel = mat4Multiply(
        model,
        mat4Multiply(
          mat4Compose(PROP_HUB.x, PROP_HUB.y, PROP_HUB.z, 0, 0, 0),
          mat4Compose(0, 0, 0, 0, 0, f.propAngle),
        ),
      );
      this.drawLit(this.propMesh, propModel, viewProj, view, { specular: 0.2 });
    }
    const gearFraction = f.gearDown
      ? 1 - clamp(f.gearTransit / 1.1, 0, 1)
      : clamp(f.gearTransit / 1.1, 0, 1);
    if (gearFraction > 0.03) {
      const gearModel = mat4Multiply(model, mat4Compose(0, 0, 0, 0, 0, 0, 1, gearFraction));
      this.drawLit(this.gearMesh, gearModel, viewProj, view, { specular: 0.15 });
    }
  }

  drawClouds(viewProj, right, up) {
    const gl = this.gl;
    const p = this.sprite;
    gl.useProgram(p.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.cloudTexture);
    gl.uniform1i(p.uniforms.uTex, 0);
    gl.uniformMatrix4fv(p.uniforms.uViewProj, false, viewProj);
    gl.uniform3fv(p.uniforms.uCamRight, right);
    gl.uniform3fv(p.uniforms.uCamUp, up);
    gl.uniform3fv(p.uniforms.uFogColour, LIGHT.fogColour);
    bindBuffer(gl, p, 'aCenter', this.cloudMesh.center, 3);
    bindBuffer(gl, p, 'aCorner', this.cloudMesh.corner, 2);
    bindBuffer(gl, p, 'aScale', this.cloudMesh.scale, 1);
    bindBuffer(gl, p, 'aShade', this.cloudMesh.shade, 1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.cloudMesh.index);
    gl.drawElements(gl.TRIANGLES, this.cloudMesh.count, gl.UNSIGNED_INT, 0);
  }
}

// ---------------------------------------------------------------- geometry upload

function makeProgram(gl, vertSource, fragSource) {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSource);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);
  const program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('Shader link failed: ' + gl.getProgramInfoLog(program));
  }
  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i += 1) {
    const info = gl.getActiveUniform(program, i);
    uniforms[info.name] = gl.getUniformLocation(program, info.name);
  }
  return { program, uniforms };
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error('Shader compile failed: ' + gl.getShaderInfoLog(shader));
  }
  return shader;
}

function floatBuffer(gl, data) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buffer;
}

function bindBuffer(gl, program, name, buffer, size) {
  const loc = gl.getAttribLocation(program.program, name);
  if (loc < 0) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
}

/** Upload a built geometry, split into an opaque part and a transparent part. */
function uploadGeometry(gl, geometry) {
  const opaque = [];
  const transparent = [];
  const idx = geometry.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const a = geometry.alphas[idx[t]];
    const b = geometry.alphas[idx[t + 1]];
    const c = geometry.alphas[idx[t + 2]];
    (a < 0.999 || b < 0.999 || c < 0.999 ? transparent : opaque).push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const shared = {
    pos: floatBuffer(gl, geometry.positions),
    normal: floatBuffer(gl, geometry.normals),
    color: floatBuffer(gl, geometry.colors),
    alpha: floatBuffer(gl, geometry.alphas),
  };
  const parts = [];
  for (const [list, isTransparent] of [[opaque, false], [transparent, true]]) {
    if (!list.length) continue;
    const index = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(list), gl.STATIC_DRAW);
    parts.push({ ...shared, index, count: list.length, transparent: isTransparent });
  }
  return { parts };
}

function bindGeometryPart(gl, program, part) {
  bindBuffer(gl, program, 'aPos', part.pos, 3);
  bindBuffer(gl, program, 'aNormal', part.normal, 3);
  bindBuffer(gl, program, 'aColor', part.color, 3);
  bindBuffer(gl, program, 'aAlpha', part.alpha, 1);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, part.index);
}

function uploadSky(gl) {
  return floatBuffer(gl, new Float32Array([-1, -1, 3, -1, -1, 3]));
}

function uploadClouds(gl) {
  const centers = [];
  const corners = [];
  const scales = [];
  const shades = [];
  const indices = [];
  const random = makeRandom(777);
  CLOUDS.forEach((cloud, i) => {
    const base = i * 4;
    // Corners stretch wider than tall: a cloud is a raft, not a ball.
    for (const [cx, cy] of [[-1.9, -0.55], [1.9, -0.55], [1.9, 0.55], [-1.9, 0.55]]) {
      centers.push(cloud.x, cloud.y, cloud.z);
      corners.push(cx, cy);
      scales.push(cloud.scale);
      shades.push(0.82 + random() * 0.25);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const index = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
  return {
    center: floatBuffer(gl, new Float32Array(centers)),
    corner: floatBuffer(gl, new Float32Array(corners)),
    scale: floatBuffer(gl, new Float32Array(scales)),
    shade: floatBuffer(gl, new Float32Array(shades)),
    index,
    count: indices.length,
  };
}

/** A soft blobby cloud sprite, painted once onto a small canvas. */
function makeCloudTexture(gl) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const random = makeRandom(31337);
  for (let i = 0; i < 30; i += 1) {
    const x = size * (0.14 + random() * 0.72);
    const y = size * (0.38 + random() * 0.24);
    const r = size * (0.09 + random() * 0.15);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.15)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

// ---------------------------------------------------------------- static scenery

/** The terrain grid with smooth normals and painted fields, shore, rock and snow. */
function buildTerrainGeometry() {
  const segments = 150;
  const step = WORLD_SIZE / segments;
  const verts = segments + 1;
  const positions = [];
  const normals = [];
  const colors = [];
  const alphas = [];
  const indices = [];
  for (let j = 0; j < verts; j += 1) {
    for (let i = 0; i < verts; i += 1) {
      const x = -WORLD_SIZE / 2 + i * step;
      const z = -WORLD_SIZE / 2 + j * step;
      const h = heightAt(x, z);
      const e = 7;
      const dhx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
      const dhz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
      const n = normalise3([-dhx, 1, -dhz]);
      positions.push(x, h, z);
      normals.push(n[0], n[1], n[2]);
      const slope = Math.hypot(dhx, dhz);
      const c = terrainColour(x, z, h, slope);
      colors.push(c[0], c[1], c[2]);
      alphas.push(1);
    }
  }
  for (let j = 0; j < segments; j += 1) {
    for (let i = 0; i < segments; i += 1) {
      const a = j * verts + i;
      const b = a + 1;
      const c = a + verts;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  // The sea: one great sheet over everything the island does not cover.
  const seaBase = positions.length / 3;
  const seaSize = WORLD_SIZE * 1.6;
  for (const [x, z] of [[-seaSize, -seaSize], [seaSize, -seaSize], [seaSize, seaSize], [-seaSize, seaSize]]) {
    positions.push(x, SEA_LEVEL, z);
    normals.push(0, 1, 0);
    colors.push(LIGHT.waterColour[0], LIGHT.waterColour[1], LIGHT.waterColour[2]);
    alphas.push(0.93);
  }
  indices.push(seaBase, seaBase + 2, seaBase + 1, seaBase, seaBase + 3, seaBase + 2);
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    alphas: new Float32Array(alphas),
    indices: new Uint32Array(indices),
  };
}

const FIELD_PALETTE = [
  [0.72, 0.57, 0.29], // ripe wheat
  [0.34, 0.52, 0.23], // pasture green
  [0.24, 0.43, 0.19], // dark meadow
  [0.46, 0.33, 0.19], // fresh plough
  [0.55, 0.6, 0.27], // young barley
];

function terrainColour(x, z, h, slope) {
  if (h < SEA_LEVEL) {
    const depth = clamp((SEA_LEVEL - h) / 12, 0, 1);
    return mix3([0.55, 0.52, 0.36], [0.16, 0.3, 0.33], depth); // sand shading into the deep
  }
  const dc = Math.hypot(x - CITY.x, z - CITY.z);
  if (dc < CITY.radius + 60 && h < 40) return [0.37, 0.36, 0.34]; // the town's asphalt ground
  const grain = fbmNoise(x, z, 190, 3, 8801);
  let colour;
  if (h < 58 && slope < 0.42) {
    const cell = Math.abs(Math.floor(x / 270) * 73 + Math.floor(z / 270) * 149) % FIELD_PALETTE.length;
    colour = FIELD_PALETTE[cell];
    colour = mix3(colour, [0.4, 0.55, 0.25], grain * 0.35);
  } else {
    colour = mix3([0.36, 0.52, 0.24], [0.45, 0.55, 0.22], grain);
  }
  if (h > 120) colour = mix3(colour, [0.46, 0.41, 0.37], clamp((h - 120) / 130, 0, 1));
  if (slope > 0.75) colour = mix3(colour, [0.42, 0.38, 0.35], clamp((slope - 0.75) / 0.7, 0, 1));
  if (h > 330) colour = mix3(colour, [0.93, 0.91, 0.88], clamp((h - 330) / 70, 0, 1));
  if (h < SEA_LEVEL + 1.6) colour = mix3([0.76, 0.66, 0.46], colour, clamp((h - SEA_LEVEL) / 1.6, 0, 1));
  return colour;
}

function mix3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Runway, apron, hangar, tower and the town's buildings, merged into one buffer. */
function buildSceneryGeometry() {
  const g = new GeometryBuilder();
  const y = RUNWAY.height;
  // The strip itself and its shoulders.
  g.box(RUNWAY.x, y + 0.06, RUNWAY.z, RUNWAY.length + 60, 0.24, RUNWAY.width + 26, [0.42, 0.44, 0.3]);
  g.box(RUNWAY.x, y + 0.16, RUNWAY.z, RUNWAY.length, 0.2, RUNWAY.width, [0.16, 0.16, 0.17]);
  // Threshold bars and the centreline dashes.
  for (const endSign of [-1, 1]) {
    for (let i = 0; i < 6; i += 1) {
      const zOff = -17.5 + i * 7;
      g.box(RUNWAY.x + endSign * (RUNWAY.length / 2 - 26), y + 0.28, RUNWAY.z + zOff, 15, 0.04, 3.4, [0.92, 0.92, 0.9]);
    }
  }
  for (let x = -RUNWAY.length / 2 + 60; x < RUNWAY.length / 2 - 50; x += 42) {
    g.box(x, y + 0.28, RUNWAY.z, 16, 0.04, 1.5, [0.92, 0.92, 0.9]);
  }
  // Apron, hangar and tower south of the strip.
  g.box(170, y + 0.1, RUNWAY.z + 105, 150, 0.2, 90, [0.4, 0.4, 0.39]);
  g.box(150, y + 5.5, RUNWAY.z + 118, 52, 11, 30, [0.35, 0.42, 0.38]);
  g.box(150, y + 11.4, RUNWAY.z + 118, 56, 1.2, 34, [0.23, 0.2, 0.18]);
  g.box(216, y + 4, RUNWAY.z + 112, 22, 8, 20, [0.62, 0.55, 0.42]);
  g.box(-250, y + 8, RUNWAY.z + 108, 7, 16, 7, [0.75, 0.72, 0.66]);
  g.box(-250, y + 17.5, RUNWAY.z + 108, 11, 3.4, 11, [0.12, 0.18, 0.22]);
  g.box(-250, y + 19.6, RUNWAY.z + 108, 12.5, 0.8, 12.5, [0.3, 0.28, 0.26]);
  // Fuel drums by the hangar.
  const drumRandom = makeRandom(5150);
  for (let i = 0; i < 6; i += 1) {
    g.box(112 + drumRandom() * 14, y + 0.9, RUNWAY.z + 92 + drumRandom() * 8, 1.4, 1.8, 1.4, [0.6, 0.25, 0.12]);
  }
  // Port Saffron: every building a box, warmer on its sun side by the lighting.
  for (const b of BUILDINGS) {
    const tone = 0.82 + b.tone * 0.35;
    const colour = [0.58 * tone, 0.53 * tone, 0.48 * tone];
    g.box(b.x, CITY.height + b.h / 2, b.z, b.w, b.h, b.d, colour);
    g.box(b.x, CITY.height + b.h + 0.5, b.z, b.w + 1.5, 1, b.d + 1.5, [0.3, 0.28, 0.27]);
  }
  return g.build();
}

/** Everything that glows: runway edge lights, PAPI, and the town's lit windows. */
function buildEmissiveGeometry() {
  const g = new GeometryBuilder();
  const y = RUNWAY.height;
  const lightColour = [1.0, 0.78, 0.38];
  for (let x = -RUNWAY.length / 2; x <= RUNWAY.length / 2; x += 58) {
    g.box(x, y + 0.55, RUNWAY.z - RUNWAY.width / 2 - 3, 0.7, 0.5, 0.7, lightColour);
    g.box(x, y + 0.55, RUNWAY.z + RUNWAY.width / 2 + 3, 0.7, 0.5, 0.7, lightColour);
  }
  // PAPI: four boxes beside the touchdown point, white over red as the light shows.
  for (let i = 0; i < 4; i += 1) {
    g.box(-RUNWAY.length / 2 + 120, y + 0.7, RUNWAY.z - RUNWAY.width / 2 - 9 - i * 3.4, 1.1, 0.7, 1.1, i < 2 ? [1, 0.95, 0.9] : [1, 0.2, 0.12]);
  }
  // Windows: two faces of each building, a warm scatter of lit rooms.
  const random = makeRandom(24601);
  for (const b of BUILDINGS) {
    for (const face of [1, -1]) {
      const wz = b.z + face * (b.d / 2 + 0.06);
      const cols = Math.floor(b.w / 4.4);
      const rows = Math.floor(b.h / 4.6);
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          if (random() > 0.42) continue;
          const wx = b.x - b.w / 2 + 2.4 + cx * 4.4;
          const wy = CITY.height + 2.6 + cy * 4.6;
          const warm = 0.75 + random() * 0.45;
          g.box(wx, wy, wz, 1.7, 2.1, 0.08, [1.0 * warm, 0.76 * warm, 0.42 * warm]);
        }
      }
    }
  }
  return g.build();
}

/** One gate of the course, centred on the origin and facing +z; drawn per ring. */
function buildRingGeometry() {
  const g = new GeometryBuilder();
  g.ring(0, 0, 0, RING_RADIUS, 1.5, [1, 1, 1]);
  return g.build();
}

/** What the pilot sees of the propeller: the red spinner and the translucent blur disc. */
function buildSpinnerDisc() {
  const g = new GeometryBuilder();
  g.frustum(0, 0, 0, -0.36, 0.04, 0.02, 0.02, 0.21, 0.21, [0.62, 0.1, 0.08]);
  g.disc(0, 0, 0.05, 1.18, [0.25, 0.22, 0.19], 0.15);
  return g.build();
}

/** A model matrix that stands a ring at its gate, facing the way the course arrives. */
function ringModel(ring, scale) {
  // The ring's facing is recomputed from the course order by the flight model; the
  // renderer only needs a stable frame: face the ring toward the bay's centre-ish
  // approach by using the direction from the previous gate, stored on the ring list.
  const facing = ring.facing ?? { x: 0, y: 0, z: 1 };
  const n = normalise3([facing.x, facing.y, facing.z]);
  const t = normalise3(cross3([0, 1, 0], n));
  const b = cross3(n, t);
  const m = new Float32Array(16);
  m[0] = t[0] * scale; m[1] = t[1] * scale; m[2] = t[2] * scale;
  m[4] = b[0] * scale; m[5] = b[1] * scale; m[6] = b[2] * scale;
  m[8] = n[0] * scale; m[9] = n[1] * scale; m[10] = n[2] * scale;
  m[12] = ring.x; m[13] = ring.y; m[14] = ring.z; m[15] = 1;
  return m;
}

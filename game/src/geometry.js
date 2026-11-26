// Golden Hour — a tiny triangle-soup builder shared by the aeroplane and the scenery.
// Everything visual in the game is flat-shaded boxes, frusta and discs pushed through
// this one class, so positions, normals, colours and alphas stay in step.

export class GeometryBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.alphas = [];
    this.indices = [];
  }

  /** Add one quad from corners a, b, c, d (counter-clockwise seen from the lit side). */
  quad(a, b, c, d, color, alpha = 1) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = d[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    const base = this.positions.length / 3;
    for (const p of [a, b, c, d]) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(nx, ny, nz);
      this.colors.push(color[0], color[1], color[2]);
      this.alphas.push(alpha);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Add an axis-aligned box centred at (cx, cy, cz) with the given size and colour. */
  box(cx, cy, cz, w, h, d, color, alpha = 1) {
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const y0 = cy - h / 2;
    const y1 = cy + h / 2;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    // Each face's corners run counter-clockwise seen from outside, so the computed
    // normal points out of the box.
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], color, alpha); // top
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color, alpha); // bottom
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color, alpha); // south
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color, alpha); // north
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color, alpha); // east
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color, alpha); // west
  }

  /**
   * Add a tapered box (frustum) running along z: a front rectangle at zFront with
   * half-sizes (fw, fh) around (cx, cyFront), a back rectangle at zBack with
   * half-sizes (bw, bh) around (cx, cyBack). Noses, tails and canopies are frusta.
   */
  frustum(cx, cyFront, cyBack, zFront, zBack, fw, fh, bw, bh, color, alpha = 1) {
    const f = {
      tl: [cx - fw, cyFront + fh, zFront],
      tr: [cx + fw, cyFront + fh, zFront],
      br: [cx + fw, cyFront - fh, zFront],
      bl: [cx - fw, cyFront - fh, zFront],
    };
    const b = {
      tl: [cx - bw, cyBack + bh, zBack],
      tr: [cx + bw, cyBack + bh, zBack],
      br: [cx + bw, cyBack - bh, zBack],
      bl: [cx - bw, cyBack - bh, zBack],
    };
    this.quad(f.tr, f.tl, b.tl, b.tr, color, alpha); // top
    this.quad(f.bl, f.br, b.br, b.bl, color, alpha); // bottom
    this.quad(f.br, f.tr, b.tr, b.br, color, alpha); // right
    this.quad(f.tl, f.bl, b.bl, b.tl, color, alpha); // left
    this.quad(f.br, f.bl, f.tl, f.tr, color, alpha); // front cap
    this.quad(b.tr, b.tl, b.bl, b.br, color, alpha); // back cap
  }

  /** Add a flat disc in the XY plane at z, facing -z, for propeller blur. */
  disc(cx, cy, cz, radius, color, alpha, segments = 20) {
    const base = this.positions.length / 3;
    this.positions.push(cx, cy, cz);
    this.normals.push(0, 0, -1);
    this.colors.push(color[0], color[1], color[2]);
    this.alphas.push(alpha);
    for (let i = 0; i <= segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      this.positions.push(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, cz);
      this.normals.push(0, 0, -1);
      this.colors.push(color[0], color[1], color[2]);
      this.alphas.push(alpha * 0.55);
    }
    for (let i = 1; i <= segments; i += 1) this.indices.push(base, base + i + 1, base + i);
  }

  /** Add a ring (annulus) in the XY plane at z: the gates of the course. */
  ring(cx, cy, cz, radius, tube, color, alpha = 1, segments = 28) {
    for (let i = 0; i < segments; i += 1) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      const outer0 = [cx + c0 * (radius + tube), cy + s0 * (radius + tube), cz];
      const inner0 = [cx + c0 * (radius - tube), cy + s0 * (radius - tube), cz];
      const outer1 = [cx + c1 * (radius + tube), cy + s1 * (radius + tube), cz];
      const inner1 = [cx + c1 * (radius - tube), cy + s1 * (radius - tube), cz];
      this.quad(outer0, outer1, inner1, inner0, color, alpha);
      const back = tube * 0.9;
      const outer0b = [outer0[0], outer0[1], cz + back];
      const outer1b = [outer1[0], outer1[1], cz + back];
      this.quad(outer1, outer0, outer0b, outer1b, color, alpha);
      const inner0b = [inner0[0], inner0[1], cz + back];
      const inner1b = [inner1[0], inner1[1], cz + back];
      this.quad(inner0, inner1, inner1b, inner0b, color, alpha);
    }
  }

  /** Freeze the soup into typed arrays for the renderer. */
  build() {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      colors: new Float32Array(this.colors),
      alphas: new Float32Array(this.alphas),
      indices: new Uint32Array(this.indices),
    };
  }
}

// Muse Observatory globe — geometry primitives.
//
// Ported (vanilla, de-Reacted) from reactbits InfiniteMenu: the Icosahedron is
// the sphere of tile *positions*; the tile face itself is a QuadGeometry (square)
// rather than the original DiscGeometry — squares are our campaign tiles, and
// muse tiles are the same quad circle-clipped in the fragment shader (decision F1).
// The quad keeps the disc's "centre + rim fan" topology (vertex 0 = centre) so the
// rotation-stretch effect in the vertex shader still works unchanged.

import { vec2, vec3 } from 'gl-matrix';

class Face {
  constructor(a, b, c) {
    this.a = a;
    this.b = b;
    this.c = c;
  }
}

class Vertex {
  constructor(x, y, z) {
    this.position = vec3.fromValues(x, y, z);
    this.normal = vec3.create();
    this.uv = vec2.create();
  }
}

export class Geometry {
  constructor() {
    this.vertices = [];
    this.faces = [];
  }

  addVertex(...args) {
    for (let i = 0; i < args.length; i += 3) {
      this.vertices.push(new Vertex(args[i], args[i + 1], args[i + 2]));
    }
    return this;
  }

  addFace(...args) {
    for (let i = 0; i < args.length; i += 3) {
      this.faces.push(new Face(args[i], args[i + 1], args[i + 2]));
    }
    return this;
  }

  get lastVertex() {
    return this.vertices[this.vertices.length - 1];
  }

  subdivide(divisions = 1) {
    const midPointCache = {};
    let f = this.faces;

    for (let div = 0; div < divisions; ++div) {
      const newFaces = new Array(f.length * 4);
      f.forEach((face, ndx) => {
        const mAB = this.#getMidPoint(face.a, face.b, midPointCache);
        const mBC = this.#getMidPoint(face.b, face.c, midPointCache);
        const mCA = this.#getMidPoint(face.c, face.a, midPointCache);
        const i = ndx * 4;
        newFaces[i + 0] = new Face(face.a, mAB, mCA);
        newFaces[i + 1] = new Face(face.b, mBC, mAB);
        newFaces[i + 2] = new Face(face.c, mCA, mBC);
        newFaces[i + 3] = new Face(mAB, mBC, mCA);
      });
      f = newFaces;
    }

    this.faces = f;
    return this;
  }

  spherize(radius = 1) {
    this.vertices.forEach((vertex) => {
      vec3.normalize(vertex.normal, vertex.position);
      vec3.scale(vertex.position, vertex.normal, radius);
    });
    return this;
  }

  get data() {
    return {
      vertices: this.vertexData,
      indices: this.indexData,
      normals: this.normalData,
      uvs: this.uvData,
    };
  }

  get vertexData() {
    return new Float32Array(this.vertices.flatMap((v) => Array.from(v.position)));
  }

  get normalData() {
    return new Float32Array(this.vertices.flatMap((v) => Array.from(v.normal)));
  }

  get uvData() {
    return new Float32Array(this.vertices.flatMap((v) => Array.from(v.uv)));
  }

  get indexData() {
    return new Uint16Array(this.faces.flatMap((f) => [f.a, f.b, f.c]));
  }

  #getMidPoint(ndxA, ndxB, cache) {
    const cacheKey = ndxA < ndxB ? `k_${ndxB}_${ndxA}` : `k_${ndxA}_${ndxB}`;
    if (Object.prototype.hasOwnProperty.call(cache, cacheKey)) return cache[cacheKey];
    const a = this.vertices[ndxA].position;
    const b = this.vertices[ndxB].position;
    const ndx = this.vertices.length;
    cache[cacheKey] = ndx;
    this.addVertex((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5);
    return ndx;
  }
}

export class IcosahedronGeometry extends Geometry {
  constructor() {
    super();
    const t = Math.sqrt(5) * 0.5 + 0.5;
    this.addVertex(
      -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0,
      0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t,
      t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1,
    ).addFace(
      0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
      1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
      3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
      4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
    );
  }
}

// A flat square in the XY plane: centre vertex + 4 corners, fan-triangulated.
// Same topology as the original DiscGeometry (vertex 0 = centre) so the vertex
// shader's `gl_VertexID > 0` rotation-stretch still applies to the rim only.
export class QuadGeometry extends Geometry {
  constructor(halfExtent = 1) {
    super();
    const h = halfExtent;
    this.addVertex(0, 0, 0); // 0 — centre
    this.lastVertex.uv[0] = 0.5;
    this.lastVertex.uv[1] = 0.5;

    // corners CCW: BL, BR, TR, TL  (uv matches position; frag flips y)
    const corners = [
      [-h, -h, 0, 0],
      [h, -h, 1, 0],
      [h, h, 1, 1],
      [-h, h, 0, 1],
    ];
    corners.forEach(([x, y, u, v]) => {
      this.addVertex(x, y, 0);
      this.lastVertex.uv[0] = u;
      this.lastVertex.uv[1] = v;
    });

    this.addFace(0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1);
  }
}

import * as THREE from "three";
import type { CartonPanel, CartonSpec, PanelRect } from "@/types/carton";
import type { SurfaceDieline } from "@/types/configurator";
import type { HingeAngles } from "@/types/unfold";
import { MM_TO_UNITS, cartonTopology, resolveHinge } from "./carton-topology";

const DEG = Math.PI / 180;

type Axis = "x" | "z";
type Uv = [number, number];

export type HingeEntry = {
  id: string;
  group: THREE.Group;
  axis: Axis;
  sign: 1 | -1;
  /** The joint's ASSEMBLED angle. Used only as a fallback when a pose omits it. */
  angleDeg: number;
  isLid: boolean;
};

export type CartonTree = {
  root: THREE.Group;
  hinges: HingeEntry[];
  /** Printed panel meshes keyed by id, for raycasting / debug. */
  meshes: Record<string, THREE.Mesh>;
  /**
   * The unprinted board: inner faces and cut edges. Separated so the flat
   * pose can render the blank as a printed sheet — see `setDielineView`.
   */
  boardMeshes: THREE.Mesh[];
  dispose: () => void;
};

/**
 * Dieline millimetres -> customization UV.
 *
 * BOTH axes are inverted, and the u inversion is the one that matters.
 *
 * A carton printed on the outside is folded with the printed face turned AWAY
 * from the blank's own top side — physically, the sheet is flipped over before
 * folding. Flipping a sheet reverses one axis, so the panel drawn on the left
 * of the printed dieline becomes the RIGHT-hand wall of the assembled box.
 *
 * Mapping u straight through (`x / width`) skips that flip, which leaves the
 * printed face outermost — correct — but read from behind, so every logo on
 * the assembled carton came out mirrored. Inverting u here applies the flip
 * once, coherently, for the whole sheet: adjacent panels still sample adjacent
 * canvas regions, so artwork stays continuous across every crease.
 *
 * The editor canvas and the production PDF are untouched: they remain the true
 * printed sheet, seen from the printed side. Only the mapping onto the folded
 * mesh changes. Panel ids and section metadata name the panel's FINAL position
 * on the box, which is why `LEFT` sits on the right of the dieline.
 */
function toUv(spec: CartonSpec, x: number, y: number): Uv {
  return [1 - x / spec.width, 1 - y / spec.height];
}

function rectUvs(spec: CartonSpec, coords: number[]): Uv[] {
  return Array.from({ length: coords.length / 2 }, (_, index) =>
    toUv(spec, coords[index * 2], coords[index * 2 + 1]),
  );
}

function faceGeometry(
  sourcePoints: THREE.Vector3[],
  sourceUvs: Uv[],
  targetNormal: THREE.Vector3,
) {
  let points = sourcePoints.map((point) => point.clone());
  let uvs = [...sourceUvs];
  const normal = new THREE.Vector3()
    .subVectors(points[1], points[0])
    .cross(new THREE.Vector3().subVectors(points[2], points[0]));

  if (normal.dot(targetNormal) < 0) {
    points = points.reverse();
    uvs = uvs.reverse();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points.flatMap(({ x, y, z }) => [x, y, z]), 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs.flat(), 2));
  const indices: number[] = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    indices.push(0, index, index + 1);
  }
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return { geometry, points };
}

function edgeGeometry(outer: THREE.Vector3[], inner: THREE.Vector3[]) {
  const positions: number[] = [];
  for (let index = 0; index < outer.length; index += 1) {
    const next = (index + 1) % outer.length;
    for (const point of [outer[index], outer[next], inner[next], outer[index], inner[next], inner[index]]) {
      positions.push(point.x, point.y, point.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

type BuildContext = {
  spec: CartonSpec;
  outerMaterial: THREE.Material;
  innerMaterial: THREE.Material;
  edgeMaterial: THREE.Material;
  meshes: Record<string, THREE.Mesh>;
  boardMeshes: THREE.Mesh[];
  geometries: THREE.BufferGeometry[];
};

/**
 * Does this (points, uvs) pairing read the right way round from `outward`?
 *
 * Chirality is not winding and not the normal: it is whether the map from
 * (u, v) to (screen-right, screen-up) preserves orientation for someone
 * looking at the printed face. Compare the signed area of the first triangle
 * in UV space against its signed area as that viewer sees it.
 */
function uvHandedness(points: THREE.Vector3[], uvs: Uv[], outward: THREE.Vector3): number {
  const forward = outward.clone().normalize();
  const hint = Math.abs(forward.y) > 0.9
    ? new THREE.Vector3(0, 0, -1)
    : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(hint, forward).normalize();
  const up = new THREE.Vector3().crossVectors(forward, right).normalize();
  const area = (a: number[], b: number[], c: number[]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  const screen = points.slice(0, 3).map((point) => [point.dot(right), point.dot(up)]);
  const texture = uvs.slice(0, 3).map((uv) => [uv[0], uv[1]]);
  return Math.sign(area(texture[0], texture[1], texture[2])) * Math.sign(area(screen[0], screen[1], screen[2]));
}

/** Builds a real paperboard panel: printed face, plain inner face, and exposed edge. */
function addThickPanel(
  context: BuildContext,
  parent: THREE.Group,
  id: string,
  outerPoints: THREE.Vector3[],
  sourceUvs: Uv[],
  outward: THREE.Vector3,
) {
  const normal = outward.clone().normalize();
  // The clamshell's gussets, rim strips, locking ears and tabs take a few
  // corners of a neighbouring panel's rect so they carry a plausible slice of
  // print. Those corner lists were authored per shape, but the geometry
  // mirrors across `side` and again between the base tray and the lid while
  // the lists did not — so half of them came out mirrored. They have no
  // continuity contract with any neighbour, so normalising the pairing here
  // beats hand-maintaining eight coordinate lists that each have to know
  // which tray and which side they are on. Panels that already read correctly
  // are left exactly as authored.
  const uvs = uvHandedness(outerPoints, sourceUvs, normal) < 0
    ? [...sourceUvs].reverse()
    : sourceUvs;
  const innerPoints = outerPoints.map((point) =>
    point.clone().addScaledVector(normal, -context.spec.boardThickness),
  );
  const outerFace = faceGeometry(outerPoints, uvs, normal);
  const innerFace = faceGeometry(innerPoints, uvs, normal.clone().negate());
  // Keep identical vertex order on both loops. The two face geometries may
  // reverse their own winding, which must not scramble the board-edge quads.
  const edge = edgeGeometry(outerPoints, innerPoints);
  context.geometries.push(outerFace.geometry, innerFace.geometry, edge);

  const outerMesh = new THREE.Mesh(outerFace.geometry, context.outerMaterial);
  outerMesh.name = id;
  outerMesh.castShadow = true;
  outerMesh.receiveShadow = true;

  const innerMesh = new THREE.Mesh(innerFace.geometry, context.innerMaterial);
  innerMesh.name = `${id}__inner`;
  innerMesh.castShadow = true;
  innerMesh.receiveShadow = true;

  const edgeMesh = new THREE.Mesh(edge, context.edgeMaterial);
  edgeMesh.name = `${id}__board_edge`;
  edgeMesh.castShadow = true;
  edgeMesh.receiveShadow = true;

  parent.add(outerMesh, innerMesh, edgeMesh);
  context.meshes[id] ??= outerMesh;
  context.boardMeshes.push(innerMesh, edgeMesh);
}

function chamferedLoop(width: number, depth: number, chamfer: number, y: number) {
  const x = width / 2;
  const z = depth / 2;
  return [
    new THREE.Vector3(-x + chamfer, y, z),
    new THREE.Vector3(x - chamfer, y, z),
    new THREE.Vector3(x, y, z - chamfer),
    new THREE.Vector3(x, y, -z + chamfer),
    new THREE.Vector3(x - chamfer, y, -z),
    new THREE.Vector3(-x + chamfer, y, -z),
    new THREE.Vector3(-x, y, -z + chamfer),
    new THREE.Vector3(-x, y, z - chamfer),
  ];
}

function panelById(spec: CartonSpec, id: string) {
  const panel = spec.panels.find((candidate) => candidate.id === id);
  if (!panel) throw new Error(`Carton spec "${spec.id}" is missing panel "${id}".`);
  return panel;
}

function horizontalUvs(
  spec: CartonSpec,
  rect: PanelRect,
  points: THREE.Vector3[],
  physicalWidth: number,
  physicalDepth: number,
  frontAtBottom: boolean,
) {
  return points.map((point) => {
    const x = rect.x + (point.x / physicalWidth + 0.5) * rect.w;
    const zRatio = point.z / physicalDepth + 0.5;
    const y = rect.y + (frontAtBottom ? zRatio : 1 - zRatio) * rect.h;
    return toUv(spec, x, y);
  });
}

function baseWallUv(spec: CartonSpec, segment: number, rect: PanelRect) {
  const left = rect.x;
  const right = rect.x + rect.w;
  const top = rect.y;
  const bottom = rect.y + rect.h;
  const coordsBySegment: Record<number, number[]> = {
    0: [left, top, right, top, right, bottom, left, bottom],
    2: [left, bottom, left, top, right, top, right, bottom],
    4: [right, bottom, left, bottom, left, top, right, top],
    6: [right, top, right, bottom, left, bottom, left, top],
  };
  return rectUvs(spec, coordsBySegment[segment] ?? coordsBySegment[segment < 4 ? 2 : 6]);
}

function lidWallUv(spec: CartonSpec, segment: number, rect: PanelRect) {
  const left = rect.x;
  const right = rect.x + rect.w;
  const top = rect.y;
  const bottom = rect.y + rect.h;
  const coordsBySegment: Record<number, number[]> = {
    0: [left, bottom, right, bottom, right, top, left, top],
    2: [left, top, left, bottom, right, bottom, right, top],
    4: [right, top, left, top, left, bottom, right, bottom],
    6: [right, bottom, right, top, left, top, left, bottom],
  };
  return rectUvs(spec, coordsBySegment[segment] ?? coordsBySegment[segment < 4 ? 2 : 6]);
}

function segmentPanelId(kind: "base" | "lid", segment: number) {
  const prefix = kind === "base" ? "BASE" : "LID";
  if (segment === 0) return `${prefix}_FRONT`;
  if (segment >= 1 && segment <= 3) return `${prefix}_RIGHT`;
  if (segment === 4) return `${prefix}_BACK`;
  return `${prefix}_LEFT`;
}

function addTrayWalls(
  context: BuildContext,
  parent: THREE.Group,
  kind: "base" | "lid",
  innerLoop: THREE.Vector3[],
  rimLoop: THREE.Vector3[],
) {
  const trayCentre = rimLoop
    .reduce((sum, point) => sum.add(point), new THREE.Vector3())
    .multiplyScalar(1 / rimLoop.length);
  for (let segment = 0; segment < innerLoop.length; segment += 1) {
    const next = (segment + 1) % innerLoop.length;
    const id = segmentPanelId(kind, segment);
    const rect = panelById(context.spec, id).rect;
    const points = [innerLoop[segment], innerLoop[next], rimLoop[next], rimLoop[segment]];
    const centre = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(0.25);
    const outward = new THREE.Vector3(
      centre.x - trayCentre.x,
      0,
      centre.z - trayCentre.z,
    ).normalize();
    const uvs = kind === "base"
      ? baseWallUv(context.spec, segment, rect)
      : lidWallUv(context.spec, segment, rect);
    addThickPanel(context, parent, id, points, uvs, outward);
  }
}

function localize(points: THREE.Vector3[], pivot: THREE.Vector3) {
  return points.map((point) => point.clone().sub(pivot));
}

function addFrontRim(
  context: BuildContext,
  parent: THREE.Group,
  kind: "base" | "lid",
  pivot: THREE.Vector3 | null,
) {
  const shell = context.spec.clamshell!;
  const halfWidth = shell.width / 2;
  const front = shell.depth / 2;
  const rim = shell.rimDepth;
  const seam = shell.seamHeight;
  const isLid = kind === "lid";
  const y = seam + (isLid ? context.spec.boardThickness * 0.65 : -context.spec.boardThickness * 0.65);
  const region = panelById(context.spec, `${kind === "base" ? "BASE" : "LID"}_FRONT`).rect;
  const rawStrip = [
    new THREE.Vector3(-halfWidth - 2, y, front),
    new THREE.Vector3(halfWidth + 2, y, front),
    new THREE.Vector3(halfWidth + 3, y, front + rim),
    new THREE.Vector3(-halfWidth - 3, y, front + rim),
  ];
  const strip = pivot ? localize(rawStrip, pivot) : rawStrip;
  addThickPanel(
    context,
    parent,
    `${kind.toUpperCase()}_RIM`,
    strip,
    rectUvs(context.spec, [region.x, region.y, region.x + region.w, region.y, region.x + region.w, region.y + 7, region.x, region.y + 7]),
    new THREE.Vector3(0, isLid ? -1 : 1, 0),
  );

  if (isLid) return;

  const skirtRaw = [
    new THREE.Vector3(-halfWidth - 3, seam - shell.frontLipDrop, front + rim),
    new THREE.Vector3(halfWidth + 3, seam - shell.frontLipDrop, front + rim),
    new THREE.Vector3(halfWidth + 3, seam, front + rim),
    new THREE.Vector3(-halfWidth - 3, seam, front + rim),
  ];
  addThickPanel(
    context,
    parent,
    "BASE_LOCKING_SKIRT",
    skirtRaw,
    rectUvs(context.spec, [region.x, region.y + region.h - 8, region.x + region.w, region.y + region.h - 8, region.x + region.w, region.y + region.h, region.x, region.y + region.h]),
    new THREE.Vector3(0, 0, 1),
  );

  for (const side of [-1, 1] as const) {
    const x = side * (halfWidth + 3);
    const ear = [
      new THREE.Vector3(x, seam, front + rim),
      new THREE.Vector3(x + side * 2, seam - 2, front + rim - 1),
      new THREE.Vector3(x, seam - shell.frontLipDrop, front + rim),
    ];
    addThickPanel(
      context,
      parent,
      `BASE_LOCK_EAR_${side < 0 ? "LEFT" : "RIGHT"}`,
      ear,
      rectUvs(context.spec, [region.x, region.y, region.x + region.w, region.y, region.x, region.y + region.h]),
      new THREE.Vector3(0, 0, 1),
    );
  }
}

function addLidSideLocks(context: BuildContext, lid: THREE.Group, pivot: THREE.Vector3) {
  const shell = context.spec.clamshell!;
  const sideRegion = panelById(context.spec, "LID_RIGHT").rect;
  for (const side of [-1, 1] as const) {
    const x = side * (shell.width / 2 + 0.7);
    const front = shell.depth / 2;
    const raw = [
      new THREE.Vector3(x, shell.seamHeight + 7, front - 19),
      new THREE.Vector3(x, shell.seamHeight, front + 2),
      new THREE.Vector3(x, shell.seamHeight + 1, front - 11),
    ];
    addThickPanel(
      context,
      lid,
      `LID_LOCK_TAB_${side < 0 ? "LEFT" : "RIGHT"}`,
      localize(raw, pivot),
      rectUvs(context.spec, [sideRegion.x, sideRegion.y, sideRegion.x + sideRegion.w, sideRegion.y, sideRegion.x, sideRegion.y + sideRegion.h]),
      new THREE.Vector3(side, 0, 0),
    );
  }
}

/**
 * Corner gussets are the doubled-over triangles visible on real self-locking
 * food cartons. Besides improving the silhouette, the overlapping board and
 * diagonal edge catch light differently and stop the walls reading as four
 * featureless planes.
 */
function addFoldGussets(
  context: BuildContext,
  parent: THREE.Group,
  kind: "base" | "lid",
  pivot: THREE.Vector3 | null,
) {
  const shell = context.spec.clamshell!;
  const isLid = kind === "lid";
  const innerWidth = isLid ? shell.lidTopWidth : shell.baseFloorWidth;
  const innerDepth = isLid ? shell.lidTopDepth : shell.baseFloorDepth;
  const innerY = isLid ? shell.height : 0;
  const seamY = shell.seamHeight;

  for (const side of [-1, 1] as const) {
    const panel = panelById(
      context.spec,
      `${isLid ? "LID" : "BASE"}_${side < 0 ? "LEFT" : "RIGHT"}`,
    ).rect;
    for (const end of [-1, 1] as const) {
      const seamX = side * (shell.width / 2 + 0.35);
      const innerX = side * (innerWidth / 2 + 0.35);
      const seamZ = end * (shell.depth / 2 - shell.rimChamfer - 1);
      const alongZ = end * (shell.depth / 2 - 25);
      const innerZ = end * (innerDepth / 2 - shell.panelChamfer - 1);
      const raw = [
        new THREE.Vector3(seamX, seamY, seamZ),
        new THREE.Vector3(seamX, seamY, alongZ),
        new THREE.Vector3(innerX, innerY, innerZ),
      ];
      const points = pivot ? localize(raw, pivot) : raw;
      const front = end > 0;
      const left = panel.x;
      const right = panel.x + panel.w;
      const top = panel.y;
      const bottom = panel.y + panel.h;
      addThickPanel(
        context,
        parent,
        `${isLid ? "LID" : "BASE"}_GUSSET_${side < 0 ? "LEFT" : "RIGHT"}_${front ? "FRONT" : "BACK"}`,
        points,
        rectUvs(
          context.spec,
          front
            ? [left, bottom, right, bottom, right, top]
            : [right, top, left, top, left, bottom],
        ),
        new THREE.Vector3(side, 0, 0),
      );
    }
  }
}

function buildTaperedClamshell(context: BuildContext): CartonTree {
  const shell = context.spec.clamshell!;
  const root = new THREE.Group();
  root.name = "CARTON_ROOT";
  root.scale.setScalar(MM_TO_UNITS);

  const base = new THREE.Group();
  base.name = "BASE_TRAY";
  root.add(base);

  const baseFloor = chamferedLoop(
    shell.baseFloorWidth,
    shell.baseFloorDepth,
    shell.panelChamfer,
    0,
  );
  const seamLoop = chamferedLoop(
    shell.width,
    shell.depth,
    shell.rimChamfer,
    shell.seamHeight,
  );
  const baseRect = panelById(context.spec, "BASE").rect;
  addThickPanel(
    context,
    base,
    "BASE",
    baseFloor,
    horizontalUvs(
      context.spec,
      baseRect,
      baseFloor,
      shell.baseFloorWidth,
      shell.baseFloorDepth,
      true,
    ),
    new THREE.Vector3(0, -1, 0),
  );
  addTrayWalls(context, base, "base", baseFloor, seamLoop);
  addFoldGussets(context, base, "base", null);
  addFrontRim(context, base, "base", null);

  const pivot = new THREE.Vector3(0, shell.seamHeight, -shell.depth / 2);
  const lid = new THREE.Group();
  lid.name = "LID_ASSEMBLY_HINGE";
  lid.position.copy(pivot);
  root.add(lid);

  const lidTopWorld = chamferedLoop(
    shell.lidTopWidth,
    shell.lidTopDepth,
    shell.panelChamfer,
    shell.height,
  );
  const lidSeamWorld = chamferedLoop(
    shell.width,
    shell.depth,
    shell.rimChamfer,
    shell.seamHeight,
  );
  const lidTop = localize(lidTopWorld, pivot);
  const lidSeam = localize(lidSeamWorld, pivot);
  const lidRect = panelById(context.spec, "LID_TOP").rect;
  addThickPanel(
    context,
    lid,
    "LID_TOP",
    lidTop,
    horizontalUvs(
      context.spec,
      lidRect,
      lidTopWorld,
      shell.lidTopWidth,
      shell.lidTopDepth,
      false,
    ),
    new THREE.Vector3(0, 1, 0),
  );
  addTrayWalls(context, lid, "lid", lidTop, lidSeam);
  addFoldGussets(context, lid, "lid", pivot);
  addFrontRim(context, lid, "lid", pivot);
  addLidSideLocks(context, lid, pivot);

  const hingeGeometry = new THREE.CylinderGeometry(
    context.spec.boardThickness * 0.72,
    context.spec.boardThickness * 0.72,
    shell.width - shell.rimChamfer * 2,
    12,
  );
  hingeGeometry.rotateZ(Math.PI / 2);
  context.geometries.push(hingeGeometry);
  const hingeMesh = new THREE.Mesh(hingeGeometry, context.edgeMaterial);
  hingeMesh.name = "REAR_SCORE_HINGE";
  hingeMesh.position.copy(pivot);
  hingeMesh.castShadow = true;
  root.add(hingeMesh);

  const hinges: HingeEntry[] = [
    {
      id: "LID_ASSEMBLY",
      group: lid,
      axis: "x",
      sign: 1,
      angleDeg: context.spec.lidClosedAngle,
      isLid: true,
    },
  ];

  return {
    root,
    hinges,
    meshes: context.meshes,
    boardMeshes: context.boardMeshes,
    dispose: () => context.geometries.forEach((geometry) => geometry.dispose()),
  };
}

/** Flat rectangular panel used by the generic folded-carton fallback. */
function panelGeometry(panel: CartonPanel, spec: CartonSpec) {
  const { w, h, x, y } = panel.rect;
  const positions = [
    new THREE.Vector3(-w / 2, 0, -h / 2),
    new THREE.Vector3(w / 2, 0, -h / 2),
    new THREE.Vector3(w / 2, 0, h / 2),
    new THREE.Vector3(-w / 2, 0, h / 2),
  ];
  return faceGeometry(
    positions,
    rectUvs(spec, [x, y, x + w, y, x + w, y + h, x, y + h]),
    new THREE.Vector3(0, 1, 0),
  ).geometry;
}

function buildGenericCarton(context: BuildContext): CartonTree {
  const { root: rootPanel, childrenOf: children } = cartonTopology(context.spec);
  const hinges: HingeEntry[] = [];

  function build(panel: CartonPanel, parent: CartonPanel | null): THREE.Group {
    const hingeGroup = new THREE.Group();
    hingeGroup.name = `${panel.id}__hinge`;
    const holder = new THREE.Group();
    holder.name = panel.id;
    const cx = panel.rect.x + panel.rect.w / 2;
    const cy = panel.rect.y + panel.rect.h / 2;

    if (parent) {
      const { axis, sign, hx, hy } = resolveHinge(parent, panel);
      const px = parent.rect.x + parent.rect.w / 2;
      const py = parent.rect.y + parent.rect.h / 2;
      hingeGroup.position.set(hx - px, 0, hy - py);
      holder.position.set(cx - hx, 0, cy - hy);
      const isLid = panel.hinge === "lid";
      hinges.push({
        id: panel.id,
        group: hingeGroup,
        axis,
        sign,
        angleDeg: isLid ? context.spec.lidClosedAngle : (panel.angle ?? 0),
        isLid,
      });
    }

    const geometry = panelGeometry(panel, context.spec);
    context.geometries.push(geometry);
    const outer = new THREE.Mesh(geometry, context.outerMaterial);
    outer.name = panel.id;
    outer.castShadow = true;
    outer.receiveShadow = true;
    const inner = new THREE.Mesh(geometry, context.innerMaterial);
    inner.name = `${panel.id}__inner`;
    inner.position.y = context.spec.boardThickness;
    inner.castShadow = true;
    holder.add(outer, inner);
    context.meshes[panel.id] = outer;
    context.boardMeshes.push(inner);

    for (const child of children.get(panel.id) ?? []) holder.add(build(child, panel));
    hingeGroup.add(holder);
    return hingeGroup;
  }

  const root = new THREE.Group();
  root.name = "CARTON_ROOT";
  root.scale.setScalar(MM_TO_UNITS);
  root.add(build(rootPanel, null));
  return {
    root,
    hinges,
    meshes: context.meshes,
    boardMeshes: context.boardMeshes,
    dispose: () => context.geometries.forEach((geometry) => geometry.dispose()),
  };
}

export function buildCartonTree(
  spec: CartonSpec,
  outerMaterial: THREE.Material,
  innerMaterial: THREE.Material,
  edgeMaterial: THREE.Material = innerMaterial,
): CartonTree {
  const context: BuildContext = {
    spec,
    outerMaterial,
    innerMaterial,
    edgeMaterial,
    meshes: {},
    boardMeshes: [],
    geometries: [],
  };
  return spec.clamshell ? buildTaperedClamshell(context) : buildGenericCarton(context);
}

/**
 * Writes an absolute pose onto the hinge tree.
 *
 * This is the single structural entry point: open/close, progressive
 * unfolding and the flat dieline are all just different angle maps, which is
 * why there is no separate `fold` scalar any more. A hinge missing from the
 * pose falls back to its assembled angle.
 */
export function applyHingeAngles(tree: CartonTree, angles: HingeAngles) {
  for (const hinge of tree.hinges) {
    const degrees = angles[hinge.id] ?? hinge.angleDeg;
    const value = hinge.sign * degrees * DEG;
    if (hinge.axis === "x") hinge.group.rotation.x = value;
    else hinge.group.rotation.z = value;
  }
}

/**
 * Dieline view: render the flat blank as its printed sheet.
 *
 * A carton printed on the outside folds AWAY from its print, so on the
 * flattened blank the printed face is the underside and the unprinted inner
 * board is what faces the camera. That is physically correct but useless as a
 * dieline preview, so at the flat pose we drop the board faces and show the
 * printed sheet — which then reads exactly like the 2D editor canvas
 * (see `tests/unfold/flat-dieline.test.ts`).
 */
export function setDielineView(tree: CartonTree, dielineView: boolean) {
  for (const mesh of tree.boardMeshes) mesh.visible = !dielineView;
}

/** Cut and crease paths for the Konva editor, scaled into editor pixels. */
export function dielineOverlay(
  spec: CartonSpec,
  editorWidth: number,
  editorHeight: number,
): SurfaceDieline {
  const sx = editorWidth / spec.width;
  const sy = editorHeight / spec.height;
  const scalePath = (points: { x: number; y: number }[]) =>
    points.flatMap(({ x, y }) => [x * sx, y * sy]);

  if (spec.dieline) {
    return {
      cuts: spec.dieline.cuts.map((cut) => ({
        points: scalePath(cut.points),
        closed: cut.closed ?? false,
      })),
      creases: spec.dieline.creases.map((crease) => ({
        points: scalePath(crease.points),
        closed: crease.closed ?? false,
      })),
      bleed: (spec.dieline.bleed ?? []).map((path) => ({
        points: scalePath(path.points),
        closed: path.closed ?? false,
      })),
    };
  }

  const byId = new Map(spec.panels.map((panel) => [panel.id, panel]));
  const cuts = spec.panels.map((panel) => {
    const { x, y, w, h } = panel.rect;
    return {
      points: scalePath([
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ]),
      closed: true,
    };
  });
  const creases: { points: number[]; closed: boolean }[] = [];
  for (const panel of spec.panels) {
    if (!panel.parent) continue;
    const parent = byId.get(panel.parent);
    if (!parent) continue;
    const { axis, hx, hy } = resolveHinge(parent, panel);
    const points = axis === "x"
      ? [{ x: panel.rect.x, y: hy }, { x: panel.rect.x + panel.rect.w, y: hy }]
      : [{ x: hx, y: panel.rect.y }, { x: hx, y: panel.rect.y + panel.rect.h }];
    creases.push({ points: scalePath(points), closed: false });
  }
  return { cuts, creases };
}

/** Physical size of the assembled box, for camera framing. */
export function cartonBounds(spec: CartonSpec) {
  if (spec.clamshell) {
    return {
      width: (spec.clamshell.width + spec.clamshell.rimDepth * 2) * MM_TO_UNITS,
      depth: (spec.clamshell.depth + spec.clamshell.rimDepth) * MM_TO_UNITS,
    };
  }
  const root = spec.panels.find((panel) => !panel.parent)!;
  return {
    width: root.rect.w * MM_TO_UNITS,
    depth: root.rect.h * MM_TO_UNITS,
  };
}

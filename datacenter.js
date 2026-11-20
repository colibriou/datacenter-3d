import * as THREE from 'three';

export const room = { left: -6, right: 6, front: 7, back: -9, ceiling: 3.3 };

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const surface = (color, roughness = .78, metalness = .05) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

export function buildDatacenter(scene) {
  const hall = new THREE.Group();
  hall.name = 'Salle datacenter';
  scene.add(hall);

  const wall = surface(0xadb7c2);
  const trim = surface(0x3a4553, .62, .25);
  const ceiling = surface(0x434d5a, .86);
  const steel = surface(0x596574, .52, .42);
  const cabinet = surface(0x2d3540, .62, .26);
  const vent = surface(0x171f2a, .91);
  const diffuser = new THREE.MeshBasicMaterial({ color: 0xe5f6ff });
  const cable = surface(0x243a57);
  const boxes = new Map();

  function box(material, x, y, z, width, height, depth) {
    if (!boxes.has(material)) boxes.set(material, []);
    boxes.get(material).push([x, y, z, width, height, depth]);
  }

  const { left, right, back, front, ceiling: height } = room;
  const length = front - back;
  const width = right - left;
  const middle = (back + front) / 2;

  box(trim, 0, -.065, middle, width, .10, length);
  const tilePitch = .5;
  const tileColumns = width / tilePitch;
  const tileRows = length / tilePitch;
  const tiles = new THREE.InstancedMesh(boxGeometry, surface(0xffffff, .83), tileColumns * tileRows);
  const transform = new THREE.Object3D();
  const swatch = new THREE.Color();
  transform.scale.set(.496, .022, .496);
  for (let row = 0; row < tileRows; row++) {
    for (let col = 0; col < tileColumns; col++) {
      const index = row * tileColumns + col;
      transform.position.set(left + (col + .5) * tilePitch, -.011, back + (row + .5) * tilePitch);
      transform.updateMatrix();
      tiles.setMatrixAt(index, transform.matrix);
      const shade = .40 + ((row * 13 + col * 29) % 11) * .005;
      swatch.setRGB(shade, shade + .026, shade + .051);
      tiles.setColorAt(index, swatch);
    }
  }
  tiles.receiveShadow = true;
  hall.add(tiles);

  box(wall, 0, height / 2, back - .06, width + .12, height, .12);
  box(wall, 0, height / 2, front + .06, width + .12, height, .12);
  box(ceiling, 0, height + .06, middle, width, .12, length);
  for (const side of [left, right]) {
    const sign = Math.sign(side);
    box(wall, side + sign * .06, height / 2, middle, .12, height, length);
    box(trim, side - sign * .013, .11, middle, .027, .22, length);
    for (const z of [-7, -3, 1, 5]) box(steel, side - sign * .058, height / 2, z, .12, height, .20);
  }
  box(trim, 0, .11, back + .015, width, .22, .03);
  box(trim, 0, .11, front - .015, width, .22, .03);

  // Suspended linear lights and cable ladders follow the rack aisles.
  for (const x of [-4, 0, 4]) {
    for (const z of [-6.5, -2, 2.5, 5.4]) {
      box(trim, x, height - .09, z, .26, .09, 2.5);
      box(diffuser, x, height - .143, z, .20, .018, 2.37);
    }
    for (const offset of [-.22, .22]) {
      box(steel, x + 1.27 + offset, 2.86, -1, .032, .095, 13.5);
    }
    for (let rung = -7; rung <= 5; rung += .5) box(steel, x + 1.27, 2.82, rung, .44, .025, .028);
    box(cable, x + 1.22, 2.87, -1, .21, .065, 13.4);
  }

  const perforated = new THREE.InstancedMesh(boxGeometry, trim, 3 * 3 * 12);
  let grilleBar = 0;
  for (const x of [-3.75, .25, 3.75]) {
    for (const z of [-5.25, -3.75, 1.75]) {
      box(vent, x, -.018, z, .47, .037, .47);
      for (let stripe = 0; stripe < 12; stripe++) {
        transform.position.set(x - .211 + stripe * .038, .001, z);
        transform.scale.set(.016, .004, .45);
        transform.updateMatrix();
        perforated.setMatrixAt(grilleBar++, transform.matrix);
      }
    }
  }
  perforated.receiveShadow = true;
  hall.add(perforated);

  // Additional fixed cabinets establish the scale of the hall.
  const grilles = [];
  for (const z of [-6.45, -3.65]) {
    for (const x of [-4.3, -3.55, -2.8, 2.8, 3.55, 4.3]) {
      box(cabinet, x, 1.04, z, .65, 2, 1);
      box(trim, x, .055, z, .63, .11, .94);
      box(steel, x, 1.99, z + .51, .60, .10, .04);
      box(vent, x, 1.02, z + .515, .58, 1.79, .037);
      box(steel, x + .235, 1.02, z + .547, .018, .23, .032);
      for (let row = 0; row < 20; row++) grilles.push([x - .021, .20 + row * .083, z + .542]);
    }
  }
  const cabinetVents = new THREE.InstancedMesh(boxGeometry, trim, grilles.length);
  transform.scale.set(.44, .012, .012);
  grilles.forEach(([x, y, z], index) => {
    transform.position.set(x, y, z);
    transform.updateMatrix();
    cabinetVents.setMatrixAt(index, transform.matrix);
  });
  hall.add(cabinetVents);

  const cooling = surface(0x84919e, .6, .13);
  for (const x of [-1.2, 1.2]) {
    box(cooling, x, 1.31, back + .45, .82, 2.62, .90);
    box(vent, x, 1.54, back + .912, .72, 1.87, .03);
    for (let row = 0; row < 14; row++) box(steel, x, .72 + row * .122, back + .934, .68, .026, .035);
  }

  for (const [x, z] of [[-3.9, -4.7], [3.9, -4.7], [-3.9, 2.4], [3.9, 2.4]]) {
    const light = new THREE.PointLight(0xe8f2ff, 19, 8, 2);
    light.position.set(x, 3.04, z);
    hall.add(light);
  }
  for (const [material, placements] of boxes) {
    const objects = new THREE.InstancedMesh(boxGeometry, material, placements.length);
    placements.forEach(([x, y, z, w, h, d], index) => {
      transform.position.set(x, y, z);
      transform.scale.set(w, h, d);
      transform.updateMatrix();
      objects.setMatrixAt(index, transform.matrix);
    });
    objects.receiveShadow = true;
    hall.add(objects);
  }
}

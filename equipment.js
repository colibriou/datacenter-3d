import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const layout = {
  switch: { height: .038 },
  'server-1u': { height: .038, rows: 1, columns: 8 },
  'server-2u': { height: .080, rows: 2, columns: 8 },
  'storage-3u': { height: .127, rows: 4, columns: 4 },
};

const finishes = {
  bezel: new THREE.MeshStandardMaterial({ color: 0x242b32, metalness: .46, roughness: .58 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x929da7, metalness: .58, roughness: .43 }),
  tray: new THREE.MeshStandardMaterial({ color: 0x444b55, metalness: .30, roughness: .62 }),
  recess: new THREE.MeshStandardMaterial({ color: 0x121519, roughness: .88 }),
  latch: new THREE.MeshStandardMaterial({ color: 0x9c3620, metalness: .22, roughness: .55 }),
  contact: new THREE.MeshStandardMaterial({ color: 0xc5974e, metalness: .48, roughness: .43 }),
};
const lightMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
const lightGeometry = new THREE.PlaneGeometry(1, 1);
const designs = new Map();
const green = new THREE.Color(0x55f7a0);
const blue = new THREE.Color(0x64aeff);
const amber = new THREE.Color(0xffab4f);

export function buildFront(kind) {
  const { height, rows, columns } = layout[kind];
  const pieces = new Map();
  const lamps = [];
  function box(finish, x, y, z, w, h, d) {
    if (!pieces.has(finish)) pieces.set(finish, []);
    pieces.get(finish).push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  }
  function lamp(x, y, color, steady = false) {
    box('recess', x, y, .453, .004, .0027, .0018);
    lamps.push({ x, y, color, steady });
  }
  box('bezel', 0, 0, .444, .389, height, .006);
  for (const x of [-.189, .189]) {
    box('metal', x, 0, .448, .006, height * .86, .002);
    for (const y of [-height * .31, height * .31]) box('recess', x, y, .450, .003, .003, .001);
  }

  if (kind === 'switch') {
    box('metal', 0, 0, .4475, .371, height * .86, .002);
    for (let bank = 0; bank < 4; bank++) {
      for (let row = 0; row < 2; row++) for (let port = 0; port < 6; port++) {
        const x = -.151 + bank * .075 + port * .0107;
        const y = row ? -.009 : .008;
        box('tray', x, y, .449, .0103, .0099, .002);
        box('recess', x, y, .451, .0082, .0072, .002);
        box('contact', x, y + .0025, .4525, .0063, .001, .001);
        lamp(x, y - .006, green);
      }
    }
    for (let i = 0; i < 4; i++) {
      const x = .143 + (i % 2) * .019;
      const y = i < 2 ? -.009 : .008;
      box('tray', x, y, .450, .016, .010, .003);
      box('recess', x, y, .452, .012, .006, .002);
      lamp(x, y - .0065, blue);
    }
    lamp(-.177, .008, green, true);
  } else {
    const cellWidth = .335 / columns;
    const cellHeight = (height - .006) / rows;
    const storage = kind === 'storage-3u';
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const x = -.177 + cellWidth * (col + .5);
      const y = -height / 2 + .003 + cellHeight * (row + .5);
      box('recess', x, y, .448, cellWidth - .001, cellHeight - .0015, .003);
      box('tray', x, y, .450, cellWidth - .004, cellHeight - .0045, .002);
      box(storage ? 'latch' : 'metal', x - cellWidth * .31, y, .453, .007, cellHeight * .62, .004);
      for (let slit = -2; slit <= 2; slit++) {
        box('recess', x + cellWidth * .08, y + slit * cellHeight * .128, .452,
          cellWidth * .39, .00135, .0012);
      }
      lamp(x + cellWidth * .34, y + cellHeight * .22, green);
      lamp(x + cellWidth * .34, y - cellHeight * .22, storage ? amber : blue);
    }
    box('recess', .174, 0, .450, .015, height * .9, .003);
    box('metal', .174, 0, .453, .006, .006, .003);
    box('metal', .174, -.010, .453, .008, .004, .002);
    lamp(.174, .009, green, true);
  }
  const surfaces = [...pieces].map(([finish, geometries]) => {
    const combined = mergeGeometries(geometries);
    geometries.forEach(geometry => geometry.dispose());
    return [combined, finishes[finish]];
  });
  return { surfaces, lamps };
}

export function detailEquipment(server, index) {
  const kind = server.userData.kind;
  if (!layout[kind]) return () => {};
  let { lamps } = server.userData;
  if (lamps) {
    lamps = lamps.map(([x, y, color, steady]) => ({ x, y, color: new THREE.Color(color), steady }));
  } else {
    if (!designs.has(kind)) designs.set(kind, buildFront(kind));
    const design = designs.get(kind);
    lamps = design.lamps;
    for (const [geometry, material] of design.surfaces) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      server.add(mesh);
    }
  }
  const lights = new THREE.InstancedMesh(lightGeometry, lightMaterial, lamps.length);
  lights.raycast = () => {};
  const transform = new THREE.Object3D();
  transform.scale.set(.0033, .0019, 1);
  lamps.forEach(({ x, y, color }, i) => {
    transform.position.set(x, y, .454);
    transform.updateMatrix();
    lights.setMatrixAt(i, transform.matrix);
    lights.setColorAt(i, color);
  });
  lights.instanceColor.setUsage(THREE.DynamicDrawUsage);
  server.add(lights);
  const tint = new THREE.Color();
  let lastTick = -1;
  let lastPower = null;
  return (time, powered) => {
    const tick = Math.floor(time * 24);
    if (tick === lastTick && powered === lastPower) return;
    lastTick = tick;
    lastPower = powered;
    lamps.forEach(({ color, steady }, i) => {
      const period = 5 + (i * 7 + index * 11) % 17;
      const phase = (tick + i * 29 + index * 31) % period;
      const active = steady || phase < 2 + (i % 3);
      tint.copy(color).multiplyScalar(powered ? (active ? 1 : .045) : .009);
      lights.setColorAt(i, tint);
    });
    lights.instanceColor.needsUpdate = true;
  };
}

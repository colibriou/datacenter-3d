import * as CANNON from 'cannon-es';
import { Box3, Vector3 } from 'three';

export function createRackPhysics(scene) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0), allowSleep: true });
  world.defaultContactMaterial.friction = .65;
  world.defaultContactMaterial.restitution = .10;
  world.solver.iterations = 14;

  const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);

  const cabinet = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Box(new CANNON.Vec3(.30, 1, .45)),
    position: new CANNON.Vec3(0, 1, -.075),
  });
  world.addBody(cabinet);
  const falling = new Map();
  const point = new Vector3();

  function drop(device) {
    if (falling.has(device)) return;
    device.updateWorldMatrix(true, true);
    const bounds = new Box3();
    device.traverse(child => {
      if (!child.isMesh || child.isInstancedMesh) return;
      const { index, attributes: { position } } = child.geometry;
      const count = index?.count ?? position.count;
      for (let i = 0; i < count; i++) {
        point.fromBufferAttribute(position, index ? index.getX(i) : i);
        child.localToWorld(point);
        bounds.expandByPoint(device.worldToLocal(point));
      }
    });
    const center = bounds.getCenter(new Vector3());
    const half = bounds.getSize(new Vector3()).multiplyScalar(.5);
    const worldCenter = device.localToWorld(center.clone());
    const back = device.getWorldQuaternion(device.quaternion.clone());
    scene.attach(device);
    const body = new CANNON.Body({
      mass: 12 + half.y * 100,
      position: new CANNON.Vec3(worldCenter.x, worldCenter.y, worldCenter.z),
      quaternion: new CANNON.Quaternion(back.x, back.y, back.z, back.w),
      shape: new CANNON.Box(new CANNON.Vec3(half.x, half.y, half.z)),
      linearDamping: .12,
      angularDamping: .42,
      sleepSpeedLimit: .12,
      sleepTimeLimit: .55,
    });
    body.velocity.z = .16;
    body.angularVelocity.x = .75;
    world.addBody(body);
    falling.set(device, { body, center, half });
  }

  function remove(device) {
    const item = falling.get(device);
    if (!item) return;
    world.removeBody(item.body);
    falling.delete(device);
  }

  function step(dt) {
    world.step(1 / 120, dt, 8);
    for (const [device, { body, center, half }] of falling) {
      device.quaternion.copy(body.quaternion);
      // Check the lowest corner after contact solving to keep the mesh above y = 0.
      const normal = point.set(0, 1, 0).applyQuaternion(device.quaternion.clone().invert());
      const lowest = Math.abs(normal.x) * half.x + Math.abs(normal.y) * half.y + Math.abs(normal.z) * half.z;
      const offset = point.copy(center).applyQuaternion(device.quaternion);
      device.position.set(body.position.x - offset.x, Math.max(lowest, body.position.y) - offset.y,
        body.position.z - offset.z);
    }
  }

  return { drop, remove, step };
}

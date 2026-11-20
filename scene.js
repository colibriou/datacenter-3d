import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { detailEquipment } from './equipment.js';
import { createRackPhysics } from './rack-physics.js';
import { buildDatacenter, room } from './datacenter.js';
import { loadRack } from './rack-layout.js';

const canvas = document.querySelector('#scene');
const start = document.querySelector('#start');
const toggleDoor = document.querySelector('#door');
const status = document.querySelector('#status');
const aim = document.querySelector('#aim');

async function run() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#a7b2c0');
  scene.add(new THREE.HemisphereLight(0xe8f1ff, 0x59677b, 1.8));
  const key = new THREE.DirectionalLight(0xf0f7ff, 2);
  key.position.set(3, 5, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.normalBias = .012;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xb9d4ff, 1.2);
  rim.position.set(-4, 3, -3);
  scene.add(rim);

  buildDatacenter(scene);
  const model = await loadRack(new GLTFLoader());
  scene.add(model.scene);
  const physics = createRackPhysics(scene);
  const rackLights = new Set();
  model.scene.traverse(object => {
    if (!object.isMesh) return;
    const glass = object.material.transparent;
    object.castShadow = !glass;
    object.receiveShadow = !glass;
    if (object.material.name.startsWith('server-rack_led')) rackLights.add(object.material);
  });
  const door = model.scene.getObjectByName('server-rack_door');
  const clip = model.animations.find(animation => animation.name === door?.userData.clickAnimation);
  if (!clip) throw new Error('Animation de la porte introuvable dans le GLB.');
  const mixer = new THREE.AnimationMixer(model.scene);
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  const servers = new Map();
  model.scene.traverse(object => {
    if (object.userData.rackServer) {
      servers.set(object, {
        extension: 0, mount: object.parent, slot: object.position.clone(),
        blink: detailEquipment(object, servers.size), detached: false,
      });
    }
  });
  let serverGrab = null;
  let opening = false;
  function toggle() {
    if (opening && [...servers].some(([server, state]) =>
      !state.detached && (state.extension > 0 || server.position.z > .005))) {
      status.textContent = 'Repoussez les serveurs avant de refermer la porte.';
      return;
    }
    opening = !opening;
    action.timeScale = opening ? 1 : -1;
    action.paused = false;
    action.play();
    toggleDoor.textContent = opening ? 'Fermer la porte' : 'Ouvrir la porte';
  }
  toggleDoor.disabled = false;
  toggleDoor.addEventListener('click', toggle);

  const camera = new THREE.PerspectiveCamera(58, 1, .04, 100);
  camera.position.set(1.65, 1.65, 3.45);
  let yaw = Math.atan2(-camera.position.x, camera.position.z);
  let pitch = Math.atan2(1.05 - camera.position.y, Math.hypot(camera.position.x, camera.position.z));
  const pressed = new Set();
  const controls = new Set(['z', 'q', 'd', 'x', 'ArrowUp', 'ArrowDown']);
  const keyName = event => event.key.length === 1 ? event.key.toLowerCase() : event.key;
  addEventListener('keydown', event => {
    const key = keyName(event);
    if (!controls.has(key) || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    pressed.add(key);
  });
  addEventListener('keyup', event => pressed.delete(keyName(event)));
  addEventListener('blur', () => pressed.clear());

  const idleMessage = status.textContent;
  const dragMessage = 'Maintenez le bouton gauche et déplacez la souris pour orienter la caméra.';
  let dragPointer = null;
  let dragDistance = 0;
  let handledServerPress = false;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  async function lockMouse() {
    try {
      if (!canvas.requestPointerLock) throw new Error();
      await canvas.requestPointerLock();
    } catch {
      status.textContent = dragMessage;
    }
  }

  start.addEventListener('click', () => {
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    else lockMouse();
  });
  function pick(event) {
    const locked = document.pointerLockElement === canvas;
    if (locked) {
      pointer.set(0, 0);
    } else {
      const rect = canvas.getBoundingClientRect();
      pointer.set(2 * (event.clientX - rect.left) / rect.width - 1,
        1 - 2 * (event.clientY - rect.top) / rect.height);
    }
    raycaster.setFromCamera(pointer, camera);
    const detached = [...servers].filter(([, state]) => state.detached).map(([server]) => server);
    return raycaster.intersectObjects([model.scene, ...detached], true)[0]?.object;
  }

  function serverFromHandle(object) {
    let isHandle = false;
    for (let part = object; part; part = part.parent) {
      isHandle ||= part.userData.serverHandle === true;
      if (servers.has(part)) return isHandle ? part : null;
    }
    return null;
  }

  function restoreStatus() {
    status.textContent = document.pointerLockElement === canvas
      ? 'Visez la porte ou une poignée colorée et cliquez. Échap libère la souris.'
      : idleMessage;
  }

  function pullServer(distance) {
    const { server } = serverGrab;
    const state = servers.get(server);
    state.extension = THREE.MathUtils.clamp(state.extension + distance, 0, server.userData.removalDistance);
    server.position.z = state.slot.z + state.extension;
  }

  function finishGrab(click) {
    if (!serverGrab) return;
    const { server, moved } = serverGrab;
    const state = servers.get(server);
    serverGrab = null;
    if (state.detached) {
      if (!click || moved) return;
      physics.remove(server);
      state.mount.add(server);
      server.position.copy(state.slot);
      server.quaternion.identity();
      state.extension = 0;
      state.detached = false;
    } else if (state.extension >= server.userData.removalDistance - .001 && moved) {
      state.detached = true;
      physics.drop(server);
      status.textContent = 'Équipement déposé. Cliquez sur sa poignée pour le remettre en baie.';
      return;
    } else if (click && !moved) {
      state.extension = state.extension > 0 ? 0 : server.userData.releaseDistance;
    }
    status.textContent = state.extension > 0
      ? 'Maintenez la poignée et reculez avec X ou tirez la souris vers le bas.'
      : 'Cliquez sur une poignée colorée pour libérer un équipement.';
  }

  function slideWithMouse(dy) {
    if (!serverGrab.canPull) return;
    serverGrab.mouseTravel += dy;
    if (!serverGrab.moved && Math.abs(serverGrab.mouseTravel) < 4) return;
    serverGrab.moved = true;
    pullServer(serverGrab.mouseTravel / Math.max(canvas.clientHeight, 1) * 1.8);
    serverGrab.mouseTravel = 0;
  }

  canvas.addEventListener('click', event => {
    if (handledServerPress || dragDistance > 4) return;
    for (let object = pick(event); object; object = object.parent) {
      if (object === door) {
        toggle();
        return;
      }
    }
    if (document.pointerLockElement !== canvas) lockMouse();
  });
  document.addEventListener('pointerlockerror', () => { status.textContent = dragMessage; });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    aim.hidden = !locked;
    start.textContent = locked ? 'Libérer la souris' : 'Activer la souris';
    restoreStatus();
    if (!locked) {
      pressed.clear();
      finishGrab(false);
    }
  });

  function look(dx, dy) {
    yaw += dx * .0025;
    pitch = THREE.MathUtils.clamp(pitch - dy * .0025, -1.55, 1.55);
  }

  document.addEventListener('mousemove', event => {
    if (document.pointerLockElement !== canvas) return;
    if (serverGrab) slideWithMouse(event.movementY);
    else look(event.movementX, event.movementY);
  });
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    dragDistance = 0;
    handledServerPress = false;
    const locked = document.pointerLockElement === canvas;
    const server = serverFromHandle(pick(event));
    if (server && opening && Math.abs(door.quaternion.y) > .64) {
      handledServerPress = true;
      const state = servers.get(server);
      serverGrab = {
        server, id: event.pointerId, y: event.clientY, mouseTravel: 0,
        canPull: !state.detached && state.extension > 0, moved: false,
      };
      if (!locked) canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (locked) return;
    dragPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (serverGrab?.id === event.pointerId && document.pointerLockElement !== canvas) {
      slideWithMouse(event.clientY - serverGrab.y);
      serverGrab.y = event.clientY;
      return;
    }
    if (dragPointer?.id !== event.pointerId || document.pointerLockElement === canvas) return;
    const dx = event.clientX - dragPointer.x;
    const dy = event.clientY - dragPointer.y;
    dragDistance += Math.hypot(dx, dy);
    if (dragDistance > 4) look(dx, dy);
    dragPointer.x = event.clientX;
    dragPointer.y = event.clientY;
  });
  canvas.addEventListener('pointerup', event => {
    if (event.button !== 0 || serverGrab?.id !== event.pointerId) return;
    finishGrab(true);
  });
  function releasePointer(event) {
    if (serverGrab?.id === event.pointerId) finishGrab(false);
    if (dragPointer?.id === event.pointerId) dragPointer = null;
  }
  canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('lostpointercapture', releasePointer);
  addEventListener('blur', () => { finishGrab(false); dragPointer = null; });

  let previousTime = performance.now();
  const target = new THREE.Vector3();
  renderer.setAnimationLoop(time => {
    const dt = Math.min((time - previousTime) / 1000, .05);
    previousTime = time;
    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);
    const cosPitch = Math.cos(pitch);
    const travel = Number(pressed.has('z')) - Number(pressed.has('x'));
    const strafe = Number(pressed.has('d')) - Number(pressed.has('q'));
    const rise = Number(pressed.has('ArrowUp')) - Number(pressed.has('ArrowDown'));
    const step = 3 * dt / Math.max(1, Math.hypot(travel, strafe, rise));
    if (serverGrab?.canPull && travel) {
      const { server } = serverGrab;
      const state = servers.get(server);
      const distance = -travel * .95 * dt;
      if (THREE.MathUtils.clamp(state.extension + distance, 0, server.userData.removalDistance) !== state.extension) {
        pullServer(distance);
        serverGrab.moved = true;
      }
    }
    camera.position.x = THREE.MathUtils.clamp(camera.position.x + step * (travel * sinYaw + strafe * cosYaw),
      room.left + .16, room.right - .16);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y + step * rise, .16, room.ceiling - .16);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z + step * (-travel * cosYaw + strafe * sinYaw),
      room.back + .16, room.front - .16);
    target.set(sinYaw * cosPitch, Math.sin(pitch), -cosYaw * cosPitch).add(camera.position);
    camera.lookAt(target);

    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    if (canvas.width !== Math.floor(width * renderer.getPixelRatio()) ||
        canvas.height !== Math.floor(height * renderer.getPixelRatio())) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    mixer.update(dt);
    physics.step(dt);
    for (const [server, state] of servers) {
      if (!state.detached) {
        server.position.z = THREE.MathUtils.damp(server.position.z, state.slot.z + state.extension, 18, dt);
      }
      state.blink(time / 1000, !state.detached);
    }
    [...rackLights].forEach((material, index) => {
      material.emissiveIntensity = (Math.floor(time / (80 + index * 23)) + index * 3) % 11 < 5 ? 1.7 : .12;
    });
    renderer.render(scene, camera);
  });
}

run().catch(error => {
  status.textContent = 'Impossible de charger la baie WebGL.';
  console.error(error);
  start.disabled = true;
});

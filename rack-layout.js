import shellBytes from './baie-42u.glb';
import switchBytes from './switch-1u.glb';
import server1Bytes from './serveur-1u.glb';
import server2Bytes from './serveur-2u.glb';
import storageBytes from './stockage-3u.glb';

export const rackUnits = 42;
const pitch = .04445;
const firstRail = .075;
const files = [
  ['switch-1u.glb', switchBytes],
  ['serveur-1u.glb', server1Bytes],
  ['serveur-2u.glb', server2Bytes],
  ['stockage-3u.glb', storageBytes],
];

export function arrangeRack(catalog, random = Math.random) {
  // Keep every type in the rack before filling the remaining rail space.
  const order = [...catalog];
  let remaining = rackUnits - order.reduce((sum, item) => sum + item.units, 0);
  while (remaining > 0) {
    const fitting = catalog.filter(item => item.units <= remaining);
    const item = fitting[Math.floor(random() * fitting.length)];
    order.push(item);
    remaining -= item.units;
  }
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export async function loadRack(loader) {
  // Serve the assets separately on HTTP and use their embedded copies on file URLs.
  function load([file, bytes]) {
    return location.protocol === 'file:'
      ? loader.parseAsync(bytes.buffer, '')
      : loader.loadAsync('./' + file);
  }
  const [rack, ...assets] = await Promise.all([['baie-42u.glb', shellBytes], ...files].map(load));
  const mount = rack.scene.getObjectByName('server-rack_body');
  if (!mount) throw new Error('Montants de la baie introuvables dans le GLB.');
  const catalog = assets.map((asset, index) => {
    const template = asset.scene.children.find(object => object.userData.rackServer);
    if (!template) throw new Error('Module de baie invalide dans ' + files[index][0]);
    const { units } = template.userData;
    if (![1, 2, 3].includes(units)) throw new Error('Hauteur de module invalide dans ' + files[index][0]);
    return { template, units };
  });
  if (!catalog.some(item => item.units === 1)) throw new Error('Un module 1U est nécessaire pour remplir la baie.');
  let occupied = 0;
  for (const { template, units } of arrangeRack(catalog)) {
    const device = template.clone(true);
    device.position.set(0, firstRail + (occupied + units / 2) * pitch, 0);
    device.name = template.name + '_U' + (occupied + 1);
    device.userData.firstUnit = occupied + 1;
    mount.add(device);
    occupied += units;
  }
  return rack;
}

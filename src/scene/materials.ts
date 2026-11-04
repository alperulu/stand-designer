import * as THREE from 'three';

// Paylaşılan malzemeler — her mesh için yeniden oluşturulmaz.
export const aluminium = new THREE.MeshStandardMaterial({
  color: '#e4e5e7',
  metalness: 0.2,
  roughness: 0.4,
});

export const doorLeaf = new THREE.MeshStandardMaterial({ color: '#eeeeea', roughness: 0.55 });
export const doorKnob = new THREE.MeshStandardMaterial({ color: '#f2f2f0', roughness: 0.35 });

const panelCache = new Map<string, THREE.MeshStandardMaterial>();
export function panelMaterial(color: string): THREE.MeshStandardMaterial {
  let m = panelCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 });
    panelCache.set(color, m);
  }
  return m;
}

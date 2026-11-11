// BT.2100 PQ EOTF. Output is relative to the 10,000 cd/m² PQ ceiling.
export function pqLinear(value) {
  const p = Math.min(1, Math.max(0, value)) ** (32 / 2523);
  return (Math.max(p - 3424 / 4096, 0) / (2413 / 128 - 2392 / 128 * p)) ** (16384 / 2610);
}

export function pqWaveLevel(r, g, b) {
  if (![r, g, b].every(Number.isFinite)) return NaN;
  return Math.sqrt(.2627 * pqLinear(r) + .6780 * pqLinear(g) + .0593 * pqLinear(b));
}

export function pqNits(level) {
  return 10000 * level * level;
}

export function usesPqWave(config, signal) {
  return config.pqWave === true && signal.domain !== 'working' && signal.matrix === 'bt2020-ncl';
}

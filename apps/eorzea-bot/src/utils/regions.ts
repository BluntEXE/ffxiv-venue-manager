export type Region = 'na' | 'eu' | 'jp' | 'oce';

const DATA_CENTER_TO_REGION: Record<string, Region> = {
  Aether: 'na', Crystal: 'na', Dynamis: 'na', Primal: 'na',
  Chaos: 'eu', Light: 'eu',
  Elemental: 'jp', Gaia: 'jp', Mana: 'jp',
  Materia: 'oce',
};

export function regionForDataCenter(dataCenter: string): Region | null {
  return DATA_CENTER_TO_REGION[dataCenter] ?? null;
}

export const REGION_LABELS: Record<Region, string> = {
  na: 'North America',
  eu: 'Europe',
  jp: 'Japan',
  oce: 'Oceania',
};

export function regionChannelId(region: Region): string {
  const envKey = `WHATS_HAPPENING_${region.toUpperCase()}_CHANNEL_ID`;
  const id = process.env[envKey];
  if (!id) throw new Error(`Missing env var ${envKey}`);
  return id;
}

export function dataCentersForRegion(region: Region): string[] {
  return Object.entries(DATA_CENTER_TO_REGION)
    .filter(([, r]) => r === region)
    .map(([dc]) => dc);
}

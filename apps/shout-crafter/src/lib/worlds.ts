export const WORLDS: Record<string, string[]> = {
  'Aether': ['Adamantoise', 'Cactuar', 'Faerie', 'Gilgamesh', 'Jenova', 'Midgardsormr', 'Sargatanas', 'Siren'],
  'Chaos': ['Cerberus', 'Louisoix', 'Moogle', 'Omega', 'Phantom', 'Ragnarok', 'Sagittarius', 'Spriggan'],
  'Crystal': ['Balmung', 'Brynhildr', 'Coeurl', 'Diabolos', 'Goblin', 'Malboro', 'Mateus', 'Zalera'],
  'Dynamis': ['Cuchulainn', 'Golem', 'Halicarnassus', 'Kraken', 'Maduin', 'Marilith', 'Seraph', 'Tycoon'],
  'Elemental': ['Aegis', 'Atomos', 'Carbuncle', 'Garuda', 'Gungnir', 'Kujata', 'Tonberry', 'Typhon'],
  'Gaia': ['Alexander', 'Bahamut', 'Durandal', 'Fenrir', 'Ifrit', 'Ridill', 'Tiamat', 'Ultima'],
  'Light': ['Alpha', 'Lich', 'Odin', 'Phoenix', 'Raiden', 'Shiva', 'Twintania', 'Zodiark'],
  'Mana': ['Anima', 'Asura', 'Chocobo', 'Hades', 'Ixion', 'Masamune', 'Pandaemonium', 'Titan'],
  'Materia': ['Bismarck', 'Ravana', 'Sephirot', 'Sophia', 'Zurvan'],
  'Meteor': ['Belias', 'Mandragora', 'Ramuh', 'Shinryu', 'Unicorn', 'Valefor', 'Yojimbo', 'Zeromus'],
  'Primal': ['Behemoth', 'Excalibur', 'Exodus', 'Famfrit', 'Hyperion', 'Lamia', 'Leviathan', 'Ultros'],
}

export const ALL_WORLDS = [...new Set(Object.values(WORLDS).flat())].sort()
export const ALL_DATACENTERS = Object.keys(WORLDS).sort()

export function findWorld(text: string): string | undefined {
  const lower = text.toLowerCase()
  return ALL_WORLDS.find(w => lower.includes(w.toLowerCase()))
}

export function findDatacenter(text: string): string | undefined {
  const lower = text.toLowerCase()
  return ALL_DATACENTERS.find(dc => lower.includes(dc.toLowerCase()))
}

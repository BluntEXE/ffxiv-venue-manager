import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

const token = process.env.DISCORD_TOKEN!;
const clientId = process.env.CLIENT_ID!;
const guildId = process.env.GUILD_ID;

const commands: unknown[] = [];
const foldersPath = join(import.meta.dirname, 'commands');
const folders = readdirSync(foldersPath);

for (const folder of folders) {
  const commandsPath = join(foldersPath, folder);
  const files = readdirSync(commandsPath).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
  for (const file of files) {
    const command = (await import(join(commandsPath, file))).default;
    if (command?.data) commands.push(command.data.toJSON());
  }
}

const rest = new REST().setToken(token);

if (guildId) {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log(`[Deploy] Registered ${commands.length} commands to guild ${guildId} (instant)`);
} else {
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log(`[Deploy] Registered ${commands.length} commands globally (up to 1hr propagation)`);
}

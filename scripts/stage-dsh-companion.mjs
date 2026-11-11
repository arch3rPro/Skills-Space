import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readUpstreamAgents } from './read-upstream-agents.mjs';

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve('skills/package.json'));
const agents = readUpstreamAgents(readFileSync(join(packageRoot, 'dist/cli.mjs'), 'utf8'));
const destination = new URL('../packages/dsh-skills-space/dist/', import.meta.url);
copyFileSync(new URL('./inspect-upstream-discovery.mjs', import.meta.url), new URL('discover.mjs', destination));
copyFileSync(new URL('./inspect-upstream-source.mjs', import.meta.url), new URL('source.mjs', destination));
copyFileSync(new URL('./dsh-skill-policy/state.mjs', import.meta.url), new URL('policy-state.mjs', destination));
writeFileSync(new URL('agents.json', destination), JSON.stringify(agents.map(({ id, projectPath, globalBase, globalPath }) => ({
  id, projectPath, globalBase, globalPath,
}))));

copyFileSync(new URL("./dsh-directory-config.mjs", import.meta.url), new URL("directory-config.mjs", destination));
copyFileSync(new URL("./dsh-skill-version.mjs", import.meta.url), new URL("dsh-skill-version.mjs", destination));

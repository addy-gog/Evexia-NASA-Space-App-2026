/**
 * `npm run avatars`: writes illustrated portraits for the fictional crew and the
 * flight surgeon to client/public/avatars/*.svg.
 *
 * Artwork: "Personas" by Draftbit (https://personas.draftbit.com/), licensed
 * CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), generated with the
 * DiceBear library (https://www.dicebear.com/, MIT). Shapes are unchanged; we
 * choose seeds, colours and features per person.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAvatar } from '@dicebear/core';
import { personas } from '@dicebear/collection';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', '..', 'client', 'public', 'avatars');

// Hand-picked options so the crew looks varied; background uses the light UI palette.
const PEOPLE = {
  c1: { mouth:['smile'],eyes:['open'],body:['rounded'], clothingColor: ['1f4fd8'], seed: 'Ada Okafor', skinColor: ['623d36'], hair: ['curlyBun'], hairColor: ['362c47'], backgroundColor: ['e8eefc'] },
  c2: { mouth:['bigSmile'],eyes:['glasses'],body:['squared'], clothingColor: ['1f4fd8'], seed: 'Leo Marchetti', skinColor: ['e5a07e'], hair: ['shortCombover'], hairColor: ['6c4545'], facialHair: ['beardMustache'], facialHairProbability: 100, backgroundColor: ['e2f4ea'] },
  c3: { mouth:['smirk'],eyes:['happy'],body:['rounded'], clothingColor: ['1f4fd8'], seed: 'Mei Tanaka', skinColor: ['eeb4a4'], hair: ['bobBangs'], hairColor: ['362c47'], backgroundColor: ['fff1d6'] },
  c4: { mouth:['bigSmile'],eyes:['open'],body:['squared'], clothingColor: ['1f4fd8'], seed: 'Sam Rivera', skinColor: ['b16a5b'], hair: ['shortComboverChops'], hairColor: ['362c47'], facialHairProbability: 0, backgroundColor: ['eef1f5'] },
  c5: { mouth:['lips'],eyes:['open'],body:['rounded'], clothingColor: ['1f4fd8'], seed: 'Priya Nair', skinColor: ['92594b'], hair: ['long'], hairColor: ['362c47'], backgroundColor: ['fde6e8'] },
  s1: { mouth:['smile'],eyes:['glasses'],body:['squared'], clothingColor: ['f4f6f8'], seed: 'Jonas Lindqvist', skinColor: ['eeb4a4'], hair: ['shortCombover'], hairColor: ['dee1f5'], facialHair: ['shadow'], facialHairProbability: 100, backgroundColor: ['dde2e9'] },
};

fs.mkdirSync(OUT, { recursive: true });
for (const [id, opts] of Object.entries(PEOPLE)) {
  let svg;
  try {
    svg = createAvatar(personas, { radius: 0, ...opts }).toString();
  } catch {
    // An option name changed in a newer style version: fall back to seed + background only.
    svg = createAvatar(personas, { seed: opts.seed, backgroundColor: opts.backgroundColor }).toString();
  }
  fs.writeFileSync(path.join(OUT, `${id}.svg`), svg);
}
fs.writeFileSync(
  path.join(OUT, 'ATTRIBUTION.md'),
  '# Avatar attribution\n\nPortraits in this folder are generated illustrations of fictional people.\n\n- Artwork: "Personas" by Draftbit, https://personas.draftbit.com/, licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). No changes to the artwork shapes; seeds, colours and features were chosen per person.\n- Generated with DiceBear (https://www.dicebear.com/), MIT licence.\n',
);
console.log(`Wrote ${Object.keys(PEOPLE).length} avatars to ${OUT}`);

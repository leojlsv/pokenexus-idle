import { canonicalJson } from "./canonical-json.js";
import { loadPokeApiLowAmbiguityFacts } from "./pokeapi-local-snapshot.js";

function usage(): never {
  throw new Error("usage: local-snapshot-cli <local-pokeapi-snapshot-root>");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  const [snapshotRoot, ...extra] = args;
  if (!snapshotRoot || extra.length > 0) usage();

  const facts = await loadPokeApiLowAmbiguityFacts(snapshotRoot);
  process.stdout.write(`${canonicalJson({
    provider: facts.snapshot.record.provider,
    snapshotId: facts.snapshot.record.id,
    snapshotHash: facts.snapshot.record.snapshotHash,
    upstreamRevision: facts.snapshot.record.upstreamRevision,
    counts: {
      pokemon: facts.pokemon.length,
      species: facts.species.length,
      moves: facts.moves.length,
      types: facts.types.length,
      typeEffectiveness: facts.typeEffectiveness.length,
      abilities: facts.abilities.length,
      items: facts.items.length,
    },
  })}\n`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

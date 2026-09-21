import { readFile } from "node:fs/promises";
import type { ExcludedOrDeferredSourceKey } from "./schema.js";

export interface SpeciesPageIngestionProfile {
  pokemonDbUrl: string;
  bulbapediaUrl: string;
  excludedOrDeferred?: ExcludedOrDeferredSourceKey[];
  bulbapediaExcludedOrDeferredForms?: BulbapediaFormDispositionProfile[];
}

export interface BulbapediaFormDispositionProfile {
  formLabel: string;
  disposition: "excluded" | "deferred";
  reason: string;
}

export interface LearnsetPageIngestionProfile {
  bulbapediaUrl: string;
  bdspFallbackUrl?: string;
  speciesSourceKey: string;
}

export interface FormLearnsetOverrideProfile {
  speciesSourceKey: string;
  formLabel: string;
  bulbapediaUrl: string;
}

export interface ItemPageIngestionProfile {
  sourceKey: string;
  pokemonDbUrl: string;
}

export interface MaintenanceIngestionProfile {
  speciesPages?: SpeciesPageIngestionProfile[];
  movePages?: string[];
  items?: ItemPageIngestionProfile[];
  learnsetPages?: LearnsetPageIngestionProfile[];
  formLearnsetOverrides?: FormLearnsetOverrideProfile[];
}

function profileRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function profileString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function profileUrl(
  value: unknown,
  path: string,
  origin: "https://pokemondb.net" | "https://bulbapedia.bulbagarden.net",
  pathnamePattern: RegExp,
): string {
  const raw = profileString(value, path);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${path} must be a valid URL`);
  }
  if (
    url.origin !== origin ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !pathnamePattern.test(decodeURIComponent(url.pathname))
  ) {
    throw new Error(
      `${path} must be an approved canonical URL on ${origin} with the exact surface path`,
    );
  }
  return url.href;
}

function rejectUnknownProfileKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${path}.${key} is not supported`);
  }
}

function parseProfileExclusions(
  value: unknown,
  path: string,
): ExcludedOrDeferredSourceKey[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value.map((entry, index) => {
    const object = profileRecord(entry, `${path}[${index}]`);
    rejectUnknownProfileKeys(object, ["sourceKey", "disposition", "reason"], `${path}[${index}]`);
    const disposition = object.disposition;
    if (disposition !== "excluded" && disposition !== "deferred") {
      throw new Error(`${path}[${index}].disposition must be excluded or deferred`);
    }
    return {
      sourceKey: profileString(object.sourceKey, `${path}[${index}].sourceKey`),
      disposition,
      reason: profileString(object.reason, `${path}[${index}].reason`),
    };
  });
}

function parseBulbapediaFormDispositions(
  value: unknown,
  path: string,
): BulbapediaFormDispositionProfile[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  const result = value.map((entry, index): BulbapediaFormDispositionProfile => {
    const object = profileRecord(entry, `${path}[${index}]`);
    rejectUnknownProfileKeys(object, ["formLabel", "disposition", "reason"], `${path}[${index}]`);
    const disposition = object.disposition;
    if (disposition !== "excluded" && disposition !== "deferred") {
      throw new Error(`${path}[${index}].disposition must be excluded or deferred`);
    }
    return {
      formLabel: profileString(object.formLabel, `${path}[${index}].formLabel`),
      disposition,
      reason: profileString(object.reason, `${path}[${index}].reason`),
    };
  });
  assertUniqueProfileValues(
    result.map((entry) => entry.formLabel),
    `${path} formLabel`,
  );
  return result;
}

function assertUniqueProfileValues(values: readonly string[], label: string): void {
  const normalized = values.map((value) => value.normalize("NFC"));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`duplicate ${label} in maintenance ingestion profile`);
  }
}

export function parseMaintenanceIngestionProfile(value: unknown): MaintenanceIngestionProfile {
  const object = profileRecord(value, "profile");
  rejectUnknownProfileKeys(
    object,
    ["speciesPages", "movePages", "items", "learnsetPages", "formLearnsetOverrides"],
    "profile",
  );

  const speciesPages = object.speciesPages === undefined
    ? undefined
    : (() => {
        if (!Array.isArray(object.speciesPages)) throw new Error("profile.speciesPages must be an array");
        return object.speciesPages.map((entry, index): SpeciesPageIngestionProfile => {
          const page = profileRecord(entry, `profile.speciesPages[${index}]`);
          rejectUnknownProfileKeys(
            page,
            ["pokemonDbUrl", "bulbapediaUrl", "excludedOrDeferred", "bulbapediaExcludedOrDeferredForms"],
            `profile.speciesPages[${index}]`,
          );
          return {
            pokemonDbUrl: profileUrl(
              page.pokemonDbUrl,
              `profile.speciesPages[${index}].pokemonDbUrl`,
              "https://pokemondb.net",
              /^\/pokedex\/[^/]+\/?$/u,
            ),
            bulbapediaUrl: profileUrl(
              page.bulbapediaUrl,
              `profile.speciesPages[${index}].bulbapediaUrl`,
              "https://bulbapedia.bulbagarden.net",
              /^\/wiki\/[^/]+_\(Pokémon\)$/u,
            ),
            excludedOrDeferred: parseProfileExclusions(
              page.excludedOrDeferred,
              `profile.speciesPages[${index}].excludedOrDeferred`,
            ),
            bulbapediaExcludedOrDeferredForms: parseBulbapediaFormDispositions(
              page.bulbapediaExcludedOrDeferredForms,
              `profile.speciesPages[${index}].bulbapediaExcludedOrDeferredForms`,
            ),
          };
        });
      })();

  const movePages = object.movePages === undefined
    ? undefined
    : (() => {
        if (!Array.isArray(object.movePages)) throw new Error("profile.movePages must be an array");
        return object.movePages.map((entry, index) =>
          profileUrl(
            entry,
            `profile.movePages[${index}]`,
            "https://pokemondb.net",
            /^\/move\/[^/]+\/?$/u,
          ));
      })();

  const items = object.items === undefined
    ? undefined
    : (() => {
        if (!Array.isArray(object.items)) throw new Error("profile.items must be an array");
        return object.items.map((entry, index): ItemPageIngestionProfile => {
          const item = profileRecord(entry, `profile.items[${index}]`);
          rejectUnknownProfileKeys(item, ["sourceKey", "pokemonDbUrl"], `profile.items[${index}]`);
          return {
            sourceKey: profileString(item.sourceKey, `profile.items[${index}].sourceKey`),
            pokemonDbUrl: profileUrl(
              item.pokemonDbUrl,
              `profile.items[${index}].pokemonDbUrl`,
              "https://pokemondb.net",
              /^\/item\/[^/]+\/?$/u,
            ),
          };
        });
      })();

  const learnsetPages = object.learnsetPages === undefined
    ? undefined
    : (() => {
        if (!Array.isArray(object.learnsetPages)) throw new Error("profile.learnsetPages must be an array");
        return object.learnsetPages.map((entry, index): LearnsetPageIngestionProfile => {
          const page = profileRecord(entry, `profile.learnsetPages[${index}]`);
          rejectUnknownProfileKeys(
            page,
            ["bulbapediaUrl", "bdspFallbackUrl", "speciesSourceKey"],
            `profile.learnsetPages[${index}]`,
          );
          return {
            bulbapediaUrl: profileUrl(
              page.bulbapediaUrl,
              `profile.learnsetPages[${index}].bulbapediaUrl`,
              "https://bulbapedia.bulbagarden.net",
              /^\/wiki\/[^/]+_\(Pokémon\)\/Generation_IX_learnset$/u,
            ),
            bdspFallbackUrl:
              page.bdspFallbackUrl === undefined
                ? undefined
                : profileUrl(
                    page.bdspFallbackUrl,
                    `profile.learnsetPages[${index}].bdspFallbackUrl`,
                    "https://bulbapedia.bulbagarden.net",
                    /^\/wiki\/[^/]+_\(Pokémon\)\/Generation_VIII_learnset$/u,
                  ),
            speciesSourceKey: profileString(
              page.speciesSourceKey,
              `profile.learnsetPages[${index}].speciesSourceKey`,
            ),
          };
        });
      })();

  const formLearnsetOverrides = object.formLearnsetOverrides === undefined
    ? undefined
    : (() => {
        if (!Array.isArray(object.formLearnsetOverrides)) {
          throw new Error("profile.formLearnsetOverrides must be an array");
        }
        return object.formLearnsetOverrides.map((entry, index): FormLearnsetOverrideProfile => {
          const override = profileRecord(entry, `profile.formLearnsetOverrides[${index}]`);
          rejectUnknownProfileKeys(
            override,
            ["speciesSourceKey", "formLabel", "bulbapediaUrl"],
            `profile.formLearnsetOverrides[${index}]`,
          );
          return {
            speciesSourceKey: profileString(
              override.speciesSourceKey,
              `profile.formLearnsetOverrides[${index}].speciesSourceKey`,
            ),
            formLabel: profileString(
              override.formLabel,
              `profile.formLearnsetOverrides[${index}].formLabel`,
            ),
            bulbapediaUrl: profileUrl(
              override.bulbapediaUrl,
              `profile.formLearnsetOverrides[${index}].bulbapediaUrl`,
              "https://bulbapedia.bulbagarden.net",
              /^\/wiki\/[^/]+_\(Pokémon\)\/Generation_(?:VII|VIII)_learnset$/u,
            ),
          };
        });
      })();

  const result: MaintenanceIngestionProfile = {
    speciesPages,
    movePages,
    items,
    learnsetPages,
    formLearnsetOverrides,
  };
  if (
    (speciesPages?.length ?? 0) +
      (movePages?.length ?? 0) +
      (items?.length ?? 0) +
      (learnsetPages?.length ?? 0) +
      (formLearnsetOverrides?.length ?? 0) ===
    0
  ) {
    throw new Error("maintenance ingestion profile contains no configured source surfaces");
  }
  assertUniqueProfileValues(speciesPages?.map((entry) => entry.pokemonDbUrl) ?? [], "Species PokémonDB URL");
  assertUniqueProfileValues(speciesPages?.map((entry) => entry.bulbapediaUrl) ?? [], "Species Bulbapedia URL");
  assertUniqueProfileValues(movePages ?? [], "Move PokémonDB URL");
  assertUniqueProfileValues(items?.map((entry) => entry.sourceKey) ?? [], "Item sourceKey");
  assertUniqueProfileValues(items?.map((entry) => entry.pokemonDbUrl) ?? [], "Item PokémonDB URL");
  assertUniqueProfileValues(learnsetPages?.map((entry) => entry.bulbapediaUrl) ?? [], "Learnset Bulbapedia URL");
  assertUniqueProfileValues(
    learnsetPages?.flatMap((entry) => entry.bdspFallbackUrl ? [entry.bdspFallbackUrl] : []) ?? [],
    "Learnset BDSP fallback URL",
  );
  assertUniqueProfileValues(learnsetPages?.map((entry) => entry.speciesSourceKey) ?? [], "Learnset speciesSourceKey");
  assertUniqueProfileValues(
    formLearnsetOverrides?.map((entry) => entry.speciesSourceKey) ?? [],
    "form Learnset speciesSourceKey",
  );
  return result;
}

export async function loadIngestionProfile(path: string): Promise<MaintenanceIngestionProfile> {
  return parseMaintenanceIngestionProfile(JSON.parse(await readFile(path, "utf8")) as unknown);
}

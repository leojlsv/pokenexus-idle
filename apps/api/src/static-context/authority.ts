export interface StaticContextPairRef {
  readonly gameDataVersion: string;
  readonly rulesVersion: string;
}

export type StaticContextPairCompatibilityRecord = StaticContextPairRef;

export interface StaticContextPairAuthorityResolution {
  readonly compatibility: StaticContextPairCompatibilityRecord;
  readonly newOperationsAllowed: boolean;
}

export interface ExactStaticContextPairAuthority {
  resolve(pair: StaticContextPairRef): Promise<StaticContextPairAuthorityResolution | null>;
}

export interface ExactGameDataVersionAuthority {
  resolve(gameDataVersion: string): Promise<{
    readonly gameDataVersion: string;
    readonly newOperationsAllowed: boolean;
  } | null>;
}

/**
 * Trusted server configuration chooses the pair for a new authoritative operation.
 * Player/client command input is intentionally absent from this boundary.
 */
export interface NewOperationStaticContextSelector {
  select(): Promise<StaticContextPairRef>;
}

export interface ConfiguredStaticContextRelease {
  readonly pair: StaticContextPairRef;
  readonly newOperationsAllowed: boolean;
}

export function createConfiguredStaticContextAuthority(input: {
  readonly selectedPair: StaticContextPairRef;
  readonly releases: readonly ConfiguredStaticContextRelease[];
}): {
  readonly selector: NewOperationStaticContextSelector;
  readonly staticContextPairs: ExactStaticContextPairAuthority;
  readonly gameDataVersions: ExactGameDataVersionAuthority;
  listNewOperationPairs(): readonly StaticContextPairRef[];
} {
  const releasesByPair = new Map<string, ConfiguredStaticContextRelease>();
  const gameDataAllowed = new Map<string, boolean>();

  for (const release of input.releases) {
    const key = JSON.stringify([release.pair.gameDataVersion, release.pair.rulesVersion]);
    if (releasesByPair.has(key)) {
      throw new Error(
        `Duplicate static-context release: ${release.pair.gameDataVersion} + ${release.pair.rulesVersion}`,
      );
    }
    releasesByPair.set(key, {
      pair: { ...release.pair },
      newOperationsAllowed: release.newOperationsAllowed,
    });
    gameDataAllowed.set(
      release.pair.gameDataVersion,
      (gameDataAllowed.get(release.pair.gameDataVersion) ?? false) || release.newOperationsAllowed,
    );
  }

  const selectedKey = JSON.stringify([
    input.selectedPair.gameDataVersion,
    input.selectedPair.rulesVersion,
  ]);
  if (!releasesByPair.has(selectedKey)) {
    throw new Error("Configured selected static-context pair has no retained release record");
  }

  return {
    selector: {
      async select() {
        return { ...input.selectedPair };
      },
    },
    staticContextPairs: {
      async resolve(pair) {
        const key = JSON.stringify([pair.gameDataVersion, pair.rulesVersion]);
        const release = releasesByPair.get(key);
        if (!release) return null;
        return {
          compatibility: { ...release.pair },
          newOperationsAllowed: release.newOperationsAllowed,
        };
      },
    },
    gameDataVersions: {
      async resolve(gameDataVersion) {
        const allowed = gameDataAllowed.get(gameDataVersion);
        if (allowed === undefined) return null;
        return { gameDataVersion, newOperationsAllowed: allowed };
      },
    },
    listNewOperationPairs() {
      return [...releasesByPair.values()]
        .filter(({ newOperationsAllowed }) => newOperationsAllowed)
        .map(({ pair }) => ({ ...pair }));
    },
  };
}

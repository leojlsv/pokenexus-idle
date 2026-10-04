import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import "./pokemon-analysis/workbench.css";
import { loadCurrentWorkbenchData, WORKBENCH_SOURCE_COUNTS } from "./pokemon-analysis/data";
import {
  MAX_LEARN_LEVEL,
  canonicalSlug,
  createWorkbenchExport,
  effectiveLearnLevel,
  humanizeSlug,
  isBaseSpecies,
  learnsetKey,
  parseWorkbenchImport,
  sortLearnsets,
  sortSpecies,
  stringifyWorkbenchExport,
  type AbilityRecord,
  type LearnsetRecord,
  type MoveRecord,
  type SpeciesRecord,
  type TypeRecord,
  type WorkbenchData,
} from "./pokemon-analysis/model";

type GenerationFilter = "all" | "1" | "2" | "3";
type MoveViewMode = "line" | "card";

function formatDex(value: number): string {
  return `#${String(value).padStart(3, "0")}`;
}

function formatFact(value: unknown): string {
  if (typeof value === "number" || typeof value === "string") return String(value);
  if (value && typeof value === "object" && "status" in value) {
    const fact = value as { status?: unknown; value?: unknown };
    if (fact.status === "known") return String(fact.value ?? "—");
    return "Fonte indisponível";
  }
  return "—";
}

function formatGender(value: unknown): string {
  if (!value || typeof value !== "object") return "—";
  const gender = value as { kind?: unknown; maleBasisPoints?: unknown; femaleBasisPoints?: unknown };
  if (gender.kind === "genderless") return "Sem gênero";
  if (gender.kind === "ratio" && typeof gender.maleBasisPoints === "number" && typeof gender.femaleBasisPoints === "number") {
    return `${gender.maleBasisPoints / 100}% ♂ / ${gender.femaleBasisPoints / 100}% ♀`;
  }
  return "—";
}

function statLabel(key: string): string {
  return ({ hp: "HP", atk: "Atk", def: "Def", spa: "SpAtk", spd: "SpDef", spe: "Speed" } as Record<string, string>)[key] ?? key;
}

function moveName(move: MoveRecord | undefined, moveId: string): string {
  return humanizeSlug(canonicalSlug(move?.id ?? moveId, "move"));
}

function typeName(type: TypeRecord | undefined, typeId: string): string {
  return type?.sourceName ?? humanizeSlug(canonicalSlug(typeId, "type"));
}

function abilityName(ability: AbilityRecord | undefined, abilityId: string): string {
  return ability?.sourceName ?? humanizeSlug(canonicalSlug(abilityId, "ability"));
}

function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function SpeciesFacts({
  species,
  typeById,
  abilityById,
}: {
  species: SpeciesRecord;
  typeById: ReadonlyMap<string, TypeRecord>;
  abilityById: ReadonlyMap<string, AbilityRecord>;
}) {
  return (
    <section className="workbench-card" aria-labelledby="species-facts-title">
      <div className="workbench-card__header">
        <div>
          <p className="workbench-kicker">Dados canônicos</p>
          <h2 id="species-facts-title">{species.sourceName}</h2>
        </div>
        <span className="workbench-dex">{formatDex(species.nationalDexNumber)}</span>
      </div>

      <div className="fact-grid">
        <div><span>Geração</span><strong>{species.introducedGeneration}</strong></div>
        <div><span>Tipos</span><strong>{species.typeIds.map((id) => typeName(typeById.get(id), id)).join(" / ")}</strong></div>
        <div><span>Catch rate</span><strong>{species.catchRate}</strong></div>
        <div><span>Base EXP</span><strong>{formatFact(species.baseExperience)}</strong></div>
        <div><span>Growth rate</span><strong>{humanizeSlug(species.growthRate)}</strong></div>
        <div><span>Friendship</span><strong>{formatFact(species.baseFriendship)}</strong></div>
        <div><span>Altura</span><strong>{(species.heightMillimeters / 1000).toFixed(2)} m</strong></div>
        <div><span>Peso</span><strong>{(species.weightGrams / 1000).toFixed(1)} kg</strong></div>
        <div><span>Egg cycles</span><strong>{formatFact(species.eggCycles)}</strong></div>
        <div><span>Egg groups</span><strong>{species.eggGroups.map(humanizeSlug).join(" / ")}</strong></div>
        <div><span>Gênero</span><strong>{formatGender(species.genderRatio)}</strong></div>
        <div><span>Forma</span><strong>{species.formLabel ?? "Base"}</strong></div>
      </div>

      <div className="stats-grid" aria-label="Base stats">
        {Object.entries(species.baseStats).map(([key, value]) => (
          <div key={key}><span>{statLabel(key)}</span><strong>{value}</strong></div>
        ))}
      </div>

      <div className="workbench-subsection">
        <h3>Abilities</h3>
        <ul className="chip-list">
          {species.abilities.map(({ abilityId, sourceAbilitySlot }) => (
            <li key={`${abilityId}:${sourceAbilitySlot}`}>
              <strong>{abilityName(abilityById.get(abilityId), abilityId)}</strong>
              <span>{humanizeSlug(sourceAbilitySlot)}</span>
            </li>
          ))}
        </ul>
      </div>

      <details className="raw-record">
        <summary>Registro completo de Species</summary>
        <pre>{JSON.stringify(species, null, 2)}</pre>
      </details>
    </section>
  );
}

function LearnsetPanel({
  species,
  entries,
  learnLevelOverrides,
  onLearnLevelChange,
  moveById,
  typeById,
}: {
  species: SpeciesRecord;
  entries: LearnsetRecord[];
  learnLevelOverrides: ReadonlyMap<string, number>;
  onLearnLevelChange: (entry: LearnsetRecord, level: number | null) => void;
  moveById: ReadonlyMap<string, MoveRecord>;
  typeById: ReadonlyMap<string, TypeRecord>;
}) {
  const sorted = useMemo(() => sortLearnsets(entries), [entries]);
  const [viewMode, setViewMode] = useState<MoveViewMode>("line");
  const levelUpCount = sorted.filter(({ method }) => method === "level-up").length;
  const editedCount = sorted.filter((entry) => learnLevelOverrides.has(learnsetKey(entry))).length;

  const learnLevelEditor = (entry: LearnsetRecord, moveLabel: string) => {
    if (entry.method !== "level-up" || entry.level === null) return <span className="learn-level-na">—</span>;
    const key = learnsetKey(entry);
    const edited = learnLevelOverrides.has(key);
    const level = effectiveLearnLevel(entry, learnLevelOverrides);
    return (
      <div className="learn-level-editor">
        <label>
          <span className="visually-hidden">Learn level de {moveLabel}</span>
          <input
            type="number"
            min="1"
            max={MAX_LEARN_LEVEL}
            step="1"
            value={level ?? entry.level}
            onChange={(event) => {
              const next = event.currentTarget.valueAsNumber;
              if (Number.isSafeInteger(next) && next >= 1 && next <= MAX_LEARN_LEVEL) onLearnLevelChange(entry, next);
            }}
          />
        </label>
        {edited ? (
          <button type="button" className="learn-level-reset" onClick={() => onLearnLevelChange(entry, null)} aria-label={`Restaurar Learn level canônico de ${moveLabel}`}>
            ↺
          </button>
        ) : null}
        <small>{edited ? `canônico ${entry.level}` : "canônico"}</small>
      </div>
    );
  };

  return (
    <section className="workbench-card" aria-labelledby="learnset-title">
      <div className="workbench-card__header workbench-card__header--wrap">
        <div>
          <p className="workbench-kicker">Learnset completo do bundle</p>
          <h2 id="learnset-title">Moves de {species.sourceName}</h2>
          <p className="learnset-help">Edite o <strong>Learn Level</strong> das entradas level-up. O valor canônico permanece preservado para comparação e validação do import.</p>
        </div>
        <div className="learnset-toolbar">
          <div className="summary-pills" aria-label="Resumo do learnset">
            <span>{sorted.length} registros</span>
            <span>{levelUpCount} level-up</span>
            <span>{editedCount} editados</span>
          </div>
          <div className="view-toggle" role="group" aria-label="Visualização dos moves">
            <button type="button" aria-pressed={viewMode === "line"} onClick={() => setViewMode("line")}>Linha</button>
            <button type="button" aria-pressed={viewMode === "card"} onClick={() => setViewMode("card")}>Cards</button>
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="workbench-muted">Nenhum Learnset canônico disponível para este registro.</p>
      ) : viewMode === "line" ? (
        <div className="move-table" role="table" aria-label={`Learnset de ${species.sourceName}`}>
          <div className="move-row move-row--header" role="row">
            <span role="columnheader">Move</span>
            <span role="columnheader">Learn Lv.</span>
            <span role="columnheader">Método</span>
            <span role="columnheader">Power</span>
            <span role="columnheader">Acc.</span>
            <span role="columnheader">PP</span>
            <span role="columnheader">Fonte</span>
          </div>
          {sorted.map((entry) => {
            const move = moveById.get(entry.moveId);
            const label = moveName(move, entry.moveId);
            const edited = learnLevelOverrides.has(learnsetKey(entry));
            return (
              <div key={learnsetKey(entry)} className={edited ? "move-row move-row--edited" : "move-row"} role="row">
                <div className="move-row__name" role="cell">
                  <strong>{label}</strong>
                  <small>{move ? `${typeName(typeById.get(move.typeId), move.typeId)} · ${move.category}` : "Move sem catálogo"}</small>
                </div>
                <div role="cell" data-label="Learn Lv.">{learnLevelEditor(entry, label)}</div>
                <div role="cell" data-label="Método"><strong>{humanizeSlug(entry.method)}</strong>{entry.machineIdentifier ? <small>{entry.machineIdentifier}</small> : null}</div>
                <div role="cell" data-label="Power">{move?.power ?? "—"}</div>
                <div role="cell" data-label="Acc.">{move?.accuracy ?? "—"}</div>
                <div role="cell" data-label="PP">{move?.basePp ?? "—"}</div>
                <div className="move-row__source" role="cell" data-label="Fonte">
                  <span>{humanizeSlug(entry.sourceGame)} · Gen {entry.sourceGeneration}</span>
                  <details className="move-row__details">
                    <summary>Detalhes</summary>
                    <dl>
                      <div><dt>Target</dt><dd>{move ? humanizeSlug(move.sourceTarget) : "—"}</dd></div>
                      <div><dt>Contato</dt><dd>{move ? (move.makesContact ? "Sim" : "Não") : "—"}</dd></div>
                      <div><dt>ZA cooldown</dt><dd>{move?.zaBaseCooldownMs == null ? "—" : `${move.zaBaseCooldownMs / 1000}s`}</dd></div>
                    </dl>
                    <pre>{JSON.stringify({ learnset: entry, move }, null, 2)}</pre>
                  </details>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <ol className="learnset-list">
          {sorted.map((entry) => {
            const move = moveById.get(entry.moveId);
            const label = moveName(move, entry.moveId);
            const edited = learnLevelOverrides.has(learnsetKey(entry));
            return (
              <li key={learnsetKey(entry)} className={edited ? "move-card move-card--edited" : "move-card"}>
                <div className="move-card__title">
                  <div>
                    <strong>{label}</strong>
                    <span>{move ? typeName(typeById.get(move.typeId), move.typeId) : "Move sem catálogo"} · {move?.category ?? "—"}</span>
                  </div>
                  {edited ? <span className="edited-badge">Learn Level editado</span> : null}
                </div>

                <dl className="move-grid">
                  <div><dt>Método</dt><dd>{humanizeSlug(entry.method)}</dd></div>
                  <div className="move-grid__learn-level"><dt>Learn level</dt><dd>{learnLevelEditor(entry, label)}</dd></div>
                  <div><dt>Jogo fonte</dt><dd>{humanizeSlug(entry.sourceGame)}</dd></div>
                  <div><dt>Geração fonte</dt><dd>{entry.sourceGeneration}</dd></div>
                  <div><dt>Machine</dt><dd>{entry.machineIdentifier ?? "—"}</dd></div>
                  <div><dt>Power</dt><dd>{move?.power ?? "—"}</dd></div>
                  <div><dt>Accuracy</dt><dd>{move?.accuracy ?? "—"}</dd></div>
                  <div><dt>PP</dt><dd>{move?.basePp ?? "—"}</dd></div>
                  <div><dt>Target</dt><dd>{move ? humanizeSlug(move.sourceTarget) : "—"}</dd></div>
                  <div><dt>Contato</dt><dd>{move ? (move.makesContact ? "Sim" : "Não") : "—"}</dd></div>
                  <div><dt>ZA cooldown</dt><dd>{move?.zaBaseCooldownMs == null ? "—" : `${move.zaBaseCooldownMs / 1000}s`}</dd></div>
                </dl>

                <details className="raw-record raw-record--compact">
                  <summary>IDs e proveniência</summary>
                  <pre>{JSON.stringify({ learnset: entry, move }, null, 2)}</pre>
                </details>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Workbench({ data }: { data: WorkbenchData }) {
  const importRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [generation, setGeneration] = useState<GenerationFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [learnLevelOverrides, setLearnLevelOverrides] = useState<Map<string, number>>(() => new Map());
  const [currentSpeciesId, setCurrentSpeciesId] = useState<string | null>(null);
  const [status, setStatus] = useState("Base publicada v5 e staging local de Hoenn carregados.");

  const species = useMemo(
    () => sortSpecies(data.species.filter((record) =>
      isBaseSpecies(record) && record.nationalDexNumber <= 386 && record.introducedGeneration <= 3)),
    [data.species],
  );
  const analysisData = useMemo<WorkbenchData>(() => ({ ...data, species }), [data, species]);
  const baseSpecies = useMemo(() => species.filter(isBaseSpecies), [species]);
  const moveById = useMemo(() => new Map(data.moves.map((record) => [record.id, record])), [data.moves]);
  const typeById = useMemo(() => new Map(data.types.map((record) => [record.id, record])), [data.types]);
  const abilityById = useMemo(() => new Map(data.abilities.map((record) => [record.id, record])), [data.abilities]);
  const learnsetsBySpecies = useMemo(() => {
    const result = new Map<string, LearnsetRecord[]>();
    for (const entry of data.learnsets) {
      const bucket = result.get(entry.speciesId);
      if (bucket) bucket.push(entry);
      else result.set(entry.speciesId, [entry]);
    }
    return result;
  }, [data.learnsets]);

  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const filteredSpecies = useMemo(() => species.filter((record) => {
    if (generation !== "all" && record.introducedGeneration !== Number(generation)) return false;
    if (!normalizedQuery) return true;
    return record.sourceName.toLocaleLowerCase("pt-BR").includes(normalizedQuery)
      || record.sourceSlug.toLocaleLowerCase("pt-BR").includes(normalizedQuery)
      || String(record.nationalDexNumber).includes(normalizedQuery);
  }), [generation, normalizedQuery, species]);

  useEffect(() => {
    if (currentSpeciesId && species.some(({ id }) => id === currentSpeciesId)) return;
    setCurrentSpeciesId(species[0]?.id ?? null);
  }, [currentSpeciesId, species]);

  const currentSpecies = species.find(({ id }) => id === currentSpeciesId) ?? null;
  const updateSelection = (speciesId: string, checked: boolean) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (checked) next.add(speciesId);
      else next.delete(speciesId);
      return next;
    });
  };

  const setLearnLevel = (entry: LearnsetRecord, level: number | null) => {
    const key = learnsetKey(entry);
    setLearnLevelOverrides((previous) => {
      const next = new Map(previous);
      if (level === null || level === entry.level) next.delete(key);
      else if (entry.method === "level-up" && entry.level !== null && Number.isSafeInteger(level) && level >= 1 && level <= MAX_LEARN_LEVEL) next.set(key, level);
      return next;
    });
  };

  const exportData = (kind: "all" | "selected") => {
    try {
      const exported = createWorkbenchExport(analysisData, kind, selectedIds, learnLevelOverrides);
      const suffix = kind === "all" ? "all" : `${exported.scope.speciesIds.length}-selected`;
      downloadJson(`pokenexus-pokemon-move-workbench-${suffix}.json`, stringifyWorkbenchExport(exported));
      setStatus(`Export ${kind === "all" ? "completo" : "selecionado"}: ${exported.scope.speciesIds.length} Species.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao exportar JSON.");
    }
  };

  const importJson = async (file: File) => {
    try {
      const parsed = parseWorkbenchImport(JSON.parse(await file.text()) as unknown, analysisData);
      setLearnLevelOverrides(new Map(parsed.analysis.learnLevelOverrides.map(({ learnsetKey: key, level }) => [key, level])));
      setSelectedIds(new Set(parsed.scope.speciesIds));
      setCurrentSpeciesId(parsed.scope.speciesIds[0] ?? currentSpeciesId);
      setStatus(`Import validado: ${parsed.scope.speciesIds.length} Species; base ${parsed.base.gameDataVersion}.`);
    } catch (error) {
      setStatus(`Import rejeitado: ${error instanceof Error ? error.message : "JSON inválido"}`);
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const missingBaseSpecies = Math.max(0, 386 - baseSpecies.length);

  return (
    <main className="workbench-shell">
      <header className="workbench-hero">
        <div>
          <p className="workbench-kicker">TASK-117 · ferramenta local de análise</p>
          <h1>Pokémon Move Workbench</h1>
          <p>Base publicada v5 combinada com o staging local de Hoenn, com Learn Level editável como override de análise/staging.</p>
        </div>
        <div className="coverage-card" aria-label="Cobertura do catálogo">
          <strong>{baseSpecies.length} / 386</strong>
          <span>base Species até Gen III</span>
          <small>
            {missingBaseSpecies === 0 ? "Cobertura local completa para 001–386" : `${missingBaseSpecies} base Species ainda sem cobertura local`}
            {" · "}{data.species.length} registros fonte carregados no conjunto base + staging
          </small>
        </div>
      </header>

      <section className="authority-banner" aria-label="Identidade da base publicada e do staging local">
        <div><span>Base publicada</span><strong>{data.base.gameDataVersion}</strong></div>
        <div><span>Schema</span><strong>{data.base.schemaVersion}</strong></div>
        <div><span>Species carregados</span><strong>{data.species.length}</strong></div>
        <div><span>Moves carregados</span><strong>{data.moves.length}</strong></div>
        <div><span>Learnsets carregados</span><strong>{data.learnsets.length.toLocaleString("pt-BR")}</strong></div>
        <details>
          <summary>Proveniência</summary>
          <small>
            Base publicada: {WORKBENCH_SOURCE_COUNTS.published.species} Species · {WORKBENCH_SOURCE_COUNTS.published.moves} Moves ·
            {" "}{WORKBENCH_SOURCE_COUNTS.published.learnsets.toLocaleString("pt-BR")} Learnsets
          </small>
          <small>
            Staging Hoenn: +{WORKBENCH_SOURCE_COUNTS.staging.species} Species · +{WORKBENCH_SOURCE_COUNTS.staging.moves} Moves ·
            {" "}+{WORKBENCH_SOURCE_COUNTS.staging.learnsets.toLocaleString("pt-BR")} Learnsets
          </small>
          <code>{data.base.bundleHash}</code>
          <code>{data.base.provenanceHash}</code>
          <code>{data.staging.artifactHash}</code>
        </details>
      </section>

      <section className="workbench-actions" aria-label="Importação e exportação">
        <button className="button" type="button" onClick={() => exportData("all")}>Exportar tudo</button>
        <button className="button button--secondary" type="button" onClick={() => exportData("selected")} disabled={selectedIds.size === 0}>
          Exportar selecionados ({selectedIds.size})
        </button>
        <button className="button button--secondary" type="button" onClick={() => importRef.current?.click()}>Importar JSON</button>
        <input
          ref={importRef}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          aria-label="Importar arquivo JSON do workbench"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void importJson(file);
          }}
        />
        <p className="workbench-status" role="status" aria-live="polite">{status}</p>
      </section>

      <div className="workbench-layout">
        <aside className="species-browser" aria-labelledby="species-browser-title">
          <div className="species-browser__header">
            <div>
              <p className="workbench-kicker">Catálogo</p>
              <h2 id="species-browser-title">Pokémon</h2>
            </div>
            <span>{filteredSpecies.length}</span>
          </div>

          <div className="filter-stack">
            <label>
              <span>Buscar</span>
              <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Nome ou #Dex" type="search" />
            </label>
            <label>
              <span>Geração</span>
              <select value={generation} onChange={(event) => setGeneration(event.currentTarget.value as GenerationFilter)}>
                <option value="all">Gen I–III</option>
                <option value="1">Gen I</option>
                <option value="2">Gen II</option>
                <option value="3">Gen III</option>
              </select>
            </label>
          </div>

          <div className="selection-actions">
            <button type="button" onClick={() => setSelectedIds((previous) => new Set([...previous, ...filteredSpecies.map(({ id }) => id)]))}>Selecionar visíveis</button>
            <button type="button" onClick={() => setSelectedIds(new Set())}>Limpar seleção</button>
          </div>

          <ul className="species-list">
            {filteredSpecies.map((record) => (
              <li key={record.id} className={record.id === currentSpeciesId ? "species-row species-row--active" : "species-row"}>
                <label className="species-row__check">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(record.id)}
                    onChange={(event) => updateSelection(record.id, event.currentTarget.checked)}
                    aria-label={`Selecionar ${record.sourceName}`}
                  />
                </label>
                <button type="button" className="species-row__open" onClick={() => setCurrentSpeciesId(record.id)} aria-current={record.id === currentSpeciesId ? "true" : undefined}>
                  <span>{formatDex(record.nationalDexNumber)}</span>
                  <strong>{record.sourceName}</strong>
                  {record.formLabel ? <small>{record.formLabel}</small> : null}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="workbench-detail">
          {currentSpecies ? (
            <>
              <SpeciesFacts species={currentSpecies} typeById={typeById} abilityById={abilityById} />
              <LearnsetPanel
                species={currentSpecies}
                entries={learnsetsBySpecies.get(currentSpecies.id) ?? []}
                learnLevelOverrides={learnLevelOverrides}
                onLearnLevelChange={setLearnLevel}
                moveById={moveById}
                typeById={typeById}
              />
            </>
          ) : (
            <section className="workbench-card"><p>Nenhum Pokémon disponível no filtro atual.</p></section>
          )}
        </div>
      </div>
    </main>
  );
}

function App() {
  const [data, setData] = useState<WorkbenchData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadCurrentWorkbenchData(controller.signal).then(setData).catch((caught: unknown) => {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "Falha ao carregar os catálogos.");
    });
    return () => controller.abort();
  }, []);

  if (error) {
    return <main className="standalone-state"><section className="state-card state-card--error"><h1>Falha ao abrir o workbench</h1><p>{error}</p></section></main>;
  }
  if (!data) {
    return <main className="standalone-state"><section className="state-card"><div className="state-card__indicator" aria-hidden="true" /><h1>Carregando catálogos</h1><p>Base publicada v5 e staging local de Hoenn.</p></section></main>;
  }
  return <Workbench data={data} />;
}

const root = document.getElementById("root");
if (!root) throw new Error("Pokémon analysis preview root missing");
createRoot(root).render(<StrictMode><App /></StrictMode>);

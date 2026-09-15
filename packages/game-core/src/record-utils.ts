export function hasOwnKey(record: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function ownGet<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return hasOwnKey(record, key) ? record[key] : undefined;
}

export function createSafeRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

export function safeRecordFromEntries<T>(entries: Iterable<readonly [string, T]>): Record<string, T> {
  const record = createSafeRecord<T>();
  for (const [key, value] of entries) record[key] = value;
  return record;
}

export function cloneSafeRecord<T>(record: Readonly<Record<string, T>>): Record<string, T> {
  return safeRecordFromEntries(Object.entries(record));
}

export function safeRecordWith<T>(record: Readonly<Record<string, T>>, key: string, value: T): Record<string, T> {
  const clone = cloneSafeRecord(record);
  clone[key] = value;
  return clone;
}

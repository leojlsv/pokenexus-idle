type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function canonicalValue(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.normalize("NFC");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path}: non-finite numbers are not canonical JSON`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalValue(entry, `${path}[${index}]`));
  }
  if (typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry === undefined) throw new TypeError(`${path}.${key}: undefined is not canonical JSON`);
      result[key.normalize("NFC")] = canonicalValue(entry, `${path}.${key}`);
    }
    return result;
  }
  throw new TypeError(`${path}: unsupported canonical JSON value ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value, "$"));
}

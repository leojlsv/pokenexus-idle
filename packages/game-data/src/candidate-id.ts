import { createHash } from "node:crypto";

export function proposeCandidateId(
  kind: "species" | "move" | "type" | "ability" | "item",
  sourceKey: string,
): string {
  const normalized = sourceKey
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = createHash("sha256")
    .update(Buffer.from(sourceKey.normalize("NFC"), "utf8"))
    .digest("hex")
    .slice(0, 10);
  return `candidate:${kind}:${normalized || "source"}:${suffix}`;
}

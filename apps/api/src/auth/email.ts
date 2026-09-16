import { domainToASCII } from "node:url";

export interface CanonicalRecoveryEmail {
  readonly canonical: string;
  readonly delivery: string;
}

const DOT_ATOM_LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const QUOTED_LOCAL = /^"(?:[\x20-\x21\x23-\x5B\x5D-\x7E]|\\[\x20-\x7E])*"$/;
const UNQUOTED_ADDR_SPEC_FORBIDDEN = new Set(["(", ")", "<", ">", ",", ";", ":", "[", "]"]);

function trimAsciiWhitespace(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end) {
    const code = value.charCodeAt(start);
    if (code !== 0x20 && (code < 0x09 || code > 0x0d)) break;
    start += 1;
  }
  while (end > start) {
    const code = value.charCodeAt(end - 1);
    if (code !== 0x20 && (code < 0x09 || code > 0x0d)) break;
    end -= 1;
  }
  return value.slice(start, end);
}

function validateLocalPart(localPart: string): void {
  if (localPart.length === 0 || localPart.length > 64) {
    throw new Error("Recovery email local-part length is invalid");
  }
  for (const character of localPart) {
    if (character.codePointAt(0)! > 0x7f) {
      throw new Error("Recovery email local-part must be ASCII");
    }
  }
  if (!DOT_ATOM_LOCAL.test(localPart) && !QUOTED_LOCAL.test(localPart)) {
    throw new Error("Recovery email local-part is not a supported addr-spec local-part");
  }
}

function validateAsciiDomain(domain: string): void {
  if (domain.length === 0 || domain.length > 253 || domain.startsWith(".") || domain.endsWith(".")) {
    throw new Error("Recovery email domain is invalid");
  }
  const labels = domain.split(".");
  for (const label of labels) {
    if (
      label.length === 0 ||
      label.length > 63 ||
      label.startsWith("-") ||
      label.endsWith("-") ||
      !/^[a-z0-9-]+$/i.test(label)
    ) {
      throw new Error("Recovery email domain is invalid");
    }
  }
}

function findAddressSeparator(value: string): number {
  let separator = -1;
  let inQuotes = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (inQuotes) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inQuotes = false;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
      continue;
    }
    if (character === "@") {
      if (separator !== -1) {
        throw new Error("Recovery email must contain exactly one address separator");
      }
      separator = index;
      continue;
    }
    if (UNQUOTED_ADDR_SPEC_FORBIDDEN.has(character)) {
      throw new Error("Recovery email must be a single addr-spec");
    }
  }

  if (inQuotes || escaped) {
    throw new Error("Recovery email quoted local-part is malformed");
  }
  return separator;
}

export function canonicalizeRecoveryEmail(input: string): CanonicalRecoveryEmail {
  const value = trimAsciiWhitespace(input);
  if (value.length === 0 || value.length > 320) {
    throw new Error("Recovery email must be a single addr-spec");
  }

  const atIndex = findAddressSeparator(value);
  if (atIndex <= 0 || atIndex === value.length - 1) {
    throw new Error("Recovery email must contain exactly one address separator");
  }

  const localPart = value.slice(0, atIndex);
  const domainInput = value.slice(atIndex + 1);
  validateLocalPart(localPart);

  const asciiDomain = domainToASCII(domainInput);
  if (!asciiDomain) {
    throw new Error("Recovery email domain cannot be converted to an ASCII A-label");
  }
  const normalizedDomain = asciiDomain.toLowerCase();
  validateAsciiDomain(normalizedDomain);

  const canonicalLocal = localPart.toLowerCase();
  return {
    canonical: `${canonicalLocal}@${normalizedDomain}`,
    delivery: `${localPart}@${normalizedDomain}`,
  };
}

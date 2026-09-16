import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

function canonicalFilePath(url) {
  if (url.protocol !== "file:") throw new Error(`benchmark dist resolver requires file URLs: ${url.href}`);
  return path.resolve(fileURLToPath(url));
}

function isWithinRoot(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

export function resolveGameCoreDistCandidate(specifier, parentURL, distRootUrl) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  if (!isRelative || path.extname(specifier) !== "") return null;
  if (!parentURL) return null;

  const rootUrl = new URL("./", distRootUrl);
  const parentUrl = new URL(parentURL);
  const rootPath = canonicalFilePath(rootUrl);
  const parentPath = canonicalFilePath(parentUrl);
  if (!isWithinRoot(rootPath, parentPath)) return null;

  const candidateUrl = new URL(`${specifier}.js`, parentUrl);
  const candidatePath = canonicalFilePath(candidateUrl);
  if (!isWithinRoot(rootPath, candidatePath) || candidatePath === rootPath) {
    throw new Error(`benchmark dist resolver refused path escape: ${specifier} from ${parentURL}`);
  }
  return candidateUrl.href;
}

export function registerGameCoreDistResolver(distRootUrl) {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const candidate = resolveGameCoreDistCandidate(specifier, context.parentURL, distRootUrl);
      return candidate === null ? nextResolve(specifier, context) : nextResolve(candidate, context);
    },
  });
}

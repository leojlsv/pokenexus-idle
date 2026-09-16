import os from "node:os";
import process from "node:process";

export function environmentMetadata() {
  const cpus = os.cpus();
  return {
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    logicalCpuCount: cpus.length,
    cpuModel: cpus[0]?.model ?? "unknown",
    totalMemoryBytes: os.totalmem(),
    execArgv: [...process.execArgv],
  };
}

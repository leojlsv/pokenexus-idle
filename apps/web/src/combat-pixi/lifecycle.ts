export interface DisposablePixiRuntime {
  destroy(): void;
}

export interface AsyncPixiMount<T extends DisposablePixiRuntime> {
  dispose(): void;
  getRuntime(): T | null;
}

export function mountAsyncPixiRuntime<T extends DisposablePixiRuntime>(
  createRuntime: () => Promise<T>,
  onReady: (runtime: T) => void,
  onError?: (error: unknown) => void,
): AsyncPixiMount<T> {
  let disposed = false;
  let runtime: T | null = null;

  void createRuntime().then((created) => {
    if (disposed) {
      created.destroy();
      return;
    }
    runtime = created;
    onReady(created);
  }).catch((error: unknown) => {
    if (!disposed) onError?.(error);
  });

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      runtime?.destroy();
      runtime = null;
    },
    getRuntime() {
      return runtime;
    },
  };
}

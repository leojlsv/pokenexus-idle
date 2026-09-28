export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="state-card" role="status" aria-live="polite">
      <span className="state-card__indicator" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="state-card">
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  );
}

export function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <div className="state-card state-card--error" role="alert">
      <strong>{title}</strong>
      <span>{message}</span>
      {onRetry ? <button className="button" type="button" onClick={onRetry}>Retry</button> : null}
    </div>
  );
}

export function LoadingOverlay({ text }: { text: string }) {
  return (
    <div className="overlay loading-overlay" role="status" aria-live="polite">
      <div className="loading-box">
        <span className="spinner" aria-hidden="true" />
        <span>{text}</span>
      </div>
    </div>
  );
}

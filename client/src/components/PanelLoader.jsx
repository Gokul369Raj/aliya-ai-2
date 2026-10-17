import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';

/**
 * Loading state for panels that read git history.
 *
 * Repos are cloned with `--depth 1`, so the first health / git request makes the
 * server run `git fetch --deepen` before it can answer. That can take up to a
 * minute, which used to look like a permanently stuck panel. Show what is
 * actually happening, and how long it has been happening for.
 */
export default function PanelLoader({ label, hint }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), 500);
    return () => clearInterval(timer);
  }, []);

  const seconds = Math.floor(elapsed / 1000);
  const showHint = seconds >= 8;

  return (
    <div className="panel-loader" role="status" aria-live="polite">
      <span className="panel-loader-spinner">
        <LoaderCircle className="spin" size={20} />
      </span>
      <p className="panel-loader-label">{label}</p>
      {showHint && (
        <p className="panel-loader-hint">
          {hint
            || 'Deepening git history — the first load on a shallow clone can take up to a minute.'}
        </p>
      )}
      <span className="panel-loader-elapsed">{seconds}s</span>
    </div>
  );
}

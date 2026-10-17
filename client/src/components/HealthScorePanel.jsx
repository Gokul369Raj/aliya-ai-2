import { useEffect, useState } from 'react';
import { Building2, Sparkles, Shield, Wrench, BookOpen } from 'lucide-react';
import { getHealthScore } from '../api';
import PanelLoader from './PanelLoader';
import { VIZ_PALETTE } from '../graph-utils';

/* These colours paint both the ring arc and the score text, so they carry the
   4.5:1 text floor rather than the 3:1 graphics one — var(--accent) (#0cb531)
   only reaches 2.37:1 on paper and made the number nearly unreadable. */
function getScoreColor(score) {
  if (score >= 80) return VIZ_PALETTE.green;
  if (score >= 60) return VIZ_PALETTE.ochreDeep;
  if (score >= 40) return VIZ_PALETTE.amberDeep;
  return VIZ_PALETTE.wine;
}

/* Mirrors getGrade() in server/health-score.js so the grade beside the overall
   score is the overall grade. It used to print the *architecture* grade next to
   the overall number, which disagreed with the score it sat under. */
function getGrade(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B+';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C+';
  if (score >= 40) return 'C';
  if (score >= 30) return 'D';
  return 'F';
}

const GRADE_SCALE = ['A+ ≥ 90', 'A ≥ 80', 'B+ ≥ 70', 'B ≥ 60', 'C+ ≥ 50', 'C ≥ 40', 'D ≥ 30', 'F < 30'];

const CATEGORY_META = [
  { key: 'architecture', label: 'Architecture', icon: Building2 },
  { key: 'quality', label: 'Code Quality', icon: Sparkles },
  { key: 'security', label: 'Security', icon: Shield },
  { key: 'maintainability', label: 'Maintainability', icon: Wrench },
  { key: 'documentation', label: 'Documentation', icon: BookOpen },
];

function formatDelta(delta) {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return String(delta);
  return '0';
}

function ScoreRing({ score, grade, size = 118 }) {
  const color = getScoreColor(score);
  const stroke = 8;
  const radius = (size - stroke) / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const center = size / 2;

  return (
    <div className="health-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {/* Ink frame around the dial, a recessed track, then a flat-capped arc. */}
        <circle cx={center} cy={center} r={radius + 4} fill="none" stroke="var(--ink)" strokeWidth="2" />
        <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--bg-inset)" strokeWidth={stroke} />
        <circle
          className="health-ring-arc"
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <div className="health-ring-center">
        <span className="health-ring-score" style={{ color }}>{score}</span>
        <span className="health-ring-grade">{grade}</span>
      </div>
    </div>
  );
}

/**
 * The arithmetic behind one category, spelled out.
 *
 * Every term comes from the server ledger, which records the exact delta each
 * scanner signal applied. Nothing here is inferred — if a signal cost 8 points
 * the list says −8.
 */
function Ledger({ data }) {
  return (
    <div className="health-ledger">
      <span className="health-ledger-term">starts at {data.baseline}</span>
      <span className="health-ledger-term is-positive">+{data.credits} earned</span>
      <span className="health-ledger-term is-negative">−{Math.abs(data.penalties)} lost</span>
      <span className="health-ledger-term is-total">= {data.score}</span>
      {data.clamped && (
        <span className="health-ledger-note">ran past the scale, capped at {data.score}</span>
      )}
    </div>
  );
}

function Breakdown({ data }) {
  // Older stored payloads only carry the flat `evidence` strings; fall back to
  // them rather than rendering an empty list.
  const rows = Array.isArray(data.breakdown) && data.breakdown.length
    ? data.breakdown
    : (data.evidence || []).map((text) => ({ text, delta: 0, impact: 'neutral' }));

  if (!rows.length) {
    return <p className="health-evidence-empty">Insufficient Evidence — the scanner reported no signals for this category.</p>;
  }

  return (
    <ul className="health-evidence-list">
      {rows.map((entry, index) => (
        <li key={index} className={`health-evidence-item is-${entry.impact}`}>
          <span className="health-evidence-delta">{formatDelta(entry.delta)}</span>
          <span className="health-evidence-text">{entry.text}</span>
        </li>
      ))}
    </ul>
  );
}

export default function HealthScorePanel({ repoId }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!repoId) return;
    setLoading(true);
    setError(null);
    getHealthScore(repoId)
      .then(data => { setHealth(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [repoId]);

  if (loading) {
    return <PanelLoader label="Analyzing repository health…" />;
  }

  if (error) {
    return (
      <div className="health-error">
        <strong>Failed to load health score</strong>
        <span>{error}</span>
      </div>
    );
  }

  if (!health) return null;

  const { overall, scores } = health;
  const contributions = Array.isArray(health.contributions) ? health.contributions : [];
  const expandedCategory = CATEGORY_META.find(c => c.key === expanded);
  const ExpandedIcon = expandedCategory?.icon;

  return (
    <div className="health-panel">
      {/* Overall — the number, plus exactly how it was reached. */}
      <section className="health-overall">
        <div className="health-overall-copy">
          <span className="health-eyebrow">Repository health</span>
          <span className="health-overall-note">
            Deterministic score from structure, code signals and repository hygiene. Every
            point comes from a scanner field — no AI guesswork.
          </span>

          {contributions.length > 0 && (
            <ul className="health-contributions">
              {contributions.map((item) => (
                <li key={item.key}>
                  <span className="health-contribution-label">
                    {CATEGORY_META.find(c => c.key === item.key)?.label || item.key}
                  </span>
                  <span className="health-contribution-math">
                    {item.score} × {item.weight} = {item.points.toFixed(2)}
                  </span>
                </li>
              ))}
              <li className="health-contribution-total">
                <span className="health-contribution-label">Weighted mean</span>
                <span className="health-contribution-math">{overall}</span>
              </li>
            </ul>
          )}
        </div>
        <ScoreRing score={overall} grade={getGrade(overall)} />
      </section>

      {/* Category breakdown */}
      <div className="health-categories">
        {CATEGORY_META.map(({ key, label, icon: Icon }) => {
          const data = scores[key];
          if (!data) return null;
          const isOpen = expanded === key;
          const color = getScoreColor(data.score);
          return (
            <button
              key={key}
              type="button"
              className={`health-category-card ${isOpen ? 'is-open' : ''}`}
              onClick={() => setExpanded(isOpen ? null : key)}
              aria-expanded={isOpen}
              title={`${label} — show what earned and what cost points`}
            >
              <span className="health-category-head">
                <Icon size={13} className="health-category-icon" />
                <span className="health-category-label">{label}</span>
              </span>
              <span className="health-category-value">
                <span className="health-category-score" style={{ color }}>{data.score}</span>
                <span className="health-category-grade">{data.grade}</span>
              </span>
              <span className="health-category-track">
                <span className="health-category-fill" style={{ width: `${Math.max(2, data.score)}%`, background: color }} />
              </span>
              <span className="health-category-deltas">
                <span className="is-positive">+{data.credits ?? 0}</span>
                <span className="is-negative">
                  {data.penalties ? `−${Math.abs(data.penalties)}` : '0'}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Evidence for the open category, with the real score delta per signal */}
      {expandedCategory && ExpandedIcon && scores[expandedCategory.key] && (
        <section className="health-evidence">
          <div className="health-evidence-title">
            <ExpandedIcon size={13} />
            Why {expandedCategory.label} scored {scores[expandedCategory.key].score}
          </div>
          <Ledger data={scores[expandedCategory.key]} />
          <Breakdown data={scores[expandedCategory.key]} />
        </section>
      )}

      {/* Grade scale */}
      <div className="health-grade-legend">
        <span className="health-grade-legend-label">Grade scale</span>
        <div className="health-grade-chips">
          {GRADE_SCALE.map(entry => <span key={entry} className="health-grade-chip">{entry}</span>)}
        </div>
      </div>
    </div>
  );
}

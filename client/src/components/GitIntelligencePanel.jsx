import React, { useEffect, useState } from 'react';
import { VIZ_PALETTE } from '../graph-utils';
import { Clock, AlertTriangle, Ban, Users, Info } from 'lucide-react';
import { getGitIntelligence } from '../api';
import PanelLoader from './PanelLoader';

function RiskBadge({ risk }) {
  const colors = { high: VIZ_PALETTE.pink, medium: VIZ_PALETTE.ochre, low: VIZ_PALETTE.green };
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 6,
      background: `${colors[risk] || VIZ_PALETTE.neutral}22`, color: colors[risk] || VIZ_PALETTE.neutral,
      textTransform: 'uppercase', letterSpacing: 0.5,
    }}>
      {risk}
    </span>
  );
}

export default function GitIntelligencePanel({ repoId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('recent');

  useEffect(() => {
    if (!repoId) return;
    setLoading(true);
    getGitIntelligence(repoId)
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [repoId]);

  if (loading) return <PanelLoader label="Loading git intelligence…" />;
  if (error) return <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: VIZ_PALETTE.pink }}>{error}</div>;
  if (!data) return null;

  const tabs = [
    { id: 'recent', label: 'Recent', icon: <Clock size={12} /> },
    { id: 'risky', label: 'Risky', icon: <AlertTriangle size={12} /> },
    { id: 'abandoned', label: 'Stale', icon: <Ban size={12} /> },
    { id: 'contributors', label: 'People', icon: <Users size={12} /> },
  ];

  return (
    <div style={{ padding: 16 }}>
      {/* Stats bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-around', marginBottom: 16,
        padding: '10px 0', borderTop: '1px solid rgba(20, 2, 6, 0.06)',
        borderBottom: '1px solid rgba(20, 2, 6, 0.06)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-text)' }}>{data.totalCommits}</div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Commits</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'VIZ_PALETTE.ochreDeep' }}>{data.riskyFiles?.length || 0}</div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Risky Files</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: VIZ_PALETTE.pink }}>{data.abandonedFiles?.length || 0}</div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Stale</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#7c3aed' }}>{data.contributors?.length || 0}</div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Contributors</div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '6px 0', fontSize: 10, fontWeight: 500,
              background: tab === t.id ? 'var(--accent)' : 'rgba(20, 2, 6, 0.05)',
              color: tab === t.id ? '#140206' : 'var(--text-muted)',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {tab === 'recent' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.recentCommits?.map((c, i) => (
              <div key={i} style={{
                padding: '8px 10px', background: 'rgba(20, 2, 6, 0.03)',
                borderRadius: 8, border: '1px solid rgba(20, 2, 6, 0.04)',
              }}>
                <div style={{ fontSize: 11, color: 'rgba(20, 2, 6, 0.8)', marginBottom: 3 }}>
                  {c.message?.length > 70 ? c.message.slice(0, 70) + '…' : c.message}
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 9, color: 'rgba(20, 2, 6, 0.3)' }}>
                  <span>{c.author}</span>
                  {c.hash && <span style={{ fontFamily: 'monospace' }}>#{c.hash.slice(0, 6)}</span>}
                  <span>{c.filesChanged} file(s)</span>
                </div>
              </div>
            ))}
            {(!data.recentCommits || data.recentCommits.length === 0) && (
              <div style={{ fontSize: 12, color: 'rgba(20, 2, 6, 0.3)', textAlign: 'center', padding: 20 }}>
                No commit history available
              </div>
            )}
          </div>
        )}

        {tab === 'risky' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.riskyFiles?.map((f, i) => (
              <div key={i} style={{
                padding: '8px 10px', background: 'rgba(239,68,68,0.05)',
                borderRadius: 8, border: '1px solid rgba(239,68,68,0.1)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: 'rgba(20, 2, 6, 0.8)', fontFamily: 'monospace' }}>
                    {f.path}
                  </span>
                  <RiskBadge risk={f.risk} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {f.changes} changes · {f.contributors} contributor(s)
                </div>
                {f.reason && (
                  <div style={{ fontSize: 9, color: VIZ_PALETTE.pink, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}><Info size={10} /> {f.reason}</div>
                )}
              </div>
            ))}
            {(!data.riskyFiles || data.riskyFiles.length === 0) && (
              <div style={{ fontSize: 12, color: 'rgba(20, 2, 6, 0.3)', textAlign: 'center', padding: 20 }}>
                No risky files detected ✅
              </div>
            )}
          </div>
        )}

        {tab === 'abandoned' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.abandonedFiles?.map((f, i) => (
              <div key={i} style={{
                padding: '8px 10px', background: 'rgba(20, 2, 6, 0.03)',
                borderRadius: 8, border: '1px solid rgba(20, 2, 6, 0.04)',
              }}>
                <div style={{ fontSize: 11, color: 'rgba(20, 2, 6, 0.8)', fontFamily: 'monospace' }}>
                  {f.path}
                </div>
                <div style={{ fontSize: 9, color: 'rgba(20, 2, 6, 0.3)', marginTop: 2 }}>
                  Not touched in the analysed history window — stable or unused
                </div>
              </div>
            ))}
            {(!data.abandonedFiles || data.abandonedFiles.length === 0) && (
              <div style={{ fontSize: 12, color: 'rgba(20, 2, 6, 0.3)', textAlign: 'center', padding: 20 }}>
                Every file was touched in the analysed history ✅
              </div>
            )}
          </div>
        )}

        {tab === 'contributors' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.contributors?.map((c, i) => (
              <div key={i} style={{
                padding: '8px 10px', background: 'rgba(20, 2, 6, 0.03)',
                borderRadius: 8, border: '1px solid rgba(20, 2, 6, 0.04)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(20, 2, 6, 0.8)' }}>{c.name}</div>
                  <div style={{ fontSize: 9, color: 'rgba(20, 2, 6, 0.3)' }}>
                    {c.filesChanged} file(s) touched
                  </div>
                </div>
                <div style={{
                  fontSize: 14, fontWeight: 700, color: 'var(--accent-text)',
                  background: 'rgba(59,130,246,0.1)', padding: '4px 8px', borderRadius: 6,
                }}>
                  {c.commits}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

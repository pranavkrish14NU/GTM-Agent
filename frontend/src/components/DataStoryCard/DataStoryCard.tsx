/**
 * DataStoryCard — renders a DataStory with a narrative and inline chart visualisation.
 * Supported chart types: 'bar' (horizontal), 'line' (sparkline-style), 'number' (big KPI).
 * Uses pure CSS/SVG — no external chart library dependency.
 */

import type { DataStory, DataPoint } from '../../types/index.js';
import type { AsyncState } from '../../types/index.js';
import { CardSkeleton, EmptyState, ErrorState } from '../common/index.js';
import { clamp, formatRelativeTime } from '../../utils/index.js';
import styles from './DataStoryCard.module.css';

export interface DataStoryCardProps {
  state: AsyncState<DataStory>;
  onRetry?: () => void;
}

// ---------------------------------------------------------------------------
// Internal micro-charts
// ---------------------------------------------------------------------------

function BarChart({ dataPoints }: { dataPoints: DataPoint[] }) {
  const max = Math.max(...dataPoints.map((d) => d.value), 1);
  return (
    <ul className={styles.barChart} aria-label="Bar chart" role="img">
      {dataPoints.map((d) => (
        <li key={d.label} className={styles.barRow}>
          <span className={styles.barLabel}>{d.label}</span>
          <span className={styles.barTrack}>
            <span
              className={styles.barFill}
              style={{ width: `${clamp((d.value / max) * 100, 0, 100)}%` }}
              aria-hidden="true"
            />
          </span>
          <span className={styles.barValue}>{d.value}</span>
        </li>
      ))}
    </ul>
  );
}

function NumberChart({ dataPoints }: { dataPoints: DataPoint[] }) {
  // For 'number' type we show the first data point as a big KPI
  const point = dataPoints[0];
  if (!point) return null;
  return (
    <div className={styles.numberChart} aria-label={`${point.label}: ${point.value}`}>
      <span className={styles.numberValue}>{point.value}</span>
      <span className={styles.numberLabel}>{point.label}</span>
    </div>
  );
}

function LineChart({ dataPoints }: { dataPoints: DataPoint[] }) {
  if (dataPoints.length < 2) return <NumberChart dataPoints={dataPoints} />;

  const W = 220;
  const H = 60;
  const max = Math.max(...dataPoints.map((d) => d.value), 1);
  const min = Math.min(...dataPoints.map((d) => d.value), 0);
  const range = max - min || 1;

  const toX = (i: number) => (i / (dataPoints.length - 1)) * W;
  const toY = (v: number) => H - ((v - min) / range) * (H - 8) - 4;

  const points = dataPoints
    .map((d, i) => `${toX(i).toFixed(1)},${toY(d.value).toFixed(1)}`)
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={styles.lineChart}
      aria-label="Line chart"
      role="img"
    >
      <polyline
        points={points}
        fill="none"
        stroke="#6366f1"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {dataPoints.map((d, i) => (
        <circle
          key={d.label}
          cx={toX(i).toFixed(1)}
          cy={toY(d.value).toFixed(1)}
          r="3"
          fill="#6366f1"
          aria-label={`${d.label}: ${d.value}`}
        />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DataStoryCard({ state, onRetry }: DataStoryCardProps) {
  const { data, status, error } = state;

  if (status === 'loading') {
    return <CardSkeleton />;
  }

  if (status === 'error') {
    return (
      <ErrorState
        message={error ?? 'Failed to load data story.'}
        onRetry={onRetry}
      />
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="No data story yet"
        description="Data stories are generated once analytics are available."
        icon="📈"
      />
    );
  }

  const { title, narrative, chartType, dataPoints } = data;
  const hasChart = dataPoints && dataPoints.length > 0;

  return (
    <article className={styles.card} data-testid="data-story-card">
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.narrative}>{narrative}</p>

      {hasChart && (
        <div className={styles.chartArea}>
          {chartType === 'bar' && <BarChart dataPoints={dataPoints} />}
          {chartType === 'number' && <NumberChart dataPoints={dataPoints} />}
          {chartType === 'line' && <LineChart dataPoints={dataPoints} />}
        </div>
      )}

      <footer className={styles.footer}>
        <span className={styles.time}>{formatRelativeTime(data.createdAt)}</span>
      </footer>
    </article>
  );
}

# BOBA Component Library

This document describes every reusable UI component, its props, and usage examples.

---

## Common Primitives (`src/components/common/`)

### `SkeletonLoader`

Animated shimmer placeholder for loading states.

```tsx
import { SkeletonLoader } from './common';

<SkeletonLoader width="80%" height="1rem" borderRadius="4px" />
```

| Prop           | Type     | Default   | Description                          |
| -------------- | -------- | --------- | ------------------------------------ |
| `width`        | `string` | `'100%'`  | CSS width value                      |
| `height`       | `string` | `'1rem'`  | CSS height value                     |
| `borderRadius` | `string` | `'4px'`   | CSS border-radius value              |
| `className`    | `string` | —         | Extra CSS class(es)                  |

#### `CardSkeleton`

Pre-built multi-line card skeleton matching InsightCard / MetricStoryCard dimensions.

```tsx
import { CardSkeleton } from './common';

<CardSkeleton />
```

---

### `EmptyState`

Shown when a list or panel has zero items.

```tsx
import { EmptyState } from './common';

<EmptyState
  icon="📭"
  title="No results found"
  description="Try adjusting your search filters."
  action={{ label: 'Clear filters', onClick: handleClear }}
/>
```

| Prop          | Type                               | Default    | Description                       |
| ------------- | ---------------------------------- | ---------- | --------------------------------- |
| `title`       | `string`                           | —          | Required heading text             |
| `icon`        | `string`                           | `'📭'`     | Emoji icon displayed above title  |
| `description` | `string`                           | —          | Secondary descriptive text        |
| `action`      | `{ label: string; onClick(): void }`| —          | Optional CTA button               |
| `className`   | `string`                           | —          | Extra CSS class(es)               |

---

### `ErrorState`

Shown when a data-fetch fails. Includes an optional retry button.

```tsx
import { ErrorState } from './common';

<ErrorState
  message="Failed to load insights."
  onRetry={handleRetry}
/>
```

| Prop        | Type         | Default                                  | Description            |
| ----------- | ------------ | ---------------------------------------- | ---------------------- |
| `message`   | `string`     | `'Something went wrong. Please try again.'` | Error description   |
| `onRetry`   | `() => void` | —                                        | Shows "Try again" button |
| `className` | `string`     | —                                        | Extra CSS class(es)    |

---

### `ConfidenceBadge`

Pill badge that visualises an Insight confidence level.

```tsx
import { ConfidenceBadge } from './common';

<ConfidenceBadge level="high" />   // green
<ConfidenceBadge level="medium" /> // amber
<ConfidenceBadge level="low" />    // red
```

| Prop        | Type                          | Description         |
| ----------- | ----------------------------- | ------------------- |
| `level`     | `'high' \| 'medium' \| 'low'` | Required            |
| `className` | `string`                      | Extra CSS class(es) |

---

## Card Components

All card components accept an `AsyncState<T>` prop so they handle tri-state (loading / error / data) rendering internally.

```ts
interface AsyncState<T> {
  data: T | null;
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
}
```

---

### `InsightCard` (`src/components/InsightCard/`)

Renders a single AI-generated `Insight`.

```tsx
import { InsightCard } from './InsightCard';

<InsightCard
  state={{ data: insight, status: 'success', error: null }}
  onRetry={fetchInsight}
/>
```

| Prop      | Type                   | Description                   |
| --------- | ---------------------- | ----------------------------- |
| `state`   | `AsyncState<Insight>`  | Required                      |
| `onRetry` | `() => void`           | Called from ErrorState button |

**Renders:** insight type tag, title, summary, recommendation block (if present), ConfidenceBadge, relative timestamp, source doc count.

---

### `MetricStoryCard` (`src/components/MetricStoryCard/`)

Renders a `MetricStory` with metric headline, evidence bullets, recommendation, and next action.

```tsx
import { MetricStoryCard } from './MetricStoryCard';

<MetricStoryCard
  state={{ data: metricStory, status: 'success', error: null }}
  onRetry={fetchMetricStory}
/>
```

| Prop      | Type                      | Description                   |
| --------- | ------------------------- | ----------------------------- |
| `state`   | `AsyncState<MetricStory>` | Required                      |
| `onRetry` | `() => void`              | Called from ErrorState button |

---

### `DataStoryCard` (`src/components/DataStoryCard/`)

Renders a `DataStory` with narrative text and an inline micro-chart.

```tsx
import { DataStoryCard } from './DataStoryCard';

<DataStoryCard
  state={{ data: dataStory, status: 'success', error: null }}
  onRetry={fetchDataStory}
/>
```

| Prop      | Type                    | Description                   |
| --------- | ----------------------- | ----------------------------- |
| `state`   | `AsyncState<DataStory>` | Required                      |
| `onRetry` | `() => void`            | Called from ErrorState button |

**Chart types:**
- `'bar'` — horizontal bar chart (no external library, CSS only)
- `'number'` — big KPI number display
- `'line'` — SVG polyline sparkline

---

### `SyncHealthPanel` (`src/components/SyncHealthPanel/`)

Shows Google Drive sync status, last sync time, freshness distribution, and file count.

```tsx
import { SyncHealthPanel } from './SyncHealthPanel';

<SyncHealthPanel
  state={{ data: syncHealth, status: 'success', error: null }}
  onRetry={fetchSyncHealth}
  onReconnect={handleReconnect}
/>
```

| Prop          | Type                        | Description                            |
| ------------- | --------------------------- | -------------------------------------- |
| `state`       | `AsyncState<SyncHealthData>`| Required                               |
| `onRetry`     | `() => void`                | Called from ErrorState button          |
| `onReconnect` | `() => void`                | Shown when status is `error`/`disconnected`; also surfaces in EmptyState |

---

## Test Fixtures (`src/data/componentFixtures.ts`)

Pre-built fixture objects for unit tests and documentation. **Never use in production.**

| Export                        | Type           | Scenario                  |
| ----------------------------- | -------------- | ------------------------- |
| `FIXTURE_INSIGHT_HIGH`        | `Insight`      | High-confidence brand insight  |
| `FIXTURE_INSIGHT_MEDIUM`      | `Insight`      | Medium-confidence competitor   |
| `FIXTURE_INSIGHT_LOW`         | `Insight`      | Low-confidence persona insight |
| `FIXTURE_METRIC_STORY`        | `MetricStory`  | Pipeline coverage Q2 2026      |
| `FIXTURE_DATA_STORY`          | `DataStory`    | Share of voice bar chart       |
| `FIXTURE_DATA_STORY_NUMBER`   | `DataStory`    | Freshness score KPI            |
| `FIXTURE_SYNC_HEALTH`         | `SyncHealthData` | Connected, 142 files         |
| `FIXTURE_SYNC_HEALTH_SYNCING` | `SyncHealthData` | Syncing status variant       |
| `FIXTURE_SYNC_HEALTH_ERROR`   | `SyncHealthData` | Error status variant         |

import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { Skeleton } from '@plantpal/ui';
import type { MapViewProps } from './MapView';

const MapView = lazy(() => import('./MapView'));

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * The map loads on demand and never blocks the page: when MapLibre or WebGL is unavailable the
 * `unavailable` note shows and the page's list alternative carries the information.
 */
export function LazyMap(props: Omit<MapViewProps, 'onFail'> & { unavailable: string }) {
  const [failed, setFailed] = useState(false);
  const note = <p className="text-body-s text-muted">{props.unavailable}</p>;
  if (failed) return note;
  return (
    <Boundary fallback={note}>
      <Suspense fallback={<Skeleton className="h-80 w-full sm:h-96" />}>
        <MapView {...props} onFail={() => setFailed(true)} />
      </Suspense>
    </Boundary>
  );
}

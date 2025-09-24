// Re-export types
export * from './types';

// Re-export context and provider
export { CairoProvider, useCairoContext } from './context';

// Re-export hooks
export {
  useCairo,
  usePageView,
  useTrackEvent,
  useAutoTrack,
  useFormTracking,
  useExperiment,
  usePerformanceTracking,
} from './hooks';

// Re-export components
export {
  TrackClick,
  TrackLink,
  TrackForm,
  TrackView,
  ConditionalTracker,
  UserIdentifier,
  ExperimentTracker,
  TimingTracker,
} from './components';

// Re-export client
export { CairoBrowserClient } from './client';

// Default export for convenience
import { CairoProvider } from './context';
export default CairoProvider;
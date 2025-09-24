import { useCallback, useEffect, useRef } from 'react';
import { useCairoContext } from './context';
import { UseCairoReturn, TrackOptions, IdentifyOptions, PageOptions, AutoTrackOptions } from './types';
import { TrackMessage, IdentifyMessage, PageMessage } from '@cairo/node-sdk';

/**
 * Main Cairo hook for tracking events
 */
export const useCairo = (): UseCairoReturn => {
  const { client, ready, user, consent } = useCairoContext();

  const track = useCallback((
    event: string | TrackMessage,
    properties?: Record<string, any>,
    options: TrackOptions = {}
  ) => {
    if (!client) return;

    if (typeof event === 'string') {
      client.track(event, properties, options);
    } else {
      client.track(event.event, event.properties, {
        userId: event.userId,
        context: event.context,
        ...options,
      });
    }
  }, [client]);

  const identify = useCallback((
    userId: string | IdentifyMessage,
    traits?: Record<string, any>,
    options: IdentifyOptions = {}
  ) => {
    if (!client) return;

    if (typeof userId === 'string') {
      client.identify(userId, traits, options);
    } else {
      client.identify(userId.userId, userId.traits, {
        context: userId.context,
        ...options,
      });
    }
  }, [client]);

  const page = useCallback((
    category?: string | PageMessage,
    name?: string,
    properties?: Record<string, any>,
    options: PageOptions = {}
  ) => {
    if (!client) return;

    if (typeof category === 'object') {
      client.page(category.category, category.name, category.properties, options);
    } else {
      client.page(category, name, properties, options);
    }
  }, [client]);

  const group = useCallback((
    groupId: string,
    traits?: Record<string, any>,
    options: TrackOptions = {}
  ) => {
    if (!client) return;
    client.group(groupId, traits, options);
  }, [client]);

  const alias = useCallback((
    userId: string,
    previousId: string,
    options: TrackOptions = {}
  ) => {
    if (!client) return;
    client.alias(userId, previousId, options);
  }, [client]);

  const reset = useCallback(() => {
    if (!client) return;
    client.reset();
  }, [client]);

  return {
    track,
    identify,
    page,
    group,
    alias,
    ready,
    user,
    consent,
    reset,
  };
};

/**
 * Hook for auto-tracking page views
 * Automatically tracks page views when the component mounts or dependencies change
 */
export const usePageView = (
  category?: string,
  name?: string,
  properties?: Record<string, any>,
  deps: any[] = []
) => {
  const { page, ready } = useCairo();

  useEffect(() => {
    if (ready) {
      page(category, name, properties);
    }
  }, [ready, category, name, ...deps]);
};

/**
 * Hook for tracking events on component mount/unmount
 */
export const useTrackEvent = (
  event: string,
  properties?: Record<string, any>,
  options?: {
    onMount?: boolean;
    onUnmount?: boolean;
    deps?: any[];
  }
) => {
  const { track, ready } = useCairo();
  const { onMount = true, onUnmount = false, deps = [] } = options || {};

  useEffect(() => {
    if (ready && onMount) {
      track(event, properties);
    }

    return () => {
      if (ready && onUnmount) {
        track(`${event} Ended`, properties);
      }
    };
  }, [ready, event, ...deps]);
};

/**
 * Hook for tracking element interactions
 */
export const useAutoTrack = (options: AutoTrackOptions) => {
  const { track, ready } = useCairo();
  const elementRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!ready) return;

    const element = typeof options.element === 'string'
      ? document.querySelector(options.element) as HTMLElement
      : options.element || elementRef.current;

    if (!element) return;

    const eventName = options.event || 'Element Interacted';

    const handleClick = (event: Event) => {
      const target = event.target as HTMLElement;
      const baseProperties = {
        element_type: target.tagName.toLowerCase(),
        element_text: target.textContent?.trim() || '',
        element_id: target.id,
        element_class: target.className,
        category: options.category,
        label: options.label,
      };

      const properties = typeof options.properties === 'function'
        ? { ...baseProperties, ...options.properties(target) }
        : { ...baseProperties, ...options.properties };

      track(eventName, properties);
    };

    element.addEventListener('click', handleClick);

    return () => {
      element.removeEventListener('click', handleClick);
    };
  }, [ready, options]);

  return elementRef;
};

/**
 * Hook for form tracking
 */
export const useFormTracking = (formRef: React.RefObject<HTMLFormElement>, options?: {
  trackSubmit?: boolean;
  trackFieldChanges?: boolean;
  submitEvent?: string;
  fieldChangeEvent?: string;
}) => {
  const { track, ready } = useCairo();
  const {
    trackSubmit = true,
    trackFieldChanges = false,
    submitEvent = 'Form Submitted',
    fieldChangeEvent = 'Form Field Changed'
  } = options || {};

  useEffect(() => {
    if (!ready || !formRef.current) return;

    const form = formRef.current;

    const handleSubmit = (event: SubmitEvent) => {
      if (!trackSubmit) return;

      const formData = new FormData(form);
      const fields: string[] = [];
      const values: Record<string, any> = {};

      formData.forEach((value, key) => {
        fields.push(key);
        // Only track non-sensitive field names and types
        if (!['password', 'ssn', 'credit_card'].includes(key)) {
          values[key] = typeof value === 'string' ? value.length : 'file';
        }
      });

      track(submitEvent, {
        form_id: form.id,
        form_class: form.className,
        form_fields: fields,
        form_field_count: fields.length,
        ...values,
      });
    };

    const handleFieldChange = (event: Event) => {
      if (!trackFieldChanges) return;

      const target = event.target as HTMLInputElement;

      track(fieldChangeEvent, {
        field_name: target.name,
        field_type: target.type,
        field_id: target.id,
        form_id: form.id,
      });
    };

    if (trackSubmit) {
      form.addEventListener('submit', handleSubmit);
    }

    if (trackFieldChanges) {
      form.addEventListener('change', handleFieldChange);
    }

    return () => {
      if (trackSubmit) {
        form.removeEventListener('submit', handleSubmit);
      }
      if (trackFieldChanges) {
        form.removeEventListener('change', handleFieldChange);
      }
    };
  }, [ready, formRef, trackSubmit, trackFieldChanges, submitEvent, fieldChangeEvent]);
};

/**
 * Hook for A/B testing and feature flags
 */
export const useExperiment = (experimentName: string, variant?: string) => {
  const { track, ready } = useCairo();

  useEffect(() => {
    if (ready && variant) {
      track('Experiment Viewed', {
        experiment_name: experimentName,
        variant,
      });
    }
  }, [ready, experimentName, variant]);

  const trackConversion = useCallback((conversionEvent?: string, properties?: Record<string, any>) => {
    if (!ready || !variant) return;

    track(conversionEvent || 'Experiment Converted', {
      experiment_name: experimentName,
      variant,
      ...properties,
    });
  }, [ready, experimentName, variant, track]);

  return { trackConversion };
};

/**
 * Hook for performance tracking
 */
export const usePerformanceTracking = (options?: {
  trackPageLoad?: boolean;
  trackUserTiming?: boolean;
  trackNavigation?: boolean;
}) => {
  const { track, ready } = useCairo();
  const {
    trackPageLoad = true,
    trackUserTiming = true,
    trackNavigation = true,
  } = options || {};

  useEffect(() => {
    if (!ready) return;

    if (trackPageLoad && 'performance' in window) {
      const handleLoad = () => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

        if (navigation) {
          track('Page Load Performance', {
            load_time: navigation.loadEventEnd - navigation.fetchStart,
            dom_content_loaded: navigation.domContentLoadedEventEnd - navigation.fetchStart,
            first_paint: navigation.responseEnd - navigation.requestStart,
            dns_lookup: navigation.domainLookupEnd - navigation.domainLookupStart,
            connection_time: navigation.connectEnd - navigation.connectStart,
            page_url: window.location.href,
          });
        }
      };

      if (document.readyState === 'complete') {
        setTimeout(handleLoad, 100);
      } else {
        window.addEventListener('load', handleLoad);
        return () => window.removeEventListener('load', handleLoad);
      }
    }
  }, [ready, trackPageLoad]);

  const trackTiming = useCallback((name: string, startTime: number, endTime?: number) => {
    if (!ready) return;

    const duration = (endTime || performance.now()) - startTime;

    track('Custom Timing', {
      timing_name: name,
      duration,
      timestamp: Date.now(),
    });
  }, [ready, track]);

  return { trackTiming };
};
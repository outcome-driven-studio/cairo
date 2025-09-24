import React, { useCallback, useRef } from 'react';
import { useCairo, useAutoTrack, useFormTracking } from './hooks';

interface TrackingProps {
  event?: string;
  properties?: Record<string, any>;
  category?: string;
  label?: string;
  children?: React.ReactNode;
}

/**
 * TrackClick Component
 * Automatically tracks clicks on child elements
 */
export const TrackClick: React.FC<TrackingProps & {
  element?: 'button' | 'div' | 'span' | 'a';
  onClick?: (event: React.MouseEvent) => void;
}> = ({
  event = 'Element Clicked',
  properties,
  category,
  label,
  element: Element = 'button',
  onClick,
  children,
  ...props
}) => {
  const { track } = useCairo();

  const handleClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const target = e.currentTarget;

    track(event, {
      element_type: target.tagName.toLowerCase(),
      element_text: target.textContent?.trim() || '',
      element_id: target.id,
      element_class: target.className,
      category,
      label,
      ...properties,
    });

    onClick?.(e);
  }, [track, event, properties, category, label, onClick]);

  return (
    <Element onClick={handleClick} {...props}>
      {children}
    </Element>
  );
};

/**
 * TrackLink Component
 * Tracks link clicks with additional link-specific properties
 */
export const TrackLink: React.FC<TrackingProps & {
  href: string;
  target?: string;
  onClick?: (event: React.MouseEvent) => void;
}> = ({
  event = 'Link Clicked',
  properties,
  category,
  label,
  href,
  target,
  onClick,
  children,
  ...props
}) => {
  const { track } = useCairo();

  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    track(event, {
      link_url: href,
      link_text: e.currentTarget.textContent?.trim() || '',
      link_target: target,
      is_external: !href.startsWith('/') && !href.startsWith('#'),
      category,
      label,
      ...properties,
    });

    onClick?.(e);
  }, [track, event, properties, category, label, href, target, onClick]);

  return (
    <a href={href} target={target} onClick={handleClick} {...props}>
      {children}
    </a>
  );
};

/**
 * TrackForm Component
 * Automatically tracks form submissions and field interactions
 */
export const TrackForm: React.FC<TrackingProps & {
  onSubmit?: (event: React.FormEvent) => void;
  trackFields?: boolean;
  submitEvent?: string;
  fieldChangeEvent?: string;
}> = ({
  event,
  properties,
  category,
  label,
  onSubmit,
  trackFields = false,
  submitEvent,
  fieldChangeEvent,
  children,
  ...props
}) => {
  const { track } = useCairo();
  const formRef = useRef<HTMLFormElement>(null);

  // Use form tracking hook
  useFormTracking(formRef, {
    trackSubmit: true,
    trackFieldChanges: trackFields,
    submitEvent: submitEvent || event || 'Form Submitted',
    fieldChangeEvent: fieldChangeEvent || 'Form Field Changed',
  });

  const handleSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    // Additional custom tracking if needed
    if (event && event !== (submitEvent || 'Form Submitted')) {
      track(event, {
        form_id: formRef.current?.id,
        category,
        label,
        ...properties,
      });
    }

    onSubmit?.(e);
  }, [track, event, properties, category, label, onSubmit, submitEvent]);

  return (
    <form ref={formRef} onSubmit={handleSubmit} {...props}>
      {children}
    </form>
  );
};

/**
 * TrackView Component
 * Tracks when an element comes into view (intersection observer)
 */
export const TrackView: React.FC<TrackingProps & {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
  element?: keyof JSX.IntrinsicElements;
}> = ({
  event = 'Element Viewed',
  properties,
  category,
  label,
  threshold = 0.5,
  rootMargin = '0px',
  triggerOnce = true,
  element: Element = 'div',
  children,
  ...props
}) => {
  const { track, ready } = useCairo();
  const elementRef = useRef<HTMLElement>(null);
  const trackedRef = useRef(false);

  React.useEffect(() => {
    if (!ready || !elementRef.current || !('IntersectionObserver' in window)) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && (!triggerOnce || !trackedRef.current)) {
            track(event, {
              element_id: entry.target.id,
              element_class: entry.target.className,
              intersection_ratio: entry.intersectionRatio,
              category,
              label,
              ...properties,
            });

            if (triggerOnce) {
              trackedRef.current = true;
            }
          }
        });
      },
      { threshold, rootMargin }
    );

    observer.observe(elementRef.current);

    return () => observer.disconnect();
  }, [ready, event, properties, category, label, threshold, rootMargin, triggerOnce]);

  return (
    <Element ref={elementRef} {...props}>
      {children}
    </Element>
  );
};

/**
 * ConditionalTracker Component
 * Only renders children and tracks when conditions are met
 */
export const ConditionalTracker: React.FC<{
  condition: boolean;
  event: string;
  properties?: Record<string, any>;
  trackOnMount?: boolean;
  trackOnUnmount?: boolean;
  children: React.ReactNode;
}> = ({
  condition,
  event,
  properties,
  trackOnMount = true,
  trackOnUnmount = false,
  children,
}) => {
  const { track, ready } = useCairo();

  React.useEffect(() => {
    if (ready && condition && trackOnMount) {
      track(event, properties);
    }

    return () => {
      if (ready && condition && trackOnUnmount) {
        track(`${event} Ended`, properties);
      }
    };
  }, [ready, condition, event, properties, trackOnMount, trackOnUnmount]);

  if (!condition) return null;

  return <>{children}</>;
};

/**
 * UserIdentifier Component
 * Automatically identifies user when user data is available
 */
export const UserIdentifier: React.FC<{
  userId?: string;
  traits?: Record<string, any>;
  autoIdentify?: boolean;
  children?: React.ReactNode;
}> = ({
  userId,
  traits,
  autoIdentify = true,
  children,
}) => {
  const { identify, ready, user } = useCairo();

  React.useEffect(() => {
    if (ready && autoIdentify && userId && userId !== user.userId) {
      identify(userId, traits);
    }
  }, [ready, autoIdentify, userId, traits, user.userId]);

  return <>{children}</>;
};

/**
 * ExperimentTracker Component
 * Tracks A/B test experiments and variants
 */
export const ExperimentTracker: React.FC<{
  experimentName: string;
  variant: string;
  children: React.ReactNode;
  trackOnMount?: boolean;
}> = ({
  experimentName,
  variant,
  children,
  trackOnMount = true,
}) => {
  const { track, ready } = useCairo();

  React.useEffect(() => {
    if (ready && trackOnMount) {
      track('Experiment Viewed', {
        experiment_name: experimentName,
        variant,
      });
    }
  }, [ready, experimentName, variant, trackOnMount]);

  return <>{children}</>;
};

/**
 * TimingTracker Component
 * Tracks timing for how long users spend in component
 */
export const TimingTracker: React.FC<{
  name: string;
  properties?: Record<string, any>;
  trackOnUnmount?: boolean;
  children: React.ReactNode;
}> = ({
  name,
  properties,
  trackOnUnmount = true,
  children,
}) => {
  const { track, ready } = useCairo();
  const startTimeRef = useRef<number>();

  React.useEffect(() => {
    if (ready) {
      startTimeRef.current = performance.now();
    }

    return () => {
      if (ready && trackOnUnmount && startTimeRef.current) {
        const duration = performance.now() - startTimeRef.current;
        track('Timing Tracked', {
          timing_name: name,
          duration,
          duration_seconds: Math.round(duration / 1000),
          ...properties,
        });
      }
    };
  }, [ready, name, properties, trackOnUnmount]);

  return <>{children}</>;
};
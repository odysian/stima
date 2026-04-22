import { flushSync } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigationType, useOutlet } from "react-router-dom";

type StartViewTransition = (updateCallback: () => void) => unknown;

function usePrefersReducedMotion(): boolean {
  const mediaQuery = useMemo(
    () =>
      typeof window === "undefined" || typeof window.matchMedia !== "function"
        ? null
        : window.matchMedia("(prefers-reduced-motion: reduce)"),
    [],
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    mediaQuery?.matches ?? false,
  );

  useEffect(() => {
    if (!mediaQuery) {
      return;
    }

    const handleChange = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [mediaQuery]);

  return prefersReducedMotion;
}

export function PageTransition(): React.ReactElement {
  const location = useLocation();
  const navigationType = useNavigationType();
  const outlet = useOutlet();
  const prefersReducedMotion = usePrefersReducedMotion();
  const startViewTransition = (
    document as Document & { startViewTransition?: StartViewTransition }
  ).startViewTransition;

  const [displayLocationKey, setDisplayLocationKey] = useState(location.key);
  const [displayOutlet, setDisplayOutlet] = useState(outlet);
  const shouldAnimateNavigation =
    location.key !== displayLocationKey &&
    navigationType === "PUSH" &&
    !prefersReducedMotion &&
    typeof startViewTransition === "function";

  useEffect(() => {
    if (location.key === displayLocationKey) {
      return;
    }

    const commitNavigation = (sync = false) => {
      const applyNavigation = () => {
        setDisplayLocationKey(location.key);
        setDisplayOutlet(outlet);
      };

      if (sync) {
        flushSync(applyNavigation);
        return;
      }

      applyNavigation();
    };

    if (shouldAnimateNavigation) {
      let isCancelled = false;
      queueMicrotask(() => {
        if (isCancelled) {
          return;
        }
        startViewTransition(() => {
          commitNavigation(true);
        });
      });
      return () => {
        isCancelled = true;
      };
    }

    commitNavigation(false);
  }, [displayLocationKey, location.key, outlet, shouldAnimateNavigation, startViewTransition]);

  const routedContent = shouldAnimateNavigation ? displayOutlet : outlet;
  const contentKey = shouldAnimateNavigation ? displayLocationKey : location.key;

  return (
    <div className="page-transition-root">
      <div key={contentKey} className="page-transition-content">
        {routedContent}
      </div>
    </div>
  );
}

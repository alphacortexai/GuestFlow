import { useEffect, useState } from "react";

/**
 * Tracks whether the page is currently visible.
 * Uses the Page Visibility API so that background polling,
 * timers, and listeners can be paused when the tab is
 * minimised or backgrounded — preventing unnecessary CPU,
 * network, and battery drain on tablets and phones.
 */
export function usePageVisibility() {
  const [isVisible, setIsVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return isVisible;
}

import { useEffect, useState } from "react";

export const useScreenSize = () => {
  const [screenSize, setScreenSize] = useState({
    width: 500,
    height: 500,
  });

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;
    
    // Initialize screen size
    setScreenSize({
      width: window.innerWidth,
      height: window.innerHeight - 120,
    });

    const mainDiv = document?.querySelector(".MuiGrid2-root");
    if (mainDiv) {
      const observer = new ResizeObserver(() =>
        setScreenSize((prev) => ({ ...prev, width: mainDiv.clientWidth }))
      );
      observer.observe(mainDiv);

      return () => {
        observer.disconnect();
      };
    }
  }, []);

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;
    
    const handleResize = () => {
      setScreenSize((prev) => ({
        ...prev,
        height: window.innerHeight - 100,
      }));
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return screenSize;
};

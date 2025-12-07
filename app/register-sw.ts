if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => console.log("Service Worker registered for Memomate"))
      .catch((err) => console.error("SW registration failed:", err));
  }
  
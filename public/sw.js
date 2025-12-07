// ---- Memomate push notifications ----

self.addEventListener("push", (event) => {
    if (!event.data) return;
  
    let payload = {};
  
    try {
      payload = event.data.json();
    } catch (e) {
      payload = {
        title: "Memomate",
        body: event.data.text(),
        data: { url: "/" },
      };
    }
  
    const title = payload.title || "Memomate";
    const options = {
      body: payload.body || "You have a reminder.",
      icon: "/icon-192x192.png",      // change if your icon is different
      badge: "/icon-192x192.png",     // change if your icon is different
      data: payload.data || { url: "/" },
    };
  
    event.waitUntil(self.registration.showNotification(title, options));
  });
  
  // When user taps the notification
  self.addEventListener("notificationclick", (event) => {
    event.notification.close();
  
    const url = event.notification.data?.url || "/";
  
    event.waitUntil(
      clients.matchAll({ type: "window", includeUncontrolled: true }).then(
        (clientList) => {
          // If a window is already open → focus it
          for (const client of clientList) {
            if ("focus" in client) {
              client.navigate(url);
              return client.focus();
            }
          }
          // Otherwise open new window
          if (clients.openWindow) return clients.openWindow(url);
        }
      )
    );
  });
  
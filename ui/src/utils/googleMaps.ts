let loadPromise: Promise<void> | null = null;

export function loadGoogleMapsScript(): Promise<void> {
  // Check if Google Maps is already loaded
  if (typeof window !== 'undefined' && (window as any).google?.maps) {
    return Promise.resolve();
  }

  if (loadPromise) return loadPromise;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return Promise.reject(
      new Error('VITE_GOOGLE_MAPS_API_KEY is not set. Add it to ui/.env')
    );
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    // Avoid duplicate script tags
    if (document.getElementById('google-maps-js')) {
      const checkReady = () => {
        if ((window as any).google?.maps) {
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
      return;
    }

    (window as any).initGoogleMapsCallback = () => {
      resolve();
    };

    const script = document.createElement('script');
    script.id = 'google-maps-js';
    script.async = true;
    script.defer = true;
    // Load with both legacy places and the new places library
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&libraries=places&v=weekly&loading=async&callback=initGoogleMapsCallback`;
    script.onerror = () => reject(new Error('Failed to load Google Maps JS'));
    document.head.appendChild(script);
  });

  return loadPromise;
}


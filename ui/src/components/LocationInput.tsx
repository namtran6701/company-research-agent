import React, { useEffect, useRef, useState, useCallback } from 'react';
import { loadGoogleMapsScript } from '../utils/googleMaps';
import { MapPin } from 'lucide-react';

interface LocationInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}

declare global {
  interface Window {
    google: any;
    initGoogleMapsCallback: () => void;
  }
}

// A lightweight, styling-friendly location input that uses the
// classic Places Autocomplete on a regular input element.
// This avoids the web component's built-in icons and shadow DOM
// styling conflicts (which made text appear invisible and layout messy).
const LocationInput: React.FC<LocationInputProps> = ({ value, onChange, className, onFocus, onBlur }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [isApiLoaded, setIsApiLoaded] = useState(false);
  const onChangeRef = useRef(onChange);

  // Keep latest onChange handler
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Load Google Maps JS (with places library)
  useEffect(() => {
    const loadApi = async () => {
      try {
        await loadGoogleMapsScript();
        setIsApiLoaded(true);
      } catch (error) {
        console.error('Failed to load Google Maps API:', error);
      }
    };
    loadApi();
  }, []);

  // Initialize classic Places Autocomplete on the visible input
  useEffect(() => {
    if (!isApiLoaded || !inputRef.current || autocompleteRef.current) return;

    try {
      const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ['(cities)'],
        fields: ['formatted_address', 'name']
      });

      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        const address = place?.formatted_address || place?.name;
        if (address) onChangeRef.current(address);
      });

      autocompleteRef.current = ac;
    } catch (error) {
      console.error('Error initializing Autocomplete:', error);
    }

    return () => {
      // No explicit destroy method provided by the API
      autocompleteRef.current = null;
    };
  }, [isApiLoaded]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  }, [onChange]);

  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4 z-10" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.preventDefault();
        }}
        className={`${className} pl-10`}
        placeholder="City, Country"
        aria-label="Company headquarters location"
        autoComplete="off"
      />
    </div>
  );
};

export default LocationInput;

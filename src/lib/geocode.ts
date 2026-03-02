// src/lib/geocode.ts
// Utility to fetch lat/lng from a city/state string using OpenStreetMap Nominatim API

export async function geocodeCityState(cityState: string): Promise<{ lat: number, lng: number } | null> {
  if (!cityState.trim()) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityState)}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'dcr-platform/1.0' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  } catch {
    return null;
  }
}

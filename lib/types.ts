export interface SmokingInfo {
  allows_paper: boolean;
  allows_electronic: boolean;
  has_outside_ashtray: boolean;
  proof_text: string;
}

export interface SmokingSpot {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: "convenience_store" | "restaurant";
  rating: number | null;
  smoking: SmokingInfo;
}

export const VENUE_CATEGORIES = [
  "smoking",
  "invoice-cafe",
  "laundry",
  "gym",
] as const;

export type VenueCategory = (typeof VENUE_CATEGORIES)[number];

export interface Venue {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  google_place_id: string | null;
  city: string | null;
  prefecture: string | null;
  category: VenueCategory;
  metadata: Record<string, unknown>;
  created_at: string;
}

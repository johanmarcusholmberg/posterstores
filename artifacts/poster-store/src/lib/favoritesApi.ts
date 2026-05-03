export interface FavoritedPoster {
  id: number;
  storeKey: string;
  slug?: string | null;
  title: string;
  description?: string | null;
  imageUrl: string;
  region?: string | null;
  city?: string | null;
  category: string;
  tags?: string[] | null;
  price: number;
  currency: string;
  isFeatured?: boolean | null;
  isNew?: boolean | null;
  status?: string;
  createdAt: string;
}

export async function getFavorites(storeKey: string): Promise<FavoritedPoster[]> {
  const res = await fetch(`/api/user/favorites?storeKey=${encodeURIComponent(storeKey)}`, {
    credentials: "include",
  });
  if (res.status === 401) return [];
  if (!res.ok) throw new Error("Could not load your wishlist.");
  return res.json();
}

export async function addFavorite(posterId: number, storeKey: string): Promise<FavoritedPoster[]> {
  const res = await fetch("/api/user/favorites", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ posterId, storeKey }),
  });
  if (res.status === 401) throw new Error("LOGIN_REQUIRED");
  if (!res.ok) throw new Error("Could not save poster. Please try again.");
  return res.json();
}

export async function removeFavorite(posterId: number, storeKey: string): Promise<FavoritedPoster[]> {
  const res = await fetch(`/api/user/favorites?posterId=${posterId}&storeKey=${encodeURIComponent(storeKey)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (res.status === 401) throw new Error("LOGIN_REQUIRED");
  if (!res.ok) throw new Error("Could not remove poster. Please try again.");
  return res.json();
}

export async function getFavoriteIds(storeKey: string): Promise<number[]> {
  const favorites = await getFavorites(storeKey);
  return favorites.map((p) => p.id);
}

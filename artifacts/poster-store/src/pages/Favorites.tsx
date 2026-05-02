import React from "react";
import { useGetFavorites, getGetFavoritesQueryKey } from "@workspace/api-client-react";
import { getSessionId } from "@/lib/session";
import { useStorefront } from "@/context/StorefrontContext";
import { PosterCard } from "@/components/shared/PosterCard";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";

export default function Favorites() {
  const sessionId = getSessionId();
  const store = useStorefront();

  const favoritesParams = { sessionId, storeKey: store.storeKey };

  const { data: favorites, isLoading } = useGetFavorites(favoritesParams, {
    query: {
      enabled: !!sessionId,
      queryKey: getGetFavoritesQueryKey(favoritesParams),
    },
  });

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex items-center gap-3 mb-10">
        <Heart className="h-8 w-8 text-secondary fill-secondary" />
        <h1 className="font-serif text-4xl font-bold">Saved Posters</h1>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-[3/4] bg-muted animate-pulse rounded-md" />
          ))}
        </div>
      ) : !favorites || !Array.isArray(favorites) || favorites.length === 0 ? (
        <div className="text-center py-32 bg-sand/30 rounded-xl">
          <Heart className="h-16 w-16 text-muted-foreground mx-auto mb-6" />
          <h2 className="font-serif text-2xl font-bold mb-4">No saved posters yet</h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Browse our collection and tap the heart icon to save your favorite posters here.
          </p>
          <Link href="/shop">
            <Button size="lg">Browse Gallery</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {favorites.map((poster) => (
            <PosterCard key={poster.id} poster={poster} />
          ))}
        </div>
      )}
    </div>
  );
}

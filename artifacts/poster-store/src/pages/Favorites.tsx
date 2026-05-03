import React, { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useStorefront } from "@/context/StorefrontContext";
import { getFavorites, removeFavorite, type FavoritedPoster } from "@/lib/favoritesApi";
import { Button } from "@/components/ui/button";
import { Heart, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Favorites() {
  const { user, isLoading: authLoading } = useAuth();
  const store = useStorefront();
  const { toast } = useToast();

  const [favorites, setFavorites] = useState<FavoritedPoster[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFavorites = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getFavorites(store.storeKey);
      setFavorites(data);
    } catch {
      setError("Could not load your saved posters. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [user, store.storeKey]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const handleRemove = async (posterId: number) => {
    const prev = favorites;
    setFavorites(favorites.filter((p) => p.id !== posterId));
    try {
      await removeFavorite(posterId, store.storeKey);
    } catch {
      setFavorites(prev);
      toast({ variant: "destructive", title: "Could not remove poster", description: "Please try again." });
    }
  };

  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-[3/4] bg-muted animate-pulse rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-32 text-center" data-testid="favorites-logged-out">
        <div className="mx-auto mb-6 w-20 h-20 rounded-full bg-secondary/10 flex items-center justify-center">
          <Heart className="h-10 w-10 text-secondary" />
        </div>
        <h2 className="font-serif text-3xl font-bold mb-3">Save posters you love</h2>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
          Create a free account to keep a personal favorite list across devices.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/register">
            <Button size="lg" className="w-full sm:w-auto" data-testid="btn-favorites-register">Create account</Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline" className="w-full sm:w-auto" data-testid="btn-favorites-login">Log in</Button>
          </Link>
          <Link href="/shop">
            <Button size="lg" variant="ghost" className="w-full sm:w-auto text-muted-foreground">Continue browsing</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex items-center gap-3 mb-10">
        <Heart className="h-8 w-8 text-secondary fill-secondary" />
        <h1 className="font-serif text-4xl font-bold">Your saved posters</h1>
      </div>

      {error && (
        <div className="text-center py-16 text-destructive">{error}</div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-[3/4] bg-muted animate-pulse rounded-md" />
          ))}
        </div>
      ) : !error && favorites.length === 0 ? (
        <div className="text-center py-32 bg-sand/30 rounded-xl" data-testid="favorites-empty">
          <Heart className="h-16 w-16 text-muted-foreground mx-auto mb-6" />
          <h2 className="font-serif text-2xl font-bold mb-3">No saved posters yet</h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Browse the collection and tap the heart icon on any poster to save it here.
          </p>
          <Link href="/shop">
            <Button size="lg">Browse the collection</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {favorites.map((poster) => {
            const href = poster.slug ? `/posters/${poster.slug}` : `/poster/${poster.id}`;
            return (
              <div key={poster.id} className="group">
                <Link href={href} className="block">
                  <div className="relative aspect-[3/4] overflow-hidden bg-muted rounded-md mb-4 shadow-sm group-hover:shadow-md transition-shadow">
                    <img
                      src={poster.imageUrl}
                      alt={poster.title}
                      className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
                    />
                    <button
                      onClick={(e) => { e.preventDefault(); handleRemove(poster.id); }}
                      className="absolute top-2 right-2 bg-white/70 backdrop-blur hover:bg-white/90 rounded-full p-2 transition-colors"
                      aria-label="Remove from saved"
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-serif font-semibold text-lg text-foreground line-clamp-1">{poster.title}</h3>
                      <p className="text-sm text-muted-foreground">{poster.city || poster.region}</p>
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

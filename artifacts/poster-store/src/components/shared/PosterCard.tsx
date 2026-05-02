import React from "react";
import { Link } from "wouter";
import { Poster } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { getSessionId } from "@/lib/session";
import { useAddFavorite, useRemoveFavorite, useGetFavorites, getGetFavoritesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface PosterCardProps {
  poster: Poster;
}

export const PosterCard = ({ poster }: PosterCardProps) => {
  const sessionId = getSessionId();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: favorites } = useGetFavorites(
    { sessionId },
    {
      query: {
        enabled: !!sessionId,
        queryKey: getGetFavoritesQueryKey({ sessionId }),
      },
    }
  );

  const isFavorite = Array.isArray(favorites) ? favorites.some((p) => p.id === poster.id) : false;

  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();

  const toggleFavorite = (e: React.MouseEvent) => {
    e.preventDefault(); // prevent link navigation
    if (isFavorite) {
      removeFavorite.mutate(
        { posterId: poster.id, sessionId },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetFavoritesQueryKey({ sessionId }) });
          },
        }
      );
    } else {
      addFavorite.mutate(
        { data: { posterId: poster.id, sessionId } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetFavoritesQueryKey({ sessionId }) });
            toast({ title: "Added to favorites" });
          },
        }
      );
    }
  };

  return (
    <Link href={`/poster/${poster.id}`} className="group block" data-testid={`link-poster-${poster.id}`}>
      <div className="relative aspect-[3/4] overflow-hidden bg-muted rounded-md mb-4 shadow-sm group-hover:shadow-md transition-shadow">
        <img
          src={poster.imageUrl}
          alt={poster.title}
          className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
          data-testid={`img-poster-${poster.id}`}
        />
        {poster.isNew && (
          <div className="absolute top-2 left-2 bg-secondary text-secondary-foreground text-xs font-bold px-2 py-1 rounded">
            NEW
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 bg-white/50 backdrop-blur hover:bg-white/80 rounded-full"
          onClick={toggleFavorite}
          data-testid={`btn-favorite-${poster.id}`}
        >
          <Heart
            className={`h-4 w-4 ${isFavorite ? "fill-secondary text-secondary" : "text-foreground"}`}
          />
        </Button>
      </div>
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-serif font-semibold text-lg text-foreground line-clamp-1">{poster.title}</h3>
          <p className="text-sm text-muted-foreground">{poster.city || poster.region}</p>
        </div>
        <p className="font-medium text-foreground">
          {poster.price} {poster.currency}
        </p>
      </div>
    </Link>
  );
};

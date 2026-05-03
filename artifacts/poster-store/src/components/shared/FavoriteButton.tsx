import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { LoginPromptModal } from "./LoginPromptModal";
import { addFavorite, removeFavorite } from "@/lib/favoritesApi";
import { useToast } from "@/hooks/use-toast";

interface FavoriteButtonProps {
  posterId: number;
  storeKey: string;
  isFavorite: boolean;
  onToggle: (newState: boolean) => void;
  size?: "sm" | "default";
  className?: string;
}

export function FavoriteButton({ posterId, storeKey, isFavorite, onToggle, size = "default", className }: FavoriteButtonProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showPrompt, setShowPrompt] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      setShowPrompt(true);
      return;
    }

    setIsPending(true);
    const optimistic = !isFavorite;
    onToggle(optimistic);

    try {
      if (optimistic) {
        await addFavorite(posterId, storeKey);
        toast({ title: "Added to saved posters" });
      } else {
        await removeFavorite(posterId, storeKey);
      }
    } catch {
      onToggle(!optimistic);
      toast({ variant: "destructive", title: "Could not save poster. Please try again." });
    } finally {
      setIsPending(false);
    }
  };

  const iconSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClick}
        disabled={isPending}
        aria-label={isFavorite ? "Remove from wishlist" : "Add to wishlist"}
        className={className}
      >
        <Heart className={`${iconSize} ${isFavorite ? "fill-secondary text-secondary" : "text-foreground"}`} />
      </Button>
      <LoginPromptModal open={showPrompt} onClose={() => setShowPrompt(false)} />
    </>
  );
}

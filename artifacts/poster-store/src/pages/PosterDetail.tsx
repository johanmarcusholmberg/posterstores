import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { useGetPoster, getGetPosterQueryKey, useListPosters, getListPostersQueryKey, useAddCartItem, getGetCartQueryKey } from "@workspace/api-client-react";
import { useStorefront } from "@/context/StorefrontContext";
import { getSessionId } from "@/lib/session";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { PosterCard } from "@/components/shared/PosterCard";
import { ShoppingBag, ArrowLeft } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

export default function PosterDetail() {
  const { id } = useParams();
  const posterId = Number(id);
  const store = useStorefront();
  const sessionId = getSessionId();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedSize, setSelectedSize] = useState<string>("");

  const { data: poster, isLoading } = useGetPoster(
    posterId,
    { storeKey: store.storeKey },
    {
      query: {
        enabled: !!posterId && !isNaN(posterId),
        queryKey: getGetPosterQueryKey(posterId, { storeKey: store.storeKey }),
      },
    }
  );

  const { data: relatedPosters } = useListPosters(
    { storeKey: store.storeKey, region: poster?.region, limit: 4 },
    {
      query: {
        enabled: !!poster?.region,
        queryKey: getListPostersQueryKey({ storeKey: store.storeKey, region: poster?.region, limit: 4 }),
      },
    }
  );

  const addCartItem = useAddCartItem();

  const handleAddToCart = () => {
    if (!poster) return;
    if (poster.sizes && poster.sizes.length > 0 && !selectedSize) {
      toast({
        variant: "destructive",
        title: "Please select a size",
      });
      return;
    }

    addCartItem.mutate(
      {
        data: {
          sessionId,
          storeKey: store.storeKey,
          posterId: poster.id,
          quantity: 1,
          size: selectedSize || undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey({ sessionId, storeKey: store.storeKey }) });
          toast({
            title: "Added to cart",
            description: `${poster.title} has been added to your cart.`,
          });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 flex gap-12 animate-pulse">
        <div className="w-1/2 aspect-[3/4] bg-muted rounded-md" />
        <div className="w-1/2 space-y-6">
          <div className="h-10 bg-muted w-3/4 rounded" />
          <div className="h-6 bg-muted w-1/4 rounded" />
          <div className="h-32 bg-muted w-full rounded" />
        </div>
      </div>
    );
  }

  if (!poster) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <h1 className="text-3xl font-serif mb-4">Poster not found</h1>
        <Link href="/shop">
          <Button variant="outline">Back to shop</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <Link href="/shop" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-8">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to shop
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-24 mb-24">
        <div className="relative aspect-[3/4] bg-muted rounded-lg overflow-hidden shadow-lg">
          <img
            src={poster.imageUrl}
            alt={poster.title}
            className="w-full h-full object-cover"
            data-testid={`img-detail-${poster.id}`}
          />
        </div>

        <div className="flex flex-col">
          <div className="mb-2 text-muted-foreground text-sm font-medium tracking-wider uppercase">
            {poster.region} {poster.city && `• ${poster.city}`}
          </div>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-foreground mb-4">
            {poster.title}
          </h1>
          <p className="text-2xl font-medium text-foreground mb-8">
            {poster.price} {poster.currency}
          </p>

          <div className="prose prose-stone mb-10 text-muted-foreground">
            <p>{poster.description}</p>
          </div>

          {poster.sizes && poster.sizes.length > 0 && (
            <div className="mb-10">
              <h3 className="font-medium text-foreground mb-4">Select Size</h3>
              <RadioGroup
                value={selectedSize}
                onValueChange={setSelectedSize}
                className="grid grid-cols-2 gap-4"
              >
                {poster.sizes.map((size) => (
                  <div key={size}>
                    <RadioGroupItem value={size} id={`size-${size}`} className="peer sr-only" />
                    <Label
                      htmlFor={`size-${size}`}
                      className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 [&:has([data-state=checked])]:border-primary cursor-pointer"
                    >
                      {size}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

          <div className="flex gap-4 mt-auto">
            <Button
              size="lg"
              className="flex-1 text-lg h-14"
              onClick={handleAddToCart}
              disabled={addCartItem.isPending}
              data-testid="btn-add-to-cart"
            >
              {addCartItem.isPending ? "Adding..." : (
                <>
                  <ShoppingBag className="mr-2 h-5 w-5" /> Add to cart
                </>
              )}
            </Button>
          </div>

          {poster.tags && poster.tags.length > 0 && (
            <div className="mt-12 flex flex-wrap gap-2">
              {poster.tags.map(tag => (
                <Link key={tag} href={`/shop?tag=${encodeURIComponent(tag)}`}>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer">
                    {tag}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {relatedPosters && relatedPosters.posters.length > 1 && (
        <section className="border-t border-border pt-16">
          <h2 className="font-serif text-3xl font-bold text-foreground mb-8">More from {poster.region}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {relatedPosters.posters
              .filter(p => p.id !== poster.id)
              .slice(0, 4)
              .map(p => (
                <PosterCard key={p.id} poster={p} />
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

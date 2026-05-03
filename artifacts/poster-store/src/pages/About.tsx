import React from "react";
import { Link } from "wouter";
import { useStorefront } from "@/context/StorefrontContext";
import { Button } from "@/components/ui/button";

export default function About() {
  const store = useStorefront();

  return (
    <div className="min-h-screen pb-20">
      <div className="bg-sand py-14">
        <div className="container mx-auto px-4">
          <h1 className="font-serif text-4xl font-bold text-primary mb-3">About {store.storeName}</h1>
          <p className="text-foreground/60 max-w-xl">
            {store.seo?.defaultDescription || `Art posters of ${store.countryFocus}.`}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-14 max-w-3xl space-y-14">

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Our Story</h2>
          <p className="text-foreground/70 leading-relaxed">
            {store.storeName} was born out of a love for {store.countryFocus} — its places, its light,
            and the quiet beauty of its everyday moments. We create art posters that capture the
            essence of a destination, giving people a way to bring that feeling into their homes.
          </p>
          <p className="text-foreground/70 leading-relaxed mt-4">
            Every print in our collection is produced to order on museum-quality paper, with colors
            that hold up over time. We work with trusted print partners who share our commitment to
            quality and sustainability.
          </p>
          <p className="text-sm text-muted-foreground mt-4 p-3 bg-sand/60 rounded-md border border-border">
            ✏️ <em>Replace this with your actual brand story before launch. Share how {store.storeName} started, what drives it, and what makes it different.</em>
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">What We Make</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            <div className="p-6 rounded-xl border border-border bg-white">
              <div className="text-3xl mb-3">🖨️</div>
              <h3 className="font-medium text-foreground mb-1">Fine art prints</h3>
              <p className="text-sm text-foreground/60">Printed on archival-quality paper with fade-resistant inks.</p>
            </div>
            <div className="p-6 rounded-xl border border-border bg-white">
              <div className="text-3xl mb-3">🌍</div>
              <h3 className="font-medium text-foreground mb-1">Ships worldwide</h3>
              <p className="text-sm text-foreground/60">Carefully packaged and delivered to your door.</p>
            </div>
            <div className="p-6 rounded-xl border border-border bg-white">
              <div className="text-3xl mb-3">✦</div>
              <h3 className="font-medium text-foreground mb-1">Made to order</h3>
              <p className="text-sm text-foreground/60">Every poster is printed specifically for you.</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Our Collection</h2>
          <div className="rounded-xl border border-border overflow-hidden bg-muted/30 h-48 flex items-center justify-center">
            <p className="text-muted-foreground text-sm">
              ✏️ <em>Place a brand image or mockup here before launch.</em>
            </p>
          </div>
          <p className="text-foreground/70 leading-relaxed mt-6">
            Browse our full range of {store.countryFocus} posters, from city landmarks to coastal
            landscapes, botanical prints, and travel-inspired artwork.
          </p>
          <div className="mt-6">
            <Link href="/shop">
              <Button size="lg" data-testid="about-shop-cta">Browse the Collection</Button>
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}

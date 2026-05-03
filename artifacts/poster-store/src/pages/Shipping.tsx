import React, { useEffect, useState } from "react";
import { useStorefront } from "@/context/StorefrontContext";
import { fetchPublicContentPage, type AdminContentPage } from "@/lib/adminApi";

export default function Shipping() {
  const store = useStorefront();
  const [contentPage, setContentPage] = useState<AdminContentPage | null>(null);

  useEffect(() => {
    fetchPublicContentPage(store.storeKey, "shipping").then(data => {
      if (data) setContentPage(data);
    });
  }, [store.storeKey]);

  if (contentPage) {
    return (
      <div className="min-h-screen pb-20">
        <div className="bg-sand py-14">
          <div className="container mx-auto px-4">
            <h1 className="font-serif text-4xl font-bold text-primary mb-3">{contentPage.title}</h1>
            {contentPage.subtitle && (
              <p className="text-foreground/60 max-w-xl">{contentPage.subtitle}</p>
            )}
          </div>
        </div>
        <div className="container mx-auto px-4 py-14 max-w-3xl">
          <div className="prose prose-neutral max-w-none text-foreground/80 leading-relaxed whitespace-pre-wrap">
            {contentPage.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <div className="bg-sand py-14">
        <div className="container mx-auto px-4">
          <h1 className="font-serif text-4xl font-bold text-primary mb-3">Shipping Information</h1>
          <p className="text-foreground/60 max-w-xl">
            Everything you need to know about how we produce and ship your order from {store.storeName}.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-14 max-w-3xl space-y-12">

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Production Time</h2>
          <p className="text-foreground/70 leading-relaxed">
            All posters at {store.storeName} are printed on demand. Once your order is placed, production
            typically takes <strong>2–5 business days</strong> before your order is dispatched. During
            peak periods (holidays, sales), this may be slightly longer.
          </p>
          <p className="text-sm text-muted-foreground mt-3 p-3 bg-sand/60 rounded-md border border-border">
            ✏️ <em>Edit this section before launch to reflect your actual print partner's lead times.</em>
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Delivery Time</h2>
          <p className="text-foreground/70 leading-relaxed mb-4">
            Estimated delivery times after dispatch:
          </p>
          <ul className="space-y-2 text-foreground/70">
            <li className="flex gap-3"><span className="font-medium w-48 shrink-0">European Union</span><span>3–7 business days</span></li>
            <li className="flex gap-3"><span className="font-medium w-48 shrink-0">United Kingdom</span><span>4–8 business days</span></li>
            <li className="flex gap-3"><span className="font-medium w-48 shrink-0">United States &amp; Canada</span><span>7–14 business days</span></li>
            <li className="flex gap-3"><span className="font-medium w-48 shrink-0">Rest of world</span><span>10–21 business days</span></li>
          </ul>
          <p className="text-sm text-muted-foreground mt-4 p-3 bg-sand/60 rounded-md border border-border">
            ✏️ <em>Update these estimates to match your fulfillment partner's published timeframes.</em>
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Shipping Countries</h2>
          <p className="text-foreground/70 leading-relaxed">
            We ship worldwide. If your country is not supported at checkout, please contact us and we
            will do our best to find a solution. Some remote destinations may incur additional handling fees.
          </p>
          <p className="text-sm text-muted-foreground mt-3 p-3 bg-sand/60 rounded-md border border-border">
            ✏️ <em>List the specific countries or regions you ship to, or confirm your fulfillment partner supports worldwide shipping.</em>
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Tracking</h2>
          <p className="text-foreground/70 leading-relaxed">
            Once your order has been dispatched, you will receive a shipping confirmation email with
            tracking information where available. Not all shipping methods or destinations include
            real-time tracking.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Damaged or Lost Shipments</h2>
          <p className="text-foreground/70 leading-relaxed">
            If your poster arrives damaged, please photograph the damage and contact us within
            <strong> 14 days</strong> of delivery. We will arrange a replacement or refund as quickly as
            possible.
          </p>
          <p className="text-foreground/70 leading-relaxed mt-3">
            If your order has not arrived within the estimated delivery window, please wait a few
            additional business days before contacting us — delays can sometimes occur at customs. If
            your parcel is confirmed lost, we will send a replacement at no extra cost.
          </p>
        </section>

      </div>
    </div>
  );
}

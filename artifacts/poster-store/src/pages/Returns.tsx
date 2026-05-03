import React, { useEffect, useState } from "react";
import { useStorefront } from "@/context/StorefrontContext";
import { fetchPublicContentPage, type AdminContentPage } from "@/lib/adminApi";

export default function Returns() {
  const store = useStorefront();
  const [contentPage, setContentPage] = useState<AdminContentPage | null>(null);

  useEffect(() => {
    fetchPublicContentPage(store.storeKey, "returns").then(data => {
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
          <h1 className="font-serif text-4xl font-bold text-primary mb-3">Returns &amp; Refunds</h1>
          <p className="text-foreground/60 max-w-xl">
            Our return policy for {store.storeName} orders.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-14 max-w-3xl space-y-12">

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Return Window</h2>
          <p className="text-foreground/70 leading-relaxed">
            If you are not satisfied with your order, please contact us within <strong>14 days</strong> of
            receiving your poster. We will review your case and work to find the best resolution.
          </p>
          <p className="text-sm text-muted-foreground mt-3 p-3 bg-sand/60 rounded-md border border-border">
            ✏️ <em>Adjust the return window to match your policy (e.g. 30 days) before launch.</em>
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Custom &amp; Print-on-Demand Limitations</h2>
          <p className="text-foreground/70 leading-relaxed">
            Because every poster at {store.storeName} is printed to order specifically for you, we are
            unable to accept returns or exchanges for reasons of buyer's remorse or incorrect size
            selection. Please review your cart carefully before placing your order.
          </p>
          <p className="text-foreground/70 leading-relaxed mt-3">
            We strongly encourage you to check the dimensions listed on each product page against the
            frame size you intend to use before purchasing.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Damaged Item Process</h2>
          <p className="text-foreground/70 leading-relaxed">
            If your poster arrives damaged or with a print defect, we will make it right. Please:
          </p>
          <ol className="mt-4 space-y-2 text-foreground/70 list-decimal list-inside">
            <li>Take a clear photograph of the damage or defect.</li>
            <li>Email us with the subject line "Damaged order — [your order number]".</li>
            <li>Attach the photo and a brief description.</li>
          </ol>
          <p className="text-foreground/70 leading-relaxed mt-4">
            We will respond within 2 business days and arrange a replacement or full refund at no
            additional cost to you.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Refund Timing</h2>
          <p className="text-foreground/70 leading-relaxed">
            Once a refund is approved, it will be returned to your original payment method. Please
            allow <strong>5–10 business days</strong> for the refund to appear depending on your bank
            or card provider.
          </p>
          <p className="text-sm text-muted-foreground mt-3 p-3 bg-sand/60 rounded-md border border-border">
            ✏️ <em>Confirm refund timing with your payment processor (Stripe) before launch.</em>
          </p>
        </section>

      </div>
    </div>
  );
}

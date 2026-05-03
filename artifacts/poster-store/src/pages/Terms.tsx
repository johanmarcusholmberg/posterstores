import React, { useEffect, useState } from "react";
import { useStorefront } from "@/context/StorefrontContext";
import { fetchPublicContentPage, type AdminContentPage } from "@/lib/adminApi";

export default function Terms() {
  const store = useStorefront();
  const [contentPage, setContentPage] = useState<AdminContentPage | null>(null);

  useEffect(() => {
    fetchPublicContentPage(store.storeKey, "terms").then(data => {
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
          <h1 className="font-serif text-4xl font-bold text-primary mb-3">Terms &amp; Conditions</h1>
          <p className="text-foreground/60 max-w-xl">
            The terms governing your use of {store.storeName}.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-14 max-w-3xl space-y-12">

        <div className="p-4 bg-sand/60 rounded-md border border-border text-sm text-muted-foreground">
          <strong>Note:</strong> This page contains placeholder content. It does not constitute legal
          advice. Please review and adapt these terms with qualified legal counsel before launching
          your store.
        </div>

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Use of This Site</h2>
          <p className="text-foreground/70 leading-relaxed">
            By accessing and using {store.storeName}, you agree to these terms. This site is intended
            for personal, non-commercial use. You may not reproduce, redistribute, or resell any
            content from this site without our prior written permission.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Product Images &amp; Color Variation</h2>
          <p className="text-foreground/70 leading-relaxed">
            We make every effort to display our products accurately. However, colors may appear
            slightly different on screen compared to the printed poster, depending on your monitor's
            calibration and settings. Slight color variation is inherent to the printing process and
            is not considered a defect.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Payment</h2>
          <p className="text-foreground/70 leading-relaxed">
            All prices on {store.storeName} are displayed in {store.defaultCurrency} unless otherwise
            stated. Payment is processed securely via Stripe. By placing an order, you authorize
            {" "}{store.storeName} to charge the total amount shown at checkout to your selected payment
            method.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Fulfillment</h2>
          <p className="text-foreground/70 leading-relaxed">
            All posters are printed on demand and fulfilled by our print partner. By placing an order,
            you acknowledge that production begins shortly after payment is confirmed. Because items
            are custom-produced, cancellations are only possible within a short window after ordering.
          </p>
          <p className="text-sm text-muted-foreground mt-3 p-3 bg-sand/60 rounded-md border border-border">
            ✏️ <em>Specify your cancellation window and name your fulfillment partner here before launch.</em>
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Limitation of Liability</h2>
          <p className="text-foreground/70 leading-relaxed">
            To the fullest extent permitted by law, {store.storeName} shall not be liable for any
            indirect, incidental, or consequential damages arising from your use of this site or
            the products purchased through it.
          </p>
          <p className="text-sm text-muted-foreground mt-3 p-3 bg-sand/60 rounded-md border border-border">
            ✏️ <em>This limitation clause should be reviewed by a legal professional to ensure it is valid in your jurisdiction.</em>
          </p>
        </section>

      </div>
    </div>
  );
}

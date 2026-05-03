import React, { useEffect, useState } from "react";
import { useStorefront } from "@/context/StorefrontContext";
import { fetchPublicContentPage, type AdminContentPage } from "@/lib/adminApi";

export default function Privacy() {
  const store = useStorefront();
  const [contentPage, setContentPage] = useState<AdminContentPage | null>(null);

  useEffect(() => {
    fetchPublicContentPage(store.storeKey, "privacy").then(data => {
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
          <h1 className="font-serif text-4xl font-bold text-primary mb-3">Privacy Policy</h1>
          <p className="text-foreground/60 max-w-xl">
            How {store.storeName} collects and uses your information.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-14 max-w-3xl space-y-12">

        <div className="p-4 bg-sand/60 rounded-md border border-border text-sm text-muted-foreground">
          <strong>Note:</strong> This page contains placeholder content. It does not constitute legal
          advice. Please review and adapt this policy with qualified legal counsel before launching
          your store.
        </div>

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">What Data We Collect</h2>
          <p className="text-foreground/70 leading-relaxed">
            When you interact with {store.storeName}, we may collect the following types of data:
          </p>
          <ul className="mt-4 space-y-2 text-foreground/70 list-disc list-inside">
            <li>Name and email address (when you create an account or place an order)</li>
            <li>Shipping address (for order fulfillment)</li>
            <li>Payment information (processed securely via Stripe — we do not store card details)</li>
            <li>Email address (if you subscribe to our newsletter)</li>
            <li>Browsing behavior on this website (via analytics, see below)</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Orders &amp; Payments</h2>
          <p className="text-foreground/70 leading-relaxed">
            Order information is collected to fulfill your purchase and provide customer support. Your
            shipping address is shared with our print and fulfillment partner solely for the purpose
            of delivering your order. Payment is processed by Stripe, Inc. We do not have access to
            your full card number.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Newsletter</h2>
          <p className="text-foreground/70 leading-relaxed">
            If you subscribe to our newsletter, we store your email address for the purpose of sending
            you updates about new poster releases, collections, and occasional promotions. You may
            unsubscribe at any time using the link included in every email.
          </p>
          <p className="text-sm text-muted-foreground mt-3 p-3 bg-sand/60 rounded-md border border-border">
            ✏️ <em>Name your email marketing provider (e.g. Mailchimp, Klaviyo) here before launch.</em>
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Cookies &amp; Analytics</h2>
          <p className="text-foreground/70 leading-relaxed">
            This site may use cookies and third-party analytics tools (such as Google Analytics) to
            understand how visitors use the site and to improve the shopping experience. No personally
            identifiable information is shared with analytics providers beyond what is necessary for
            aggregated reporting.
          </p>
          <p className="text-sm text-muted-foreground mt-3 p-3 bg-sand/60 rounded-md border border-border">
            ✏️ <em>Specify which analytics and cookie tools you use. Add a cookie consent banner if required for your target market (e.g. EU/GDPR).</em>
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Privacy Questions</h2>
          <p className="text-foreground/70 leading-relaxed">
            If you have any questions about this privacy policy or how your data is handled, please
            contact us. We will respond within a reasonable timeframe.
          </p>
          <p className="text-sm text-muted-foreground mt-3 p-3 bg-sand/60 rounded-md border border-border">
            ✏️ <em>Add your contact email address and data controller details (required under GDPR and similar regulations).</em>
          </p>
        </section>

      </div>
    </div>
  );
}

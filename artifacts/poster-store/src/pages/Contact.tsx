import React, { useEffect, useState } from "react";
import { useStorefront } from "@/context/StorefrontContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchPublicContentPage, type AdminContentPage } from "@/lib/adminApi";

export default function Contact() {
  const store = useStorefront();
  const [contentPage, setContentPage] = useState<AdminContentPage | null>(null);

  useEffect(() => {
    fetchPublicContentPage(store.storeKey, "contact").then(data => {
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
          <h1 className="font-serif text-4xl font-bold text-primary mb-3">Contact Us</h1>
          <p className="text-foreground/60 max-w-xl">
            Get in touch with the {store.storeName} team.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-14 max-w-3xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">

          <div className="space-y-8">
            <section>
              <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Order Support</h2>
              <p className="text-foreground/70 leading-relaxed">
                If you have a question about an existing order, please include your order number in
                your message so we can help you as quickly as possible.
              </p>
              <p className="text-foreground/70 leading-relaxed mt-3">
                We aim to respond to all enquiries within <strong>1–2 business days</strong>.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Email Us</h2>
              <p className="text-foreground/70 leading-relaxed">
                You can reach the {store.storeName} team at:
              </p>
              <p className="mt-3 p-3 bg-sand/60 rounded-md border border-border text-sm text-muted-foreground">
                ✏️ <em>Add your customer support email address here before launch (e.g. hello@yourdomain.com).</em>
              </p>
            </section>
          </div>

          <div>
            <h2 className="font-serif text-2xl font-bold text-foreground mb-6">Send a Message</h2>
            <p className="text-sm text-muted-foreground mb-6 p-3 bg-sand/60 rounded-md border border-border">
              ✏️ <em>This form is a placeholder. Connect it to a form submission service (e.g. Formspree, EmailJS) or your own API before launch.</em>
            </p>
            <form
              className="space-y-4"
              onSubmit={(e) => e.preventDefault()}
              data-testid="contact-form"
            >
              <div>
                <label className="block text-sm font-medium text-foreground mb-1" htmlFor="contact-name">
                  Name
                </label>
                <Input id="contact-name" placeholder="Your name" data-testid="contact-name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1" htmlFor="contact-email">
                  Email
                </label>
                <Input id="contact-email" type="email" placeholder="Your email" data-testid="contact-email" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1" htmlFor="contact-message">
                  Message
                </label>
                <textarea
                  id="contact-message"
                  data-testid="contact-message"
                  rows={5}
                  placeholder="How can we help?"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                />
              </div>
              <Button type="submit" className="w-full" data-testid="contact-submit">
                Send Message
              </Button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}

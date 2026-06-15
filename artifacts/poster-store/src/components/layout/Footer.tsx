import React from "react";
import { Link } from "wouter";
import { useStorefront } from "@/context/StorefrontContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSubscribeNewsletter } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";

const formSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export const Footer = () => {
  const store = useStorefront();
  const { toast } = useToast();
  const subscribe = useSubscribeNewsletter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    subscribe.mutate(
      { data: { email: values.email, storeKey: store.storeKey } },
      {
        onSuccess: () => {
          toast({
            title: "Subscribed!",
            description: "You've successfully joined our newsletter.",
          });
          form.reset();
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Something went wrong. Please try again.",
          });
        },
      }
    );
  };

  return (
    <footer className="bg-white border-t border-border mt-16 py-12">
      <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <h3 className="font-serif text-xl font-bold text-primary mb-4">{store.storeName}</h3>
          <p className="text-muted-foreground max-w-sm">
            {store.seo?.defaultDescription || `Art posters of ${store.countryFocus}.`}
          </p>
        </div>

        <div>
          <h4 className="font-medium text-foreground mb-3">Information</h4>
          <ul className="space-y-0 text-sm text-muted-foreground">
            <li><Link href="/about" className="block py-1.5 hover:text-primary transition-colors" data-testid="footer-link-about">About</Link></li>
            <li><Link href="/shipping" className="block py-1.5 hover:text-primary transition-colors" data-testid="footer-link-shipping">Shipping</Link></li>
            <li><Link href="/returns" className="block py-1.5 hover:text-primary transition-colors" data-testid="footer-link-returns">Returns</Link></li>
            <li><Link href="/contact" className="block py-1.5 hover:text-primary transition-colors" data-testid="footer-link-contact">Contact</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-medium text-foreground mb-3">Newsletter</h4>
          <p className="text-sm text-muted-foreground mb-4">
            {store.homepage.newsletterSubtitle || "Get updates on new releases."}
          </p>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input placeholder="Enter your email" {...field} data-testid="input-newsletter-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={subscribe.isPending} data-testid="button-newsletter-submit">
                Subscribe
              </Button>
            </form>
          </Form>
        </div>
      </div>

      <div className="container mx-auto px-4 mt-8 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <span>&copy; {new Date().getFullYear()} {store.storeName}. All rights reserved.</span>
        <div className="flex gap-4">
          <Link href="/privacy" className="hover:text-primary transition-colors" data-testid="footer-link-privacy">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-primary transition-colors" data-testid="footer-link-terms">Terms &amp; Conditions</Link>
        </div>
      </div>
    </footer>
  );
};

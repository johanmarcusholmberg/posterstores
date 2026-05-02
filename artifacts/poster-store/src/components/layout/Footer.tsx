import React from "react";
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
      <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h3 className="font-serif text-xl font-bold text-primary mb-4">{store.storeName}</h3>
          <p className="text-muted-foreground max-w-sm">
            {store.seo?.defaultDescription || `Art posters of ${store.countryFocus}.`}
          </p>
        </div>
        <div>
          <h4 className="font-medium text-foreground mb-2">
            {store.homepage.newsletterTitle || "Join our newsletter"}
          </h4>
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
      <div className="container mx-auto px-4 mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} {store.storeName}. All rights reserved.
      </div>
    </footer>
  );
};

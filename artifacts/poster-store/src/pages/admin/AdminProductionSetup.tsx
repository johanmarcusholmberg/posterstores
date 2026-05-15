import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { AdminDashboardLayout } from "@/components/admin/AdminDashboardLayout";
import { useAdminToken } from "@/context/AdminTokenContext";
import { adminGetStore, type AdminStore } from "@/lib/adminApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Globe,
  CreditCard,
  Webhook,
  Mail,
  ClipboardCheck,
  ShoppingCart,
  Rocket,
  ArrowRight,
  Images,
  ShoppingBag,
  LayoutTemplate,
  Package,
  Settings,
  Info,
  Terminal,
  CheckSquare,
  ExternalLink,
} from "lucide-react";

// ── Env var pill ──────────────────────────────────────────────────────────────

function EnvVar({ name }: { name: string }) {
  return (
    <code className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs font-mono text-foreground border">
      <Terminal className="w-3 h-3 text-muted-foreground shrink-0" />
      {name}
    </code>
  );
}

// ── Step item ─────────────────────────────────────────────────────────────────

function Step({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
        {number}
      </span>
      <div className="text-sm text-muted-foreground leading-relaxed flex-1">{children}</div>
    </div>
  );
}

// ── Checklist item ────────────────────────────────────────────────────────────

function ChecklistItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 items-start text-sm text-muted-foreground">
      <CheckSquare className="w-4 h-4 text-primary mt-0.5 shrink-0" />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

// ── Info note ─────────────────────────────────────────────────────────────────

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

function Section({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-6">
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="rounded-md bg-primary/10 p-1.5">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-4">{children}</CardContent>
    </Card>
  );
}

// ── Quick nav links ───────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { href: "/admin/launch-checklist", label: "Launch Checklist", icon: ClipboardCheck },
  { href: "/admin/stores", label: "Edit Store", icon: Settings },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/fulfillment", label: "Fulfillment", icon: Package },
  { href: "/admin/posters", label: "Posters", icon: Images },
  { href: "/admin/mockups", label: "Mockups", icon: LayoutTemplate },
];

// ── Table of contents ─────────────────────────────────────────────────────────

const TOC_SECTIONS = [
  { id: "domain", label: "Domain setup" },
  { id: "stripe", label: "Stripe setup" },
  { id: "stripe-webhook", label: "Stripe webhook" },
  { id: "email", label: "Email provider" },
  { id: "store-checklist", label: "Store checklist" },
  { id: "test-order", label: "Test order flow" },
  { id: "going-live", label: "Going live" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminProductionSetup() {
  const { adminStoreKey } = useAdminToken();
  const [store, setStore] = useState<AdminStore | null>(null);
  const [loadingStore, setLoadingStore] = useState(false);

  useEffect(() => {
    if (!adminStoreKey) return;
    setLoadingStore(true);
    adminGetStore(adminStoreKey)
      .then(setStore)
      .catch(() => setStore(null))
      .finally(() => setLoadingStore(false));
  }, [adminStoreKey]);

  const storeName = store?.name ?? adminStoreKey;
  const currency = store?.defaultCurrency ?? "—";
  const primaryDomain = store?.primaryDomain ?? null;
  const routePrefix = store?.routePrefix ?? null;

  const appUrl = primaryDomain
    ? `https://${primaryDomain}`
    : routePrefix
    ? `https://your-domain.com/${routePrefix}`
    : "https://your-domain.com";

  const storeUrl = routePrefix ? `${appUrl}/${routePrefix}` : appUrl;

  return (
    <AdminDashboardLayout
      title="Production Setup"
      breadcrumb={[
        { label: "Admin", href: "/admin" },
        { label: "Production Setup" },
      ]}
    >
      <div className="max-w-3xl space-y-6">

        {/* Header */}
        <div className="space-y-1">
          {loadingStore ? (
            <Skeleton className="h-5 w-64" />
          ) : (
            <p className="text-sm text-muted-foreground">
              Production setup guide for{" "}
              <span className="font-semibold text-foreground">{storeName}</span>
              {currency !== "—" && (
                <Badge variant="secondary" className="ml-2 text-xs">{currency}</Badge>
              )}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            This is an informational guide only. No configuration is changed here.
          </p>
        </div>

        {/* Quick links */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Quick links
          </h2>
          <div className="flex flex-wrap gap-2">
            {QUICK_LINKS.map(link => {
              const Icon = link.icon;
              return (
                <Link key={link.href} href={link.href}>
                  <div className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium bg-background hover:bg-muted transition-colors cursor-pointer">
                    <Icon className="w-3.5 h-3.5 text-primary" />
                    {link.label}
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Table of contents */}
        <Card className="bg-muted/40 border-dashed">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Contents</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              {TOC_SECTIONS.map(s => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="text-xs text-primary hover:underline"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── 1. Domain setup ── */}
        <Section id="domain" icon={Globe} title="Domain setup">
          <p className="text-sm text-muted-foreground">
            Point your custom domain to your deployed app and configure it in the store settings.
          </p>
          <div className="space-y-3">
            <Step number={1}>
              Purchase or transfer your domain (e.g.{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                {primaryDomain ?? "yourdomain.com"}
              </code>
              ) to a DNS provider like Cloudflare, Namecheap, or Google Domains.
            </Step>
            <Step number={2}>
              In your Replit deployment settings, add your custom domain and follow the CNAME/A record instructions provided.
            </Step>
            <Step number={3}>
              Set <EnvVar name="APP_BASE_URL" /> to your full domain:{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">{appUrl}</code>.
              This is used for Stripe redirect URLs and email links.
            </Step>
            {routePrefix && (
              <Step number={4}>
                This store uses the route prefix{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">/{routePrefix}</code>.
                Customers will access it at{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">{storeUrl}</code>.
              </Step>
            )}
            <Step number={routePrefix ? 5 : 4}>
              In Edit Store, set the{" "}
              <span className="font-medium text-foreground">Primary Domain</span>{" "}
              field to your domain so the store resolver can match incoming requests correctly.
            </Step>
          </div>
          <Note>
            Without <code>APP_BASE_URL</code>, Stripe checkout success/cancel redirects and customer email links will point to the wrong URL.
          </Note>
          <div className="pt-1">
            <Link href="/admin/stores">
              <span className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
                <Settings className="w-3.5 h-3.5" /> Edit Store settings
                <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          </div>
        </Section>

        {/* ── 2. Stripe setup ── */}
        <Section id="stripe" icon={CreditCard} title="Stripe setup">
          <p className="text-sm text-muted-foreground">
            Stripe Checkout is used for all payments.{" "}
            {currency !== "—" && (
              <>This store charges in <span className="font-medium text-foreground">{currency}</span>.</>
            )}{" "}
            Make sure your Stripe account is enabled for the currency used.
          </p>
          <div className="space-y-3">
            <Step number={1}>
              Log in to{" "}
              <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                dashboard.stripe.com <ExternalLink className="w-3 h-3" />
              </a>{" "}
              and switch to <span className="font-medium text-foreground">Live mode</span> (not Test mode).
            </Step>
            <Step number={2}>
              Go to <span className="font-medium text-foreground">Developers → API keys</span> and copy your{" "}
              <span className="font-medium text-foreground">Secret key</span> (starts with <code className="text-xs bg-muted px-1 rounded">sk_live_</code>).
            </Step>
            <Step number={3}>
              Set it as the environment variable: <EnvVar name="STRIPE_SECRET_KEY" />
            </Step>
            <Step number={4}>
              Verify your Stripe account is activated for payouts and the currency{" "}
              <span className="font-medium text-foreground">{currency}</span> is enabled under{" "}
              <span className="font-medium text-foreground">Settings → Business → Bank accounts and scheduling</span>.
            </Step>
          </div>
          <Note>
            Use <code>sk_test_</code> keys during development and <code>sk_live_</code> keys in production only. Never commit keys to source control.
          </Note>
          <div className="rounded-md border bg-muted/40 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Required env var</p>
            <EnvVar name="STRIPE_SECRET_KEY" />
          </div>
        </Section>

        {/* ── 3. Stripe webhook ── */}
        <Section id="stripe-webhook" icon={Webhook} title="Stripe webhook setup">
          <p className="text-sm text-muted-foreground">
            Stripe sends a webhook event when a payment is completed. This is how the app marks orders as paid and triggers confirmation emails.
          </p>
          <div className="space-y-3">
            <Step number={1}>
              In Stripe Dashboard go to{" "}
              <span className="font-medium text-foreground">Developers → Webhooks → Add endpoint</span>.
            </Step>
            <Step number={2}>
              Set the endpoint URL to:{" "}
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all">
                {appUrl}/api/stripe/webhook
              </code>
            </Step>
            <Step number={3}>
              Select these events to listen to:
              <ul className="mt-1.5 ml-2 space-y-0.5">
                <li><code className="text-xs bg-muted px-1 rounded">checkout.session.completed</code></li>
                <li><code className="text-xs bg-muted px-1 rounded">payment_intent.payment_failed</code></li>
              </ul>
            </Step>
            <Step number={4}>
              After creating the webhook, copy the{" "}
              <span className="font-medium text-foreground">Signing secret</span> (starts with <code className="text-xs bg-muted px-1 rounded">whsec_</code>).
            </Step>
            <Step number={5}>
              Set it as the environment variable: <EnvVar name="STRIPE_WEBHOOK_SECRET" />
            </Step>
          </div>
          <Note>
            Without the webhook, payments will complete on Stripe's side but orders in the admin will stay in{" "}
            <code>pending_payment</code> status and no confirmation emails will be sent.
          </Note>
          <div className="rounded-md border bg-muted/40 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Required env var</p>
            <EnvVar name="STRIPE_WEBHOOK_SECRET" />
          </div>
        </Section>

        {/* ── 4. Email provider ── */}
        <Section id="email" icon={Mail} title="Email provider setup">
          <p className="text-sm text-muted-foreground">
            Emails are sent when an order is paid — a confirmation to the customer and a notification to you.
            Without this, emails will only be logged to the server console.
          </p>
          <div className="space-y-3">
            <Step number={1}>
              Sign up for{" "}
              <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                Resend <ExternalLink className="w-3 h-3" />
              </a>{" "}
              (recommended) or another transactional email provider.
            </Step>
            <Step number={2}>
              Verify your sending domain in your email provider's dashboard (e.g.{" "}
              <code className="text-xs bg-muted px-1 rounded">
                {primaryDomain ?? "yourdomain.com"}
              </code>
              ).
            </Step>
            <Step number={3}>
              Create an API key in your provider and set:
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <EnvVar name="EMAIL_PROVIDER" />
                  <span className="text-xs text-muted-foreground">e.g. <code className="bg-muted px-1 rounded">resend</code></span>
                </div>
                <div className="flex items-center gap-2">
                  <EnvVar name="RESEND_API_KEY" />
                  <span className="text-xs text-muted-foreground">your Resend API key</span>
                </div>
              </div>
            </Step>
            <Step number={4}>
              Set the sender address and admin notification email:
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <EnvVar name="EMAIL_FROM" />
                  <span className="text-xs text-muted-foreground">
                    e.g.{" "}
                    <code className="bg-muted px-1 rounded">
                      orders@{primaryDomain ?? "yourdomain.com"}
                    </code>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <EnvVar name="ADMIN_ORDER_NOTIFICATION_EMAIL" />
                  <span className="text-xs text-muted-foreground">your email address for order alerts</span>
                </div>
              </div>
            </Step>
          </div>
          <Note>
            If <code>EMAIL_PROVIDER</code> is not set, the app runs in mock/log mode — emails are printed to the server console instead of being sent.
            This is fine for testing but must be configured for production.
          </Note>
          <div className="rounded-md border bg-muted/40 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Required env vars</p>
            <div className="flex flex-wrap gap-2">
              <EnvVar name="EMAIL_PROVIDER" />
              <EnvVar name="RESEND_API_KEY" />
              <EnvVar name="EMAIL_FROM" />
              <EnvVar name="ADMIN_ORDER_NOTIFICATION_EMAIL" />
            </div>
          </div>
        </Section>

        {/* ── 5. Store checklist ── */}
        <Section id="store-checklist" icon={ClipboardCheck} title="Store checklist">
          <p className="text-sm text-muted-foreground">
            Verify the store content is complete before going live. Use the full{" "}
            <Link href="/admin/launch-checklist">
              <span className="text-primary hover:underline cursor-pointer">Launch Checklist</span>
            </Link>{" "}
            for automatic checks.
          </p>
          <div className="space-y-2.5">
            <ChecklistItem>Store name, currency, and route prefix are configured in Edit Store.</ChecklistItem>
            <ChecklistItem>SEO title and description are set (Edit Store → SEO Config).</ChecklistItem>
            <ChecklistItem>Homepage hero title and subtitle are set (Edit Store → Homepage Config).</ChecklistItem>
            {primaryDomain ? (
              <ChecklistItem>
                Primary domain is set to{" "}
                <code className="text-xs bg-muted px-1 rounded">{primaryDomain}</code> in Edit Store.
              </ChecklistItem>
            ) : (
              <ChecklistItem>Primary domain is configured in Edit Store once your domain is ready.</ChecklistItem>
            )}
            <ChecklistItem>At least one published poster with a slug, preview image, and master print image.</ChecklistItem>
            <ChecklistItem>All published posters have at least one active size and price.</ChecklistItem>
            <ChecklistItem>Published posters have at least one mockup assigned, with a primary mockup set.</ChecklistItem>
            <ChecklistItem>Shipping, Returns, Privacy, Terms, Contact, and About pages are accessible.</ChecklistItem>
            <ChecklistItem>Admin API token is strong and securely stored: <EnvVar name="ADMIN_API_TOKEN" /></ChecklistItem>
          </div>
          <div className="pt-1 flex gap-3">
            <Link href="/admin/launch-checklist">
              <span className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
                <ClipboardCheck className="w-3.5 h-3.5" /> Run Launch Checklist
                <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
            <Link href="/admin/posters">
              <span className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
                <Images className="w-3.5 h-3.5" /> Manage Posters
                <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
            <Link href="/admin/mockups">
              <span className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
                <LayoutTemplate className="w-3.5 h-3.5" /> Manage Mockups
                <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          </div>
        </Section>

        {/* ── 6. Test order flow ── */}
        <Section id="test-order" icon={ShoppingCart} title="Test order flow">
          <p className="text-sm text-muted-foreground">
            Before going live, do at least one full test order using Stripe test mode.
          </p>
          <div className="space-y-3">
            <Step number={1}>
              Temporarily switch to a Stripe test key (<code className="text-xs bg-muted px-1 rounded">sk_test_</code>) and test webhook secret (<code className="text-xs bg-muted px-1 rounded">whsec_</code>) in your environment.
            </Step>
            <Step number={2}>
              Visit the store at{" "}
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all">{storeUrl}</code>,
              add a poster to cart, and proceed through checkout.
            </Step>
            <Step number={3}>
              Use Stripe's test card{" "}
              <code className="text-xs bg-muted px-1 rounded">4242 4242 4242 4242</code>{" "}
              with any future expiry and CVC to complete the payment.
            </Step>
            <Step number={4}>
              Verify the order appears as <span className="font-medium text-foreground">Paid</span> in the{" "}
              <Link href="/admin/orders">
                <span className="text-primary hover:underline cursor-pointer">Orders</span>
              </Link>{" "}
              page.
            </Step>
            <Step number={5}>
              Check that the customer received a confirmation email and you received an admin notification email.
            </Step>
            <Step number={6}>
              Open{" "}
              <Link href="/admin/fulfillment">
                <span className="text-primary hover:underline cursor-pointer">Fulfillment</span>
              </Link>{" "}
              and confirm the test order appears in the queue. Verify the master print file URL is accessible.
            </Step>
            <Step number={7}>
              Switch back to live Stripe keys once all tests pass.
            </Step>
          </div>
          <Note>
            Stripe test cards never charge real money. You can find more test card numbers at{" "}
            <a href="https://stripe.com/docs/testing" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              stripe.com/docs/testing
            </a>.
          </Note>
          <div className="pt-1 flex gap-3">
            <Link href="/admin/orders">
              <span className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
                <ShoppingBag className="w-3.5 h-3.5" /> View Orders
                <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
            <Link href="/admin/fulfillment">
              <span className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
                <Package className="w-3.5 h-3.5" /> Fulfillment Queue
                <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          </div>
        </Section>

        {/* ── 7. Going live ── */}
        <Section id="going-live" icon={Rocket} title="Going live checklist">
          <p className="text-sm text-muted-foreground">
            Final checks before making the store publicly accessible.
          </p>
          <div className="space-y-2.5">
            <ChecklistItem>
              <EnvVar name="STRIPE_SECRET_KEY" /> is a live key (<code className="text-xs bg-muted px-1 rounded">sk_live_</code>), not a test key.
            </ChecklistItem>
            <ChecklistItem>
              <EnvVar name="STRIPE_WEBHOOK_SECRET" /> is the live webhook signing secret from your live Stripe endpoint.
            </ChecklistItem>
            <ChecklistItem>
              <EnvVar name="APP_BASE_URL" /> is set to your production domain:{" "}
              <code className="text-xs bg-muted px-1 rounded break-all">{appUrl}</code>
            </ChecklistItem>
            <ChecklistItem>
              <EnvVar name="EMAIL_FROM" />, <EnvVar name="EMAIL_PROVIDER" />, and <EnvVar name="RESEND_API_KEY" /> are set. Your sending domain is verified.
            </ChecklistItem>
            <ChecklistItem>
              <EnvVar name="ADMIN_ORDER_NOTIFICATION_EMAIL" /> is set to your inbox.
            </ChecklistItem>
            <ChecklistItem>
              <EnvVar name="ADMIN_API_TOKEN" /> is a strong, unique secret — not a default or example value.
            </ChecklistItem>
            <ChecklistItem>Launch Checklist shows no Missing items.</ChecklistItem>
            <ChecklistItem>A test order completed successfully end-to-end (payment → paid status → fulfillment queue → emails).</ChecklistItem>
            <ChecklistItem>Mobile checkout tested on a real device or emulator.</ChecklistItem>
            <ChecklistItem>Custom domain is resolving correctly and SSL certificate is active.</ChecklistItem>
            <ChecklistItem>Store is set to <span className="font-medium text-foreground">Active</span> in Edit Store settings.</ChecklistItem>
          </div>
          <div className="rounded-md bg-green-50 border border-green-200 p-3 text-xs text-green-700 flex items-start gap-2">
            <Rocket className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Once all items above are checked, your store is ready to accept real orders. Share the URL{" "}
              <span className="font-mono font-semibold">{storeUrl}</span> with customers.
            </span>
          </div>
          <div className="pt-1 flex gap-3 flex-wrap">
            <Link href="/admin/launch-checklist">
              <span className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
                <ClipboardCheck className="w-3.5 h-3.5" /> Run Launch Checklist
                <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
            <Link href="/admin/stores">
              <span className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
                <Settings className="w-3.5 h-3.5" /> Edit Store
                <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          </div>
        </Section>

      </div>
    </AdminDashboardLayout>
  );
}

import React, { useEffect, useState, useCallback } from "react";
import { Link, useParams, useLocation } from "wouter";
import { AdminDashboardLayout } from "@/components/admin/AdminDashboardLayout";
import { useAdminToken } from "@/context/AdminTokenContext";
import {
  adminGetContentPage,
  adminUpsertContentPage,
  type AdminContentPage,
} from "@/lib/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save } from "lucide-react";

const PAGE_LABELS: Record<string, string> = {
  about: "About",
  shipping: "Shipping",
  returns: "Returns",
  privacy: "Privacy Policy",
  terms: "Terms & Conditions",
  contact: "Contact",
};

const VALID_PAGE_KEYS = ["about", "shipping", "returns", "privacy", "terms", "contact"];

export default function AdminContentPageEdit() {
  const params = useParams<{ pageKey: string }>();
  const pageKey = params.pageKey ?? "";
  const { adminStoreKey } = useAdminToken();
  const [, navigate] = useLocation();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [content, setContent] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [published, setPublished] = useState(false);

  const load = useCallback(() => {
    if (!pageKey) return;
    setLoading(true);
    setError("");
    adminGetContentPage(adminStoreKey, pageKey)
      .then(data => {
        if (data.exists) {
          setTitle(data.title ?? "");
          setSubtitle(data.subtitle ?? "");
          setContent(data.content ?? "");
          setMetaTitle(data.metaTitle ?? "");
          setMetaDescription(data.metaDescription ?? "");
          setPublished(data.published ?? false);
        }
      })
      .catch(e => setError(e?.message ?? "Failed to load page content"))
      .finally(() => setLoading(false));
  }, [adminStoreKey, pageKey]);

  useEffect(() => {
    if (!VALID_PAGE_KEYS.includes(pageKey)) {
      setError(`Invalid page key: "${pageKey}"`);
      return;
    }
    load();
  }, [load, pageKey]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await adminUpsertContentPage(adminStoreKey, pageKey, {
        title,
        subtitle: subtitle || null,
        content,
        metaTitle: metaTitle || null,
        metaDescription: metaDescription || null,
        published,
      });
      setSuccess("Saved successfully.");
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const pageLabel = PAGE_LABELS[pageKey] ?? pageKey;

  return (
    <AdminDashboardLayout
      title={`Edit: ${pageLabel}`}
      breadcrumb={[
        { label: "Admin", href: "/admin" },
        { label: "Content Pages", href: "/admin/content" },
        { label: pageLabel },
      ]}
    >
      <div className="max-w-2xl space-y-6">
        <div>
          <Link href="/admin/content">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground -ml-2">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Content Pages
            </Button>
          </Link>
        </div>

        {loading && (
          <div className="space-y-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}

        {!loading && (
          <form onSubmit={handleSave} className="space-y-5" data-testid="content-page-edit-form">

            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
                {success}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="page-title">Title</Label>
              <Input
                id="page-title"
                data-testid="content-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={`e.g. About ${adminStoreKey}`}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="page-subtitle">
                Subtitle <span className="text-muted-foreground font-normal text-xs">(optional)</span>
              </Label>
              <Input
                id="page-subtitle"
                data-testid="content-subtitle"
                value={subtitle}
                onChange={e => setSubtitle(e.target.value)}
                placeholder="Short description shown below the title"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="page-content">Content</Label>
              <textarea
                id="page-content"
                data-testid="content-body"
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={14}
                required
                placeholder="Write your page content here. Plain text or Markdown is supported."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Markdown is rendered on the public page (e.g. **bold**, ## Heading, - List item).
              </p>
            </div>

            <div className="space-y-4 rounded-lg border border-border p-4 bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SEO (optional)</p>

              <div className="space-y-1.5">
                <Label htmlFor="page-meta-title">Meta title</Label>
                <Input
                  id="page-meta-title"
                  data-testid="content-meta-title"
                  value={metaTitle}
                  onChange={e => setMetaTitle(e.target.value)}
                  placeholder="Page title for search engines"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="page-meta-description">Meta description</Label>
                <Input
                  id="page-meta-description"
                  data-testid="content-meta-description"
                  value={metaDescription}
                  onChange={e => setMetaDescription(e.target.value)}
                  placeholder="Short description for search engines (150–160 chars)"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-border p-4">
              <Switch
                id="page-published"
                data-testid="content-published-toggle"
                checked={published}
                onCheckedChange={setPublished}
              />
              <div>
                <Label htmlFor="page-published" className="cursor-pointer">
                  {published ? "Published" : "Draft"}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {published
                    ? "This content is live and visible to public visitors."
                    : "This content is saved as a draft. Public visitors see the fallback copy."}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={saving} data-testid="content-save-btn" className="gap-1.5">
                <Save className="w-4 h-4" />
                {saving ? "Saving…" : "Save"}
              </Button>
              <Link href="/admin/content">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>

          </form>
        )}
      </div>
    </AdminDashboardLayout>
  );
}

import React, { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useAdminToken } from "@/context/AdminTokenContext";
import { adminListPosters, adminDeletePoster, adminGetPosterMeta, type AdminPoster } from "@/lib/adminApi";
import { AdminStatusBadge } from "./AdminStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search, Star, Sparkles, RefreshCw, AlertTriangle, ImageOff, Tag } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const LIMIT = 25;

function getReadinessIssues(poster: AdminPoster): string[] {
  const issues: string[] = [];
  if (!poster.masterPrintImageUrl) issues.push("Missing master file");
  const sizes = poster.posterSizes ?? [];
  const activeSizes = sizes.filter(s => s.active);
  if (sizes.length === 0 || activeSizes.length === 0) issues.push("No active size");
  if (poster.status === "draft") issues.push("Draft");
  return issues;
}

export const AdminPosterList = () => {
  const { adminStoreKey } = useAdminToken();
  const { toast } = useToast();

  const [posters, setPosters] = useState<AdminPoster[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);

  useEffect(() => {
    if (!adminStoreKey) return;
    adminGetPosterMeta(adminStoreKey)
      .then(meta => {
        setCategories(meta.categories);
        setRegions(meta.regions);
      })
      .catch(() => {});
  }, [adminStoreKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminListPosters(adminStoreKey, {
        status: statusFilter === "all" ? "all" : statusFilter,
        search: search || undefined,
        category: categoryFilter === "all" ? undefined : categoryFilter,
        region: regionFilter === "all" ? undefined : regionFilter,
        limit: LIMIT,
        offset,
      });
      setPosters(data.posters);
      setTotal(data.total);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load posters");
    } finally {
      setLoading(false);
    }
  }, [adminStoreKey, statusFilter, categoryFilter, regionFilter, search, offset]);

  useEffect(() => {
    setOffset(0);
  }, [adminStoreKey, statusFilter, categoryFilter, regionFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const handleDelete = async (poster: AdminPoster) => {
    try {
      await adminDeletePoster(poster.id, poster.storeKey);
      toast({ title: "Poster deleted", description: poster.title });
      load();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder="Search posters..."
                  className="h-8 pl-8 w-48 text-sm"
                  data-testid="poster-search"
                />
              </div>
              <Button type="submit" variant="outline" size="sm" className="h-8">Search</Button>
            </form>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-32 text-sm" data-testid="status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>

            {categories.length > 0 && (
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-8 w-36 text-sm" data-testid="category-filter">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {regions.length > 0 && (
              <Select value={regionFilter} onValueChange={setRegionFilter}>
                <SelectTrigger className="h-8 w-36 text-sm" data-testid="region-filter">
                  <SelectValue placeholder="All regions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All regions</SelectItem>
                  {regions.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={load}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>

          <Link href="/admin/posters/new">
            <Button size="sm" className="gap-1.5 h-8" data-testid="create-poster-btn">
              <Plus className="w-4 h-4" />
              New poster
            </Button>
          </Link>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="rounded-md border bg-background overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="w-14">Image</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="hidden lg:table-cell">ID</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead className="hidden lg:table-cell">Region / City</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Flags</TableHead>
                <TableHead className="hidden md:table-cell">Readiness</TableHead>
                <TableHead className="hidden lg:table-cell">Updated</TableHead>
                <TableHead className="w-20 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : posters.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground text-sm py-12">
                    No posters found.
                  </TableCell>
                </TableRow>
              ) : (
                posters.map(poster => {
                  const readinessIssues = getReadinessIssues(poster);
                  return (
                    <TableRow key={poster.id} data-testid={`poster-row-${poster.id}`}>
                      <TableCell>
                        {poster.imageUrl ? (
                          <img
                            src={poster.imageUrl}
                            alt={poster.title}
                            className="w-10 h-10 object-cover rounded border"
                            onError={e => { (e.target as HTMLImageElement).style.opacity = "0.2"; }}
                          />
                        ) : (
                          <div className="w-10 h-10 bg-muted rounded border" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-sm max-w-[160px] truncate">
                        {poster.title}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        #{poster.id}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {poster.category}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {[poster.region, poster.city].filter(Boolean).join(" / ") || "—"}
                      </TableCell>
                      <TableCell>
                        <AdminStatusBadge status={poster.status} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-1">
                          {poster.isFeatured && (
                            <span title="Featured"><Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" /></span>
                          )}
                          {poster.isNew && (
                            <span title="New arrival"><Sparkles className="w-3.5 h-3.5 text-blue-500" /></span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell" data-testid={`readiness-${poster.id}`}>
                        {readinessIssues.length === 0 ? (
                          <span className="text-xs text-green-600 font-medium">Ready</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {readinessIssues.map(issue => (
                              <Tooltip key={issue}>
                                <TooltipTrigger asChild>
                                  <Badge
                                    variant="outline"
                                    className="text-xs px-1.5 py-0 border-amber-300 text-amber-700 bg-amber-50 cursor-default gap-1"
                                    data-testid={`readiness-badge-${poster.id}`}
                                  >
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    {issue === "Missing master file" && <ImageOff className="w-2.5 h-2.5" />}
                                    {issue === "No active size" && <Tag className="w-2.5 h-2.5" />}
                                    <span>{issue}</span>
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs max-w-[200px]">
                                  {issue === "Missing master file" && "No high-resolution print file uploaded. Add one before launch."}
                                  {issue === "No active size" && "No active sizes defined. Customers won't be able to buy this poster."}
                                  {issue === "Draft" && "This poster is not visible to customers. Publish it when ready."}
                                </TooltipContent>
                              </Tooltip>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {new Date(poster.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <Link href={`/admin/posters/${poster.id}`}>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" data-testid={`edit-poster-${poster.id}`}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete" data-testid={`delete-poster-${poster.id}`}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete poster?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete <strong>{poster.title}</strong>. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(poster)}
                                  className="bg-destructive hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {total > LIMIT && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

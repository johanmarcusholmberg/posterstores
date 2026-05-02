import React, { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useAdminToken } from "@/context/AdminTokenContext";
import { adminListPosters, adminDeletePoster, type AdminPoster } from "@/lib/adminApi";
import { AdminStatusBadge } from "./AdminStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search, Star, Sparkles, RefreshCw } from "lucide-react";
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

export const AdminPosterList = () => {
  const { token, adminStoreKey } = useAdminToken();
  const { toast } = useToast();

  const [posters, setPosters] = useState<AdminPoster[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const data = await adminListPosters(token, adminStoreKey, {
        status: statusFilter === "all" ? "all" : statusFilter,
        search: search || undefined,
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
  }, [token, adminStoreKey, statusFilter, search, offset]);

  useEffect(() => {
    setOffset(0);
  }, [adminStoreKey, statusFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const handleDelete = async (poster: AdminPoster) => {
    if (!token) return;
    try {
      await adminDeletePoster(token, poster.id, poster.storeKey);
      toast({ title: "Poster deleted", description: poster.title });
      load();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
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
              <TableHead className="hidden lg:table-cell">Updated</TableHead>
              <TableHead className="w-20 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : posters.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground text-sm py-12">
                  No posters found.
                </TableCell>
              </TableRow>
            ) : (
              posters.map(poster => (
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
              ))
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
  );
};

import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Star, StarOff, X, Plus, ImageIcon, Loader2 } from "lucide-react";
import {
  type PosterMockup,
  adminDeletePosterMockup,
  adminSetPrimaryMockup,
} from "@/lib/mockupApi";

interface AdminMockupEditorProps {
  posterId: number;
  storeKey: string;
  token: string;
  mockups: PosterMockup[];
  onMockupsChange: (mockups: PosterMockup[]) => void;
}

export function AdminMockupEditor({
  posterId,
  storeKey,
  token,
  mockups,
  onMockupsChange,
}: AdminMockupEditorProps) {
  const { toast } = useToast();
  const [urlInput, setUrlInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [settingPrimaryId, setSettingPrimaryId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = async () => {
    const url = urlInput.trim();
    if (!url) return;
    try {
      new URL(url);
    } catch {
      toast({ variant: "destructive", title: "Invalid URL", description: "Please enter a valid image URL." });
      return;
    }

    setAdding(true);
    try {
      const isPrimary = mockups.length === 0;
      const res = await fetch(
        `/api/posters/${posterId}/mockups?storeKey=${encodeURIComponent(storeKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Admin-Token": token },
          body: JSON.stringify({ mockupImageUrl: url, isPrimary, sortOrder: mockups.length }),
        }
      );
      if (!res.ok) throw new Error("Failed to add mockup");
      const created: PosterMockup = await res.json();
      onMockupsChange([...mockups, created]);
      setUrlInput("");
      inputRef.current?.focus();
    } catch {
      toast({ variant: "destructive", title: "Failed to add mockup image" });
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (mockup: PosterMockup) => {
    setRemovingId(mockup.id);
    try {
      await adminDeletePosterMockup(token, posterId, mockup.id, storeKey);
      const remaining = mockups.filter(m => m.id !== mockup.id);
      if (mockup.isPrimary && remaining.length > 0) {
        remaining[0] = { ...remaining[0], isPrimary: true };
      }
      onMockupsChange(remaining);
    } catch {
      toast({ variant: "destructive", title: "Failed to remove mockup image" });
    } finally {
      setRemovingId(null);
    }
  };

  const handleSetPrimary = async (mockup: PosterMockup) => {
    if (mockup.isPrimary) return;
    setSettingPrimaryId(mockup.id);
    try {
      await adminSetPrimaryMockup(token, posterId, mockup.id, storeKey);
      onMockupsChange(mockups.map(m => ({ ...m, isPrimary: m.id === mockup.id })));
    } catch {
      toast({ variant: "destructive", title: "Failed to set primary image" });
    } finally {
      setSettingPrimaryId(null);
    }
  };

  return (
    <div className="space-y-4">
      {mockups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30 py-8 text-center">
          <ImageIcon className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No mockup images yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Add lifestyle images showing the poster in a room setting</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {mockups.map(mockup => {
            const imgUrl = mockup.mockupImageUrl ?? mockup.template?.previewThumbnailUrl ?? "";
            const isRemoving = removingId === mockup.id;
            const isSettingPrimary = settingPrimaryId === mockup.id;

            return (
              <div
                key={mockup.id}
                className={`relative group rounded-lg overflow-hidden border-2 transition-colors ${
                  mockup.isPrimary ? "border-primary" : "border-transparent hover:border-border"
                }`}
              >
                <div className="aspect-[3/4] bg-muted">
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt="Mockup"
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                  )}
                </div>

                {mockup.isPrimary && (
                  <div className="absolute top-1.5 left-1.5 bg-primary text-primary-foreground text-[10px] font-semibold px-1.5 py-0.5 rounded">
                    Primary
                  </div>
                )}

                <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!mockup.isPrimary && (
                    <button
                      type="button"
                      title="Set as primary"
                      onClick={() => handleSetPrimary(mockup)}
                      disabled={isSettingPrimary}
                      className="w-7 h-7 rounded bg-background/90 shadow flex items-center justify-center hover:bg-background transition-colors"
                    >
                      {isSettingPrimary ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      ) : (
                        <Star className="h-3.5 w-3.5 text-amber-500" />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    title="Remove"
                    onClick={() => handleRemove(mockup)}
                    disabled={isRemoving}
                    className="w-7 h-7 rounded bg-background/90 shadow flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
                  >
                    {isRemoving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          placeholder="Paste image URL…"
          className="text-sm h-9"
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
          disabled={adding}
        />
        <Button
          type="button"
          size="sm"
          className="h-9 gap-1.5 shrink-0"
          onClick={handleAdd}
          disabled={adding || !urlInput.trim()}
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Hover a thumbnail to reveal the star (set primary) and remove buttons.
      </p>
    </div>
  );
}

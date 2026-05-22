import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Star, X, Plus, ImageIcon, Loader2, MousePointerClick, Image } from "lucide-react";
import {
  type PosterMockup,
  adminDeletePosterMockup,
  adminSetPrimaryMockup,
  adminClearPrimaryMockup,
  adminSetHoverMockup,
  adminClearHoverMockup,
} from "@/lib/mockupApi";

interface AdminMockupEditorProps {
  posterId: number;
  storeKey: string;
  posterImageUrl: string;
  mockups: PosterMockup[];
  onMockupsChange: (mockups: PosterMockup[]) => void;
}

export function AdminMockupEditor({
  posterId,
  storeKey,
  posterImageUrl,
  mockups,
  onMockupsChange,
}: AdminMockupEditorProps) {
  const { toast } = useToast();
  const [urlInput, setUrlInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [settingPrimaryId, setSettingPrimaryId] = useState<number | "poster" | null>(null);
  const [settingHoverId, setSettingHoverId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasPrimaryMockup = mockups.some(m => m.isPrimary);

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
      const res = await fetch(
        `/api/posters/${posterId}/mockups?storeKey=${encodeURIComponent(storeKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ mockupImageUrl: url, isPrimary: false, sortOrder: mockups.length }),
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
      await adminDeletePosterMockup(posterId, mockup.id, storeKey);
      const remaining = mockups.filter(m => m.id !== mockup.id);
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
      await adminSetPrimaryMockup(posterId, mockup.id, storeKey);
      onMockupsChange(mockups.map(m => ({ ...m, isPrimary: m.id === mockup.id })));
    } catch {
      toast({ variant: "destructive", title: "Failed to set primary image" });
    } finally {
      setSettingPrimaryId(null);
    }
  };

  const handleUsePosterImage = async () => {
    if (!hasPrimaryMockup) return;
    setSettingPrimaryId("poster");
    try {
      await adminClearPrimaryMockup(posterId, storeKey);
      onMockupsChange(mockups.map(m => ({ ...m, isPrimary: false })));
      toast({ title: "Poster image set as primary" });
    } catch {
      toast({ variant: "destructive", title: "Failed to update primary image" });
    } finally {
      setSettingPrimaryId(null);
    }
  };

  const handleSetHover = async (mockup: PosterMockup) => {
    setSettingHoverId(mockup.id);
    try {
      if (mockup.isHoverMockup) {
        await adminClearHoverMockup(posterId, storeKey);
        onMockupsChange(mockups.map(m => ({ ...m, isHoverMockup: false })));
        toast({ title: "Hover mockup cleared" });
      } else {
        await adminSetHoverMockup(posterId, mockup.id, storeKey);
        onMockupsChange(mockups.map(m => ({ ...m, isHoverMockup: m.id === mockup.id })));
        toast({ title: "Hover mockup set" });
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to update hover mockup" });
    } finally {
      setSettingHoverId(null);
    }
  };

  const isPosterPrimaryLoading = settingPrimaryId === "poster";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* Poster image card — always first, selected when no mockup is primary */}
        <div
          className={`relative rounded-lg overflow-hidden border-2 transition-colors ${
            !hasPrimaryMockup ? "border-primary" : "border-transparent hover:border-border"
          }`}
        >
          <div className="aspect-[3/4] bg-muted">
            {posterImageUrl ? (
              <img
                src={posterImageUrl}
                alt="Poster image"
                className="w-full h-full object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Image className="h-8 w-8 text-muted-foreground/30" />
              </div>
            )}
          </div>

          <div className="absolute top-1.5 left-1.5">
            {!hasPrimaryMockup && (
              <div className="bg-primary text-primary-foreground text-[10px] font-semibold px-1.5 py-0.5 rounded">
                Primary
              </div>
            )}
          </div>

          {hasPrimaryMockup && (
            <div className="absolute inset-0 flex items-end justify-center pb-2 opacity-0 hover:opacity-100 transition-opacity bg-black/0 hover:bg-black/10">
              <button
                type="button"
                onClick={handleUsePosterImage}
                disabled={isPosterPrimaryLoading}
                className="bg-background/95 text-foreground text-[10px] font-semibold px-2 py-1 rounded shadow hover:bg-background transition-colors"
              >
                {isPosterPrimaryLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Use poster image"
                )}
              </button>
            </div>
          )}

          <div className="absolute bottom-0 left-0 right-0 bg-background/80 text-[10px] text-center py-0.5 text-muted-foreground font-medium">
            Poster image
          </div>
        </div>

        {/* Mockup cards */}
        {mockups.map(mockup => {
          const imgUrl = mockup.mockupImageUrl ?? mockup.template?.previewThumbnailUrl ?? "";
          const isRemoving = removingId === mockup.id;
          const isSettingPrimary = settingPrimaryId === mockup.id;
          const isSettingHover = settingHoverId === mockup.id;

          return (
            <div
              key={mockup.id}
              className={`relative group rounded-lg overflow-hidden border-2 transition-colors ${
                mockup.isPrimary ? "border-primary" : mockup.isHoverMockup ? "border-amber-400" : "border-transparent hover:border-border"
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

              <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
                {mockup.isPrimary && (
                  <div className="bg-primary text-primary-foreground text-[10px] font-semibold px-1.5 py-0.5 rounded">
                    Primary
                  </div>
                )}
                {mockup.isHoverMockup && (
                  <div className="bg-amber-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
                    Hover
                  </div>
                )}
              </div>

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
                  title={mockup.isHoverMockup ? "Clear hover mockup" : "Set as shop hover mockup"}
                  onClick={() => handleSetHover(mockup)}
                  disabled={isSettingHover}
                  className={`w-7 h-7 rounded bg-background/90 shadow flex items-center justify-center hover:bg-background transition-colors ${
                    mockup.isHoverMockup ? "ring-1 ring-amber-400" : ""
                  }`}
                >
                  {isSettingHover ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <MousePointerClick className={`h-3.5 w-3.5 ${mockup.isHoverMockup ? "text-amber-500" : "text-muted-foreground"}`} />
                  )}
                </button>
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
        Hover a mockup thumbnail to reveal controls: <Star className="inline h-3 w-3 text-amber-500" /> = set as primary display, <MousePointerClick className="inline h-3 w-3 text-muted-foreground" /> = shop card hover image. The <strong>Poster image</strong> card is primary by default — hover it to restore it.
      </p>
    </div>
  );
}

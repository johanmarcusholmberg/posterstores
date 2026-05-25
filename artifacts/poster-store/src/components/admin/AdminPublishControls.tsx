import React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AdminStatusBadge } from "./AdminStatusBadge";
import type { PosterStatus } from "@/lib/adminApi";

interface AdminPublishControlsProps {
  status: PosterStatus;
  isFeatured: boolean;
  isNew: boolean;
  isCollectionBanner: boolean;
  onStatusChange: (s: PosterStatus) => void;
  onFeaturedChange: (v: boolean) => void;
  onNewChange: (v: boolean) => void;
  onCollectionBannerChange: (v: boolean) => void;
  canPublish: boolean;
  publishBlockReasons?: string[];
}

export const AdminPublishControls = ({
  status,
  isFeatured,
  isNew,
  isCollectionBanner,
  onStatusChange,
  onFeaturedChange,
  onNewChange,
  onCollectionBannerChange,
  canPublish,
  publishBlockReasons = [],
}: AdminPublishControlsProps) => {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Publication Status</Label>
        <div className="flex items-center gap-3">
          <Select
            value={status}
            onValueChange={val => {
              if (val === "published" && !canPublish) return;
              onStatusChange(val as PosterStatus);
            }}
          >
            <SelectTrigger className="w-40" data-testid="field-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published" disabled={!canPublish}>
                Published
              </SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <AdminStatusBadge status={status} />
        </div>

        {!canPublish && publishBlockReasons.length > 0 && (
          <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 space-y-1">
            <p className="text-xs font-medium text-yellow-800">
              Poster cannot be published until:
            </p>
            <ul className="text-xs text-yellow-700 list-disc list-inside space-y-0.5">
              {publishBlockReasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Visibility flags</Label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox
              checked={isFeatured}
              onCheckedChange={v => onFeaturedChange(Boolean(v))}
              data-testid="field-isFeatured"
            />
            <span className="text-sm">Show on homepage featured row</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox
              checked={isNew}
              onCheckedChange={v => onNewChange(Boolean(v))}
              data-testid="field-isNew"
            />
            <span className="text-sm">New arrival</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox
              checked={isCollectionBanner}
              onCheckedChange={v => onCollectionBannerChange(Boolean(v))}
              data-testid="field-isCollectionBanner"
            />
            <span className="text-sm">Show in collection banner strip</span>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Up to 3 posters marked for the collection banner will appear as the image strip beside the collection banner text. Falls back to featured posters if none are selected.
        </p>
      </div>
    </div>
  );
};

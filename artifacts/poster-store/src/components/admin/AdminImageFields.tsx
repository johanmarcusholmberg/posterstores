import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Image } from "lucide-react";

interface AdminImageFieldsProps {
  imageUrl: string;
  onImageUrlChange: (val: string) => void;
}

export const AdminImageFields = ({ imageUrl, onImageUrlChange }: AdminImageFieldsProps) => {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="imageUrl">
          Preview / Master Image URL <span className="text-destructive">*</span>
        </Label>
        <Input
          id="imageUrl"
          placeholder="https://example.com/poster.jpg"
          value={imageUrl}
          onChange={e => onImageUrlChange(e.target.value)}
          data-testid="field-imageUrl"
        />
        {imageUrl && (
          <div className="mt-2 rounded-md border overflow-hidden w-32 h-32 bg-muted flex items-center justify-center">
            <img
              src={imageUrl}
              alt="Preview"
              className="object-contain w-full h-full"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        )}
      </div>

      <Alert variant="default" className="border-amber-200 bg-amber-50 text-amber-900">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-xs">
          <strong>Note on image fields:</strong> Currently, this field serves as both the preview image
          and the master printable file URL. In a future phase, separate fields for{" "}
          <em>master printable image</em> (high-res production file) and{" "}
          <em>preview/mockup image</em> (presentation asset) will be added.
          File upload support will also be added when storage is configured.
        </AlertDescription>
      </Alert>
    </div>
  );
};

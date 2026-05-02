import React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, X, Info } from "lucide-react";

interface AdminSizePriceEditorProps {
  sizes: string[];
  onSizesChange: (sizes: string[]) => void;
}

export const AdminSizePriceEditor = ({ sizes, onSizesChange }: AdminSizePriceEditorProps) => {
  const handleAdd = () => {
    onSizesChange([...sizes, ""]);
  };

  const handleChange = (i: number, val: string) => {
    const updated = [...sizes];
    updated[i] = val;
    onSizesChange(updated);
  };

  const handleRemove = (i: number) => {
    onSizesChange(sizes.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-3">
      <Alert variant="default" className="border-blue-200 bg-blue-50 text-blue-900">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-xs">
          <strong>Future: Structured size/price editor.</strong> A future phase will support
          structured size rows (size label, width cm, height cm, price, currency, active toggle).
          For now, enter size labels as text (e.g. "A4", "A3", "50×70") that will be shown to
          customers at checkout.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label>Size Labels</Label>
        {sizes.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={s}
              onChange={e => handleChange(i, e.target.value)}
              placeholder="e.g. A4, A3, 50×70 cm"
              className="h-8 text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => handleRemove(i)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1 text-xs h-8"
          onClick={handleAdd}
        >
          <Plus className="w-3.5 h-3.5" />
          Add size
        </Button>
      </div>
    </div>
  );
};

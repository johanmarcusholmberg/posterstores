import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, GripVertical, AlertCircle } from "lucide-react";

export interface SizeRow {
  sizeLabel: string;
  price: number | null;
  currency: string;
  active: boolean;
  sortOrder: number;
}

interface AdminSizePriceEditorProps {
  sizes: SizeRow[];
  defaultCurrency?: string;
  onSizesChange: (sizes: SizeRow[]) => void;
  errors?: string[];
}

const QUICK_SIZES = ["A4", "A3", "A2", "30x40", "50x70", "70x100"];
const CURRENCIES = ["EUR", "SEK", "USD", "GBP"];

export function buildDefaultSizeRows(currency = "EUR"): SizeRow[] {
  return [
    { sizeLabel: "A4", price: null, currency, active: true, sortOrder: 0 },
    { sizeLabel: "A3", price: null, currency, active: true, sortOrder: 1 },
    { sizeLabel: "50x70", price: null, currency, active: true, sortOrder: 2 },
  ];
}


export const AdminSizePriceEditor = ({
  sizes,
  defaultCurrency = "EUR",
  onSizesChange,
  errors = [],
}: AdminSizePriceEditorProps) => {
  const update = (i: number, patch: Partial<SizeRow>) => {
    const updated = [...sizes];
    updated[i] = { ...updated[i], ...patch };
    onSizesChange(updated);
  };

  const remove = (i: number) => {
    onSizesChange(sizes.filter((_, idx) => idx !== i));
  };

  const addQuick = (label: string) => {
    if (sizes.some(s => s.sizeLabel === label)) return;
    onSizesChange([
      ...sizes,
      { sizeLabel: label, price: null, currency: defaultCurrency, active: true, sortOrder: sizes.length },
    ]);
  };


  return (
    <div className="space-y-4">
      {errors.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <ul className="space-y-0.5">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-xs text-muted-foreground font-medium mr-1">Quick add:</span>
        {QUICK_SIZES.map(label => {
          const exists = sizes.some(s => s.sizeLabel === label);
          return (
            <Button
              key={label}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2 gap-1"
              onClick={() => addQuick(label)}
              disabled={exists}
            >
              <Plus className="w-3 h-3" />
              {label}
            </Button>
          );
        })}
      </div>

      {sizes.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-[20px_1fr_110px_80px_50px_30px] gap-2 items-center text-xs text-muted-foreground font-medium px-1">
            <span></span>
            <span>Size</span>
            <span>Price <span className="text-destructive">*</span></span>
            <span>Currency</span>
            <span>Active</span>
            <span></span>
          </div>

          {sizes.map((row, i) => (
            <div
              key={i}
              className={`grid grid-cols-[20px_1fr_110px_80px_50px_30px] gap-2 items-center rounded-md border px-2 py-2 ${
                row.active ? "border-border bg-background" : "border-border/50 bg-muted/30 opacity-70"
              }`}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground/50 cursor-grab" />

              <span
                className="inline-flex items-center px-2.5 py-1 rounded-md bg-muted text-sm font-medium text-foreground select-none w-fit"
                data-testid={`size-label-${i}`}
              >
                {row.sizeLabel}
              </span>

              <Input
                type="number"
                min="0"
                step="0.01"
                value={row.price ?? ""}
                onChange={e => update(i, { price: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="0.00"
                className="h-8 text-sm"
                data-testid={`size-price-${i}`}
              />

              <Select value={row.currency} onValueChange={val => update(i, { currency: val })}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>

              <div className="flex justify-center">
                <Switch
                  checked={row.active}
                  onCheckedChange={val => update(i, { active: val })}
                  data-testid={`size-active-${i}`}
                />
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => remove(i)}
                data-testid={`size-remove-${i}`}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {sizes.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No sizes yet. Use the quick-add buttons above.</p>
      )}
    </div>
  );
};

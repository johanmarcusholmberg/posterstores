import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, GripVertical, AlertCircle } from "lucide-react";

export interface SizeRow {
  sizeLabel: string;
  widthCm: number | null;
  heightCm: number | null;
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

const QUICK_SIZES: { label: string; widthCm: number; heightCm: number }[] = [
  { label: "A4", widthCm: 21, heightCm: 29.7 },
  { label: "A3", widthCm: 29.7, heightCm: 42 },
  { label: "A2", widthCm: 42, heightCm: 59.4 },
  { label: "30x40", widthCm: 30, heightCm: 40 },
  { label: "50x70", widthCm: 50, heightCm: 70 },
];

const CURRENCIES = ["EUR", "SEK", "USD", "GBP"];

export function buildDefaultSizeRows(currency = "EUR"): SizeRow[] {
  return [
    { sizeLabel: "A4", widthCm: 21, heightCm: 29.7, price: null, currency, active: true, sortOrder: 0 },
    { sizeLabel: "A3", widthCm: 29.7, heightCm: 42, price: null, currency, active: true, sortOrder: 1 },
    { sizeLabel: "50x70", widthCm: 50, heightCm: 70, price: null, currency, active: true, sortOrder: 2 },
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

  const addBlank = () => {
    onSizesChange([
      ...sizes,
      {
        sizeLabel: "",
        widthCm: null,
        heightCm: null,
        price: null,
        currency: defaultCurrency,
        active: true,
        sortOrder: sizes.length,
      },
    ]);
  };

  const addQuick = (qs: typeof QUICK_SIZES[0]) => {
    const alreadyExists = sizes.some(s => s.sizeLabel === qs.label);
    if (alreadyExists) return;
    onSizesChange([
      ...sizes,
      {
        sizeLabel: qs.label,
        widthCm: qs.widthCm,
        heightCm: qs.heightCm,
        price: null,
        currency: defaultCurrency,
        active: true,
        sortOrder: sizes.length,
      },
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
        {QUICK_SIZES.map(qs => {
          const exists = sizes.some(s => s.sizeLabel === qs.label);
          return (
            <Button
              key={qs.label}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2 gap-1"
              onClick={() => addQuick(qs)}
              disabled={exists}
            >
              <Plus className="w-3 h-3" />
              {qs.label}
            </Button>
          );
        })}
      </div>

      {sizes.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-[20px_1fr_80px_80px_100px_80px_50px_30px] gap-2 items-center text-xs text-muted-foreground font-medium px-1">
            <span></span>
            <span>Label <span className="text-destructive">*</span></span>
            <span>W (cm)</span>
            <span>H (cm)</span>
            <span>Price <span className="text-destructive">*</span></span>
            <span>Currency</span>
            <span>Active</span>
            <span></span>
          </div>

          {sizes.map((row, i) => (
            <div
              key={i}
              className={`grid grid-cols-[20px_1fr_80px_80px_100px_80px_50px_30px] gap-2 items-center rounded-md border px-2 py-2 ${
                row.active ? "border-border bg-background" : "border-border/50 bg-muted/30 opacity-70"
              }`}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground/50 cursor-grab" />

              <Input
                value={row.sizeLabel}
                onChange={e => update(i, { sizeLabel: e.target.value })}
                placeholder="e.g. A3"
                className="h-8 text-sm"
                data-testid={`size-label-${i}`}
              />

              <Input
                type="number"
                min="0"
                step="0.1"
                value={row.widthCm ?? ""}
                onChange={e => update(i, { widthCm: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="—"
                className="h-8 text-sm"
              />

              <Input
                type="number"
                min="0"
                step="0.1"
                value={row.heightCm ?? ""}
                onChange={e => update(i, { heightCm: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="—"
                className="h-8 text-sm"
              />

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
        <p className="text-xs text-muted-foreground italic">No sizes yet. Use quick-add buttons or add a custom size.</p>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1 text-xs h-8"
        onClick={addBlank}
        data-testid="add-custom-size-btn"
      >
        <Plus className="w-3.5 h-3.5" />
        Add custom size
      </Button>
    </div>
  );
};

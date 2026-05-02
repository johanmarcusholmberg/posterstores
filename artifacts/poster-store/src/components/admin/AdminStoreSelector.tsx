import React from "react";
import { useAdminToken } from "@/context/AdminTokenContext";
import { storefronts } from "@/config/storefronts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Store } from "lucide-react";
import { useLocation } from "wouter";

export const AdminStoreSelector = () => {
  const { adminStoreKey, setAdminStoreKey } = useAdminToken();
  const [, navigate] = useLocation();
  const storeOptions = Object.values(storefronts);

  const handleChange = (newKey: string) => {
    setAdminStoreKey(newKey);
    navigate("/admin");
  };

  return (
    <div className="flex items-center gap-2">
      <Store className="w-4 h-4 text-muted-foreground shrink-0" />
      <Select value={adminStoreKey} onValueChange={handleChange}>
        <SelectTrigger className="h-8 w-44 text-sm" data-testid="admin-store-selector">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {storeOptions.map(store => (
            <SelectItem key={store.storeKey} value={store.storeKey}>
              {store.storeName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

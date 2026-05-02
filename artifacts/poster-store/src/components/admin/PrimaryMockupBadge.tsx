import React from "react";
import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";

export const PrimaryMockupBadge = () => (
  <Badge className="gap-1 text-[10px] bg-amber-500 text-white hover:bg-amber-500">
    <Star className="w-2.5 h-2.5 fill-white" />
    Primary
  </Badge>
);

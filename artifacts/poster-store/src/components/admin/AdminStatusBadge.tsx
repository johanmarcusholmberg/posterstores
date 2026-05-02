import React from "react";
import { cn } from "@/lib/utils";
import type { PosterStatus } from "@/lib/adminApi";

const STATUS_CONFIG: Record<PosterStatus, { label: string; classes: string }> = {
  published: { label: "Published", classes: "bg-green-100 text-green-800 border-green-200" },
  draft: { label: "Draft", classes: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  archived: { label: "Archived", classes: "bg-gray-100 text-gray-600 border-gray-200" },
};

export const AdminStatusBadge = ({ status }: { status: PosterStatus | string }) => {
  const config = STATUS_CONFIG[status as PosterStatus] ?? { label: status, classes: "bg-gray-100 text-gray-600 border-gray-200" };
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium", config.classes)}>
      {config.label}
    </span>
  );
};

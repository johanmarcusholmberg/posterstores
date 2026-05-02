import React, { useEffect, useState } from "react";
import { useAdminToken } from "@/context/AdminTokenContext";
import {
  listMockupTemplates,
  adminUpdateMockupTemplate,
  type MockupTemplate,
} from "@/lib/mockupApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { LayoutTemplate, Globe, Store } from "lucide-react";

interface AdminMockupTemplateListProps {
  storeKey: string;
}

export const AdminMockupTemplateList = ({
  storeKey,
}: AdminMockupTemplateListProps) => {
  const { token } = useAdminToken();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<MockupTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    listMockupTemplates(storeKey)
      .then(setTemplates)
      .catch((e) =>
        toast({
          title: "Failed to load templates",
          description: e?.message,
          variant: "destructive",
        })
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [storeKey]);

  const toggleActive = async (template: MockupTemplate) => {
    if (!token) return;
    setToggling(template.id);
    try {
      const updated = await adminUpdateMockupTemplate(token, template.id, {
        active: !template.active,
      });
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (e: any) {
      toast({
        title: "Failed to update template",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <LayoutTemplate className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>No mockup templates found.</p>
      </div>
    );
  }

  const globalTemplates = templates.filter((t) => t.storeKey === null);
  const storeTemplates = templates.filter((t) => t.storeKey !== null);

  const renderGroup = (list: MockupTemplate[], label: string) => {
    if (list.length === 0) return null;
    return (
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
          {label}
        </h3>
        <div className="rounded-md border divide-y">
          {list.map((template) => (
            <div
              key={template.id}
              className="flex items-center gap-3 px-4 py-3"
              data-testid={`template-row-${template.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{template.name}</span>
                  {template.storeKey === null ? (
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <Globe className="w-2.5 h-2.5" />
                      Global
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Store className="w-2.5 h-2.5" />
                      {template.storeKey}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {template.frameType}
                  </Badge>
                  {!template.active && (
                    <Badge variant="destructive" className="text-[10px]">
                      Inactive
                    </Badge>
                  )}
                </div>
                {template.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {template.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-muted-foreground">
                  #{template.sortOrder}
                </span>
                <Switch
                  checked={template.active}
                  onCheckedChange={() => toggleActive(template)}
                  disabled={toggling === template.id}
                  aria-label={`Toggle ${template.name}`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {renderGroup(globalTemplates, "Global templates")}
      {renderGroup(storeTemplates, `Templates for ${storeKey}`)}
    </div>
  );
};

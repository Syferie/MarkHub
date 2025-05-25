import { useMemo } from "react";
import { Badge, Button, Text } from "@mantine/core";
import { Folder } from "@/lib/schemas";

interface ActiveFiltersDisplayProps {
  selectedFolderId: string | null;
  selectedTags: string[];
  folders: Folder[]; // Or pass folderName directly if preferred
  setSelectedFolderId: (id: string | null) => void;
  setSelectedTags: (tags: string[]) => void;
  setActiveTab?: (tab: string) => void; // Optional, as it was used in one place
  t: (key: string) => string;
}

export default function ActiveFiltersDisplay({
  selectedFolderId,
  selectedTags,
  folders,
  setSelectedFolderId,
  setSelectedTags,
  setActiveTab,
  t,
}: ActiveFiltersDisplayProps) {
  const folderName = useMemo(() => {
    if (!selectedFolderId || !Array.isArray(folders)) return null;
    const folder = folders.find((f) => f && f.id === selectedFolderId);
    return folder ? folder.name : null;
  }, [selectedFolderId, folders]);

  const hasActiveFilters = selectedFolderId || (Array.isArray(selectedTags) && selectedTags.length > 0);

  if (!hasActiveFilters) {
    return (
      <div className="mb-3 flex flex-wrap items-center gap-2 min-h-[32px]">
        <span className="text-sm text-gray-400">{t("dashboard.noFilters")}</span>
      </div>
    );
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 min-h-[32px]">
      <span className="text-sm text-gray-500">{t("dashboard.filteredBy")}</span>

      {folderName && (
        <Badge color="blue" variant="light" size="lg">
          {t("dashboard.folder")} {folderName}
        </Badge>
      )}

      {Array.isArray(selectedTags) &&
        selectedTags.map((tag) => (
          <Badge key={tag} color="green" variant="light" size="lg">
            {t("dashboard.tag")} {tag}
          </Badge>
        ))}

      <Button
        variant="subtle"
        size="xs"
        onClick={() => {
          setSelectedFolderId(null);
          setSelectedTags([]);
          if (setActiveTab) {
            setActiveTab("all"); // Reset active tab to "all"
          }
        }}
      >
        {t("dashboard.clearFilters")}
      </Button>
    </div>
  );
}
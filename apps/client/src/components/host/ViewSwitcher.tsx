import { cn } from "@qr-relay/ui/cn";
import { Flame, GitBranch, LayoutGrid, ListOrdered, Users } from "lucide-react";

export type HostViewMode = "overview" | "rankings" | "token-path" | "infection" | "participants";

type Props = {
  mode: HostViewMode;
  onChange: (next: HostViewMode) => void;
};

type Option = {
  id: HostViewMode;
  label: string;
  Icon: typeof LayoutGrid;
};

const OPTIONS: Option[] = [
  { id: "overview", label: "概要", Icon: LayoutGrid },
  { id: "rankings", label: "ランキング", Icon: ListOrdered },
  { id: "token-path", label: "経路", Icon: GitBranch },
  { id: "infection", label: "保持", Icon: Flame },
  { id: "participants", label: "参加者", Icon: Users },
];

/**
 * Segmented control sitting at the top of HostDashboard. Switches the
 * grid-template-areas without unmounting tiles — see HostDashboard's mode
 * styles. Each option is a button so keyboard / screen-reader users land
 * naturally in the tablist; aria-pressed marks the active mode.
 */
export function ViewSwitcher({ mode, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="表示の切替"
      className={cn(
        "flex h-full min-h-0 items-center gap-1 rounded-[var(--radius-md)]",
        "border border-white/10 bg-white/[0.03] px-1.5",
      )}
    >
      {OPTIONS.map(({ id, label, Icon }) => {
        const active = id === mode;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`host-view-${id}`}
            onClick={() => onChange(id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1.5",
              "text-[12px] font-extrabold uppercase tracking-[0.14em] transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-[var(--shadow-cta-primary)]"
                : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
            )}
          >
            <Icon aria-hidden size={14} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

import { useNavigate } from "react-router-dom";

import { AppIcon } from "@/ui/Icon";

interface BottomNavProps {
  active: "quotes" | "customers" | "settings";
}

const tabs = [
  {
    key: "quotes",
    label: "Quotes",
    icon: "description",
    path: "/",
  },
  {
    key: "customers",
    label: "Customers",
    icon: "group",
    path: "/customers",
  },
  {
    key: "settings",
    label: "Settings",
    icon: "settings",
    path: "/settings",
  },
] as const;

export function BottomNav({ active }: BottomNavProps): React.ReactElement {
  const navigate = useNavigate();

  return (
    <nav className="safe-bottom glass-surface-strong glass-shadow-bottom fixed bottom-0 z-50 flex w-full justify-around border-t border-outline-variant/20 py-2.5 backdrop-blur-md">
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => navigate(tab.path)}
            className={`cursor-pointer flex flex-col items-center gap-0.5 text-xs font-medium ${
              isActive ? "text-primary" : "text-outline"
            }`}
          >
            <span
              className={`flex items-center justify-center rounded-full px-4 py-0.5 transition-colors ${
                isActive ? "bg-primary/20" : ""
              }`}
            >
              <AppIcon name={tab.icon} className="text-xl" strokeWidth={isActive ? 2.5 : 2} />
            </span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

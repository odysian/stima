import { useNavigate } from "react-router-dom";

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
    <nav className="glass-surface-strong glass-shadow-bottom fixed bottom-0 z-50 flex w-full justify-around border-t border-outline-variant/20 py-3 backdrop-blur-md">
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
              className={`flex items-center justify-center rounded-full px-4 py-1 transition-colors ${
                isActive ? "bg-primary/10" : ""
              }`}
            >
              <span className={`material-symbols-outlined ${isActive ? "material-symbols-filled" : ""}`}>
                {tab.icon}
              </span>
            </span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

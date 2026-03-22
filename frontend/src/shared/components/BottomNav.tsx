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
    <nav className="fixed bottom-0 w-full bg-white/80 backdrop-blur-md shadow-[0_0_24px_rgba(13,28,46,0.04)] flex justify-around py-3 z-50">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => navigate(tab.path)}
          className={`flex flex-col items-center gap-0.5 text-xs font-medium ${
            active === tab.key ? "text-primary" : "text-outline"
          }`}
        >
          <span className="material-symbols-outlined">{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

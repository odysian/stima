(() => {
  const storageKey = "stima-theme";
  const darkMediaQuery = "(prefers-color-scheme: dark)";
  const darkBackground = "#0b1013";
  const darkForeground = "#eef2ef";
  const lightBackground = "#f8f9ff";
  const lightForeground = "#0d1c2e";
  const validPreferences = new Set(["system", "light", "dark"]);

  let savedPreference = "system";

  try {
    const storedValue = window.localStorage.getItem(storageKey);
    if (storedValue && validPreferences.has(storedValue)) {
      savedPreference = storedValue;
    } else if (storedValue) {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    savedPreference = "system";
  }

  const systemTheme =
    typeof window.matchMedia === "function" && window.matchMedia(darkMediaQuery).matches
      ? "dark"
      : "light";
  const effectiveTheme = savedPreference === "system" ? systemTheme : savedPreference;
  const root = document.documentElement;

  if (savedPreference === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.dataset.theme = effectiveTheme;
  }
  root.style.colorScheme = effectiveTheme;
  root.style.backgroundColor = effectiveTheme === "dark" ? darkBackground : lightBackground;
  root.style.color = effectiveTheme === "dark" ? darkForeground : lightForeground;
})();

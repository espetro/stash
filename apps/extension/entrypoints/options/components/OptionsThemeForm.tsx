import ThemeSwitcher, { ThemeSwitcherProps } from "./ThemeSwitcher";

interface Props extends ThemeSwitcherProps {}

export default function OptionsThemeForm(props: Props) {
  return (
    <>
      <h2 id="theme-heading" className="settings-section-title">
        Appearance
      </h2>
      <p className="settings-section-description">Choose how Stash looks on your device.</p>
      <div className="form-group">
        <span className="form-label">Theme</span>
        <ThemeSwitcher {...props} />
      </div>
    </>
  );
}

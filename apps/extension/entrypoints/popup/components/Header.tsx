import { ComponentProps } from "react";
import { LuClock, LuCog } from "react-icons/lu";

interface HeaderProps {
  onClickHistory: ComponentProps<"button">["onClick"];
  onClickSettings: ComponentProps<"button">["onClick"];
}

export default function Header({ onClickHistory, onClickSettings }: HeaderProps) {
  return (
    <div className="popup-header">
      <h1>Stash</h1>

      {/* Action buttons */}
      <div className="header-buttons">
        <button
          className="theme-toggle"
          onClick={onClickHistory}
          aria-label="View history"
          title="History"
        >
          <LuClock />
        </button>
        <button
          className="theme-toggle"
          onClick={onClickSettings}
          aria-label="Open settings"
          title="Settings"
        >
          <LuCog />
        </button>
      </div>
    </div>
  );
}

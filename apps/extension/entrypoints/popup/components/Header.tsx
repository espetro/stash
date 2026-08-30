import { ComponentProps } from "react";
import { LuArchive, LuArrowLeft, LuCog } from "react-icons/lu";

interface HeaderProps {
  onClickStashes: ComponentProps<"button">["onClick"];
  onClickSettings: ComponentProps<"button">["onClick"];
  onBack?: () => void;
}

export default function Header({ onClickStashes, onClickSettings, onBack }: HeaderProps) {
  return (
    <div className="popup-header">
      <div className="header-left">
        {onBack && (
          <button
            className="theme-toggle header-back"
            onClick={onBack}
            aria-label="Go back"
            title="Go back"
          >
            <LuArrowLeft />
          </button>
        )}
        <h1>Stash</h1>
      </div>

      {/* Action buttons */}
      <div className="header-buttons">
        <button
          className="theme-toggle"
          onClick={onClickStashes}
          aria-label="View my stashes"
          title="My Stashes"
        >
          <LuArchive />
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

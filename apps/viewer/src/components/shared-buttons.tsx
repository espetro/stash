import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FaChevronDown } from "react-icons/fa6";

interface PrimaryButtonProps extends React.ComponentProps<typeof Button> {
  children: React.ReactNode;
}

export function PrimaryButton({ className, children, ...props }: PrimaryButtonProps) {
  return (
    <Button
      className={cn(
        "h-14 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60",
        className,
      )}
      {...props}
    >
      {children}
    </Button>
  );
}

interface OutlineButtonProps extends React.ComponentProps<typeof Button> {
  children: React.ReactNode;
}

export function OutlineButton({ className, children, ...props }: OutlineButtonProps) {
  return (
    <Button
      variant="outline"
      className={cn(
        "h-14 w-full rounded-xl border-border bg-card text-base font-semibold text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </Button>
  );
}

interface SplitButtonGroupProps {
  mainLabel: string;
  onMainClick: () => void;
  onDropdownClick: () => void;
  mainClassName?: string;
  dropdownClassName?: string;
}

export function SplitButtonGroup({
  mainLabel,
  onMainClick,
  onDropdownClick,
  mainClassName,
  dropdownClassName,
}: SplitButtonGroupProps) {
  return (
    <div className="flex h-14 rounded-xl overflow-hidden">
      <Button
        onClick={onMainClick}
        className={cn(
          "h-14 flex-1 rounded-r-none bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60",
          mainClassName,
        )}
      >
        {mainLabel}
      </Button>
      <Button
        onClick={onDropdownClick}
        className={cn(
          "h-14 rounded-l-none border-l-0 bg-primary px-3 hover:bg-primary/90",
          dropdownClassName,
        )}
      >
        <FaChevronDown className="size-5" />
      </Button>
    </div>
  );
}

import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

interface SharedCardProps extends React.ComponentProps<typeof Card> {
  children: React.ReactNode;
}

export function SharedCard({ className, children, ...props }: SharedCardProps) {
  return (
    <Card
      className={cn(
        "flex w-full max-w-160 flex-col rounded-[2rem] border border-border bg-card shadow-xl shadow-black/4",
        className,
      )}
      {...props}
    >
      {children}
    </Card>
  );
}

interface SharedCardHeaderProps {
  title: string;
  caption?: string;
  titleClassName?: string;
  captionClassName?: string;
}

export function SharedCardHeader({
  title,
  caption,
  titleClassName,
  captionClassName,
}: SharedCardHeaderProps) {
  return (
    <CardHeader className="shrink-0 flex flex-col items-center justify-center gap-1 pb-2 pt-6 text-center sm:pt-8">
      <CardTitle
        className={cn(
          "text-xl font-semibold tracking-tight text-card-foreground sm:text-2xl",
          titleClassName,
        )}
      >
        {title}
      </CardTitle>
      {caption && (
        <CardDescription
          className={cn(
            "leading-none text-xs font-semibold uppercase tracking-widest text-muted-foreground",
            captionClassName,
          )}
        >
          {caption}
        </CardDescription>
      )}
    </CardHeader>
  );
}

interface SharedCardContentProps extends React.ComponentProps<typeof CardContent> {
  children: React.ReactNode;
}

export function SharedCardContent({ className, children, ...props }: SharedCardContentProps) {
  return (
    <CardContent
      className={cn("flex flex-col gap-4 px-3 pb-3 sm:px-5 sm:pb-5", className)}
      {...props}
    >
      {children}
    </CardContent>
  );
}

interface SharedButtonAreaProps {
  children: React.ReactNode;
  className?: string;
}

export function SharedButtonArea({ children, className }: SharedButtonAreaProps) {
  return (
    <div className={cn("mt-4 flex w-full max-w-160 flex-col gap-3 px-3 sm:px-5", className)}>
      {children}
    </div>
  );
}

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
    <div className="flex h-14 rounded-xl">
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
        <ChevronDown className="size-5" />
      </Button>
    </div>
  );
}

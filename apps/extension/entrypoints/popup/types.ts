export interface PopupTab {
  id: number;
  index: number;
  url: string;
  title: string;
  faviconUrl: string;
  domain: string;
  isSelected: boolean;
}

export interface PopupState {
  tabs: PopupTab[];
  isLoading: boolean;
  error: string | null;
  budgetInfo: {
    used: number;
    max: number;
    count: number;
  };
}

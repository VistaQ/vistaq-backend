export type PointCategory = 'prospect' | 'sales' | 'coaching';

export interface IAgentPointsBreakdownItem {
  id: string;
  date: string;
  category: PointCategory;
  action: string;
  subject: string | null;
  points: number;
}

export interface IAgentPointsResponse {
  total: number;
  categories: Record<PointCategory, number>;
  breakdown: IAgentPointsBreakdownItem[];
  pagination: {
    page: number;
    limit: number;
    total_count: number;
    total_pages: number;
  };
}

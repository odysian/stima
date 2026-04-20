export interface LineItemCatalogItem {
  id: string;
  title: string;
  details: string | null;
  defaultPrice: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface LineItemCatalogCreateRequest {
  title: string;
  details: string | null;
  defaultPrice: number | null;
}

export interface LineItemCatalogUpdateRequest {
  title?: string;
  details?: string | null;
  defaultPrice?: number | null;
}
